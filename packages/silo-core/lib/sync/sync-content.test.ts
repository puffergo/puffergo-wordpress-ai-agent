import { describe, expect, it } from 'vitest';
import { WpClient } from '../wp/client';
import { emptyWorkspace } from '../model/factory';
import type { ContentItem } from '../model/types';
import type { HttpRequest, HttpResponse, NetworkPort } from '../ports/network';
import { syncContent } from './sync-content';
import { membershipWs } from '../model/membership.fixture';

/** A WP site with NO SEO plugin and no PufferGo plugin: no SEO route exists, everything else is a plain core site. */
function siteWithoutRankMath() {
  const calls: string[] = [];
  const net: NetworkPort = {
    async request(r: HttpRequest): Promise<HttpResponse> {
      calls.push(`${r.method} ${r.url.replace('https://x.test/wp-json', '')}`);
      if (r.url.includes('/rankmath/') || r.url.includes('/puffergo/'))
        return { status: 404, json: { code: 'rest_no_route', message: 'No route' } };
      if (r.method === 'POST' && r.url.endsWith('/wp/v2/posts')) {
        return { status: 201, json: { id: 101, modified: 'm', modified_gmt: 'g1', status: 'draft' } };
      }
      return { status: 200, json: { modified_gmt: 'g2' } };
    },
  };
  return { calls, client: new WpClient(net, { siteUrl: 'https://x.test', username: 'u', appPassword: 'p' }) };
}

const item: ContentItem = {
  id: 'c1',
  siloNodeId: 'n1',
  postType: 'post',
  title: 'T',
  wpPostId: null,
  seoSyncedAt: null,
  lastModifiedRemote: null,
  seo: { title: 'An SEO title', description: 'desc', coreKeywords: ['kw'], longTailKeywords: [] },
};

describe('syncContent on a site without Rank Math', () => {
  it('strict (default, the extension): fails the push even though the post was already created', async () => {
    const { calls, client } = siteWithoutRankMath();
    const res = await syncContent(client, emptyWorkspace({ name: 's', url: 'https://x.test' }), item, {
      syncCategories: false,
    });

    expect(calls).toContain('POST /wp/v2/posts');
    expect(res).toEqual({ ok: false, conflict: false, error: 'No route' });
  });

  it('seoBestEffort: keeps the created post id (no duplicate on retry) and reports the SEO skip', async () => {
    const { client } = siteWithoutRankMath();
    const res = await syncContent(client, emptyWorkspace({ name: 's', url: 'https://x.test' }), item, {
      syncCategories: false,
      seoBestEffort: true,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.patch.wpPostId).toBe(101);
    expect(res.patch.lastModifiedRemote).toBe('g2');
    expect(res.seoWarning).toMatch(/Rank Math/);
    // SEO wasn't written, so it must not be marked as synced.
    expect(res.patch.seoSyncedAt).toBeUndefined();
  });
});

/** A core WP site (Rank Math present) that records every request and knows a few categories. */
function siteWithCategories(existing: Array<{ id: number; name: string; parent: number }>) {
  const calls: Array<{ method: string; url: string; body?: unknown }> = [];
  let nextId = 500;
  const net: NetworkPort = {
    async request(r: HttpRequest): Promise<HttpResponse> {
      const url = r.url.replace('https://x.test/wp-json', '');
      calls.push({ method: r.method, url, body: r.body });
      if (r.method === 'GET' && url.startsWith('/wp/v2/categories')) {
        const q = new URL(`https://x${url}`).searchParams;
        const parent = Number(q.get('parent'));
        const search = (q.get('search') ?? '').toLowerCase();
        return {
          status: 200,
          json: existing.filter(
            t => t.parent === parent && t.name.replace(/&amp;/g, '&').toLowerCase().includes(search),
          ),
        };
      }
      if (r.method === 'POST' && url === '/wp/v2/categories') return { status: 201, json: { id: nextId++ } };
      if (r.method === 'POST' && url === '/wp/v2/posts') {
        return { status: 201, json: { id: 101, modified: 'm', modified_gmt: 'g1', status: 'draft' } };
      }
      return { status: 200, json: { modified_gmt: 'g2' } };
    },
  };
  // No discovered contentTypes: the category's taxonomy must come from the tree.
  return { calls, client: new WpClient(net, { siteUrl: 'https://x.test', username: 'u', appPassword: 'p' }) };
}

const postBody = (calls: Array<{ method: string; url: string; body?: unknown }>) =>
  calls.find(c => c.method === 'POST' && c.url === '/wp/v2/posts')?.body as Record<string, unknown>;

describe('syncContent category placement', () => {
  it("files a never-pushed item under its node's known WP category, without searching by name", async () => {
    const { calls, client } = siteWithCategories([]);
    const ws = membershipWs();
    const res = await syncContent(client, ws, { ...item, siloNodeId: 'F' });

    expect(res.ok).toBe(true);
    expect(postBody(calls).categories).toEqual([10]);
    expect(calls.some(c => c.url.startsWith('/wp/v2/categories'))).toBe(false);
  });

  it('adds the placement category to known termIds instead of ignoring the tree', async () => {
    const { calls, client } = siteWithCategories([]);
    await syncContent(client, membershipWs(), { ...item, siloNodeId: 'B', termIds: [99] });
    expect(postBody(calls).categories).toEqual([99, 20]);
  });

  it('creates a missing category under its known parent, matching names exactly (search is fuzzy)', async () => {
    const { calls, client } = siteWithCategories([{ id: 7, name: 'C &amp; more', parent: 10 }]);
    await syncContent(client, membershipWs(), { ...item, siloNodeId: 'C' });

    expect(calls.find(c => c.method === 'GET' && c.url.startsWith('/wp/v2/categories'))?.url).toContain('parent=10');
    expect(calls.find(c => c.method === 'POST' && c.url === '/wp/v2/categories')?.body).toEqual({
      name: 'C',
      parent: 10,
    });
    expect(postBody(calls).categories).toEqual([500]);
  });

  it('reuses an existing category whose escaped name matches exactly', async () => {
    const ws = membershipWs();
    ws.nodes = ws.nodes.map(n => (n.id === 'C' ? { ...n, term: 'R & D' } : n));
    const { calls, client } = siteWithCategories([{ id: 7, name: 'R &amp; D', parent: 10 }]);
    await syncContent(client, ws, { ...item, siloNodeId: 'C' });
    expect(calls.some(c => c.method === 'POST' && c.url === '/wp/v2/categories')).toBe(false);
    expect(postBody(calls).categories).toEqual([7]);
  });
});

describe('syncContent never overwrites a body made of blocks', () => {
  function site(raw: string) {
    const calls: string[] = [];
    const net: NetworkPort = {
      async request(r: HttpRequest): Promise<HttpResponse> {
        calls.push(`${r.method} ${r.url.replace('https://x.test/wp-json', '')}`);
        if (r.url.includes('context=edit')) return { status: 200, json: { content: { raw } } };
        if (r.method === 'POST') return { status: 200, json: { id: 7, modified_gmt: 'g1', status: 'draft' } };
        return { status: 200, json: { modified_gmt: 'g0', status: 'draft' } };
      },
    };
    return { calls, client: new WpClient(net, { siteUrl: 'https://x.test', username: 'u', appPassword: 'p' }) };
  }
  const pushed: ContentItem = { ...item, wpPostId: 7, lastModifiedRemote: 'g0' };
  const ws = emptyWorkspace({ name: 's', url: 'https://x.test' });

  it('refuses, even with force, and writes nothing', async () => {
    const { calls, client } = site('<!-- wp:puffergo/tailwind-container {"content":"x"} /-->');
    const res = await syncContent(client, ws, pushed, { syncCategories: false, force: true, content: '<p>new</p>' });
    expect(res).toMatchObject({ ok: false, conflict: false });
    expect(calls.some(c => c.startsWith('POST'))).toBe(false);
  });

  it('a plain HTML body (written from Markdown before) is updated', async () => {
    const { calls, client } = site('<p>old</p>');
    const res = await syncContent(client, ws, pushed, {
      syncCategories: false,
      seoBestEffort: true,
      content: '<p>new</p>',
    });
    expect(res.ok).toBe(true);
    expect(calls).toContain('POST /wp/v2/posts/7');
  });
});
