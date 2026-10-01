import { describe, expect, it } from 'vitest';
import { WpClient } from '../wp/client';
import { emptyWorkspace } from '../model/factory';
import type { ContentItem } from '../model/types';
import type { HttpRequest, HttpResponse, NetworkPort } from '../ports/network';
import { syncContent } from './sync-content';
import { membershipWs } from '../model/membership.fixture';

const ABILITY = '/wp-abilities/v1/abilities/puffergo';

/** Recorded request: method + abilities-relative (or wp-json-relative) url + parsed body. */
type Call = { method: string; url: string; body?: Record<string, unknown> };

/** One ability POST result: an untouched draft the plugin just saved. */
function abilityPost(id: number, bm: string, status = 'draft') {
  return {
    id,
    type: 'post',
    title: 'T',
    status,
    baseModified: bm,
    link: `https://x.test/?p=${id}&preview=true`,
    permalink: `https://x.test/?p=${id}`,
  };
}

/**
 * A site whose plugin answers the abilities. `seo: 'none'` simulates a site with no Rank Math/Yoast:
 * create-post/update-seo refuse the SEO fields with invalid_seo + a no_seo_plugin error entry — the
 * real plugin shape — but accept a call without them. `seo: 'always'` refuses update-seo even bare
 * (a site that rejects the call itself), to exercise the "body already written" path.
 */
function abilitySite(
  opts: {
    seo?: 'none' | 'always';
    /** The state an already-synced post is in (get-blocks read). */
    remote?: { id: number; baseModified: string; status?: string; editor?: string };
    existingTerms?: Array<{ id: number; name: string; slug: string; parent: number }>;
  } = {},
) {
  const calls: Call[] = [];
  let nextId = 500;
  const terms = [...(opts.existingTerms ?? [])];
  const net: NetworkPort = {
    async request(r: HttpRequest): Promise<HttpResponse> {
      const url = r.url.replace('https://x.test/wp-json', '');
      const body = (typeof r.body === 'string' ? JSON.parse(r.body) : r.body) as Record<string, unknown> | undefined;
      calls.push({ method: r.method, url, body });
      const input = (body?.input ?? {}) as Record<string, unknown>;

      if (url.startsWith(`${ABILITY}/get-blocks/run`)) {
        if (!opts.remote) return { status: 404, json: { code: 'editable_post', message: 'No such post' } };
        return {
          status: 200,
          json: {
            ...abilityPost(opts.remote.id, opts.remote.baseModified, opts.remote.status),
            blocks: [],
            ...(opts.remote.editor ? { editor: opts.remote.editor, editorNote: 'made elsewhere' } : {}),
          },
        };
      }
      if (
        url.startsWith(`${ABILITY}/create-post/run`) ||
        url.startsWith(`${ABILITY}/update-seo/run`) ||
        url.startsWith(`${ABILITY}/update-body/run`)
      ) {
        // A site that refuses update-seo outright, fields or not — the body has already landed by now.
        if (opts.seo === 'always' && url.includes('update-seo'))
          return { status: 400, json: { code: 'invalid_seo', message: 'SEO refused', data: { status: 400 } } };
        const carriesSeo = ['seoTitle', 'seoDescription', 'focusKeyword', 'keywords'].some(k => input[k] !== undefined);
        if (opts.seo === 'none' && carriesSeo) {
          return {
            status: 400,
            json: {
              code: 'invalid_seo',
              message: 'The site has no SEO plugin to hold the SEO title, description and keywords.',
              data: {
                status: 400,
                fix: 'user',
                errors: [{ field: 'seoTitle', code: 'no_seo_plugin', message: '…', fix: 'user' }],
              },
            },
          };
        }
        const id = url.includes('create-post') ? 101 : Number(input.id ?? 7);
        return { status: 200, json: abilityPost(id, url.includes('update-body') ? 'T2' : 'T3') };
      }
      // /wp/v2 term reads+creates (termSlug / ensureTermPath).
      if (r.method === 'GET' && url.startsWith('/wp/v2/categories/')) {
        const id = Number(url.split('/')[4]?.split('?')[0]);
        const t = terms.find(x => x.id === id);
        return t
          ? {
              status: 200,
              json: { id: t.id, name: t.name, slug: t.slug, parent: t.parent, link: `https://x.test/cat/${t.slug}/` },
            }
          : { status: 404, json: { code: 'rest_term_invalid', message: 'gone' } };
      }
      if (r.method === 'GET' && url.startsWith('/wp/v2/categories')) {
        const q = new URL(`https://x${url}`).searchParams;
        const parent = Number(q.get('parent'));
        const search = (q.get('search') ?? '').toLowerCase();
        return {
          status: 200,
          json: terms
            .filter(t => t.parent === parent && t.name.replace(/&amp;/g, '&').toLowerCase().includes(search))
            .map(t => ({ id: t.id, name: t.name, slug: t.slug })),
        };
      }
      if (r.method === 'POST' && url === '/wp/v2/categories') {
        // A plain /wp/v2 POST: the body IS the payload (no ability `input` wrapper).
        const payload = (body ?? {}) as Record<string, unknown>;
        const t = {
          id: nextId++,
          name: String(payload.name),
          slug: String(payload.name).toLowerCase(),
          parent: Number(payload.parent ?? 0),
        };
        terms.push(t);
        return { status: 201, json: t };
      }
      return { status: 200, json: {} };
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

const inputOf = (calls: Call[], ability: string): Record<string, unknown> | undefined =>
  calls.find(c => c.url.includes(`${ABILITY}/${ability}/run`))?.body?.input as Record<string, unknown> | undefined;

describe('syncContent on a site without an SEO plugin', () => {
  it('strict (default, the extension): fails the push and nothing was created', async () => {
    const { calls, client } = abilitySite({ seo: 'none' });
    const res = await syncContent(client, emptyWorkspace({ name: 's', url: 'https://x.test' }), item, {
      syncCategories: false,
    });

    expect(calls.some(c => c.url.includes('create-post'))).toBe(true);
    expect(res.ok).toBe(false);
    if (res.ok || res.conflict) return;
    expect(res.error).toMatch(/no SEO plugin/);
  });

  it('seoBestEffort: keeps the created post id (no duplicate on retry) and reports the SEO skip', async () => {
    const { calls, client } = abilitySite({ seo: 'none' });
    const res = await syncContent(client, emptyWorkspace({ name: 's', url: 'https://x.test' }), item, {
      syncCategories: false,
      seoBestEffort: true,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.patch.wpPostId).toBe(101);
    // The retry create carried NO seo fields at all.
    const creates = calls.filter(c => c.url.includes('create-post'));
    expect(creates).toHaveLength(2);
    expect(
      ['seoTitle', 'seoDescription', 'focusKeyword'].some(
        k => (creates[1].body?.input as Record<string, unknown>)[k] !== undefined,
      ),
    ).toBe(false);
    expect(res.patch.lastModifiedRemote).toBe('T3');
    expect(res.seoWarning).toMatch(/Rank Math/);
    // SEO wasn't written, so it must not be marked as synced.
    expect(res.patch.seoSyncedAt).toBeUndefined();
    // The canonical permalink lands in the ledger, not the preview `link`.
    expect(res.patch.wpLink).toBe('https://x.test/?p=101');
  });
});

describe('syncContent create (never-pushed item)', () => {
  it('one create-post call carries title, body markdown, categories and SEO together', async () => {
    const { calls, client } = abilitySite({ existingTerms: [{ id: 10, name: 'A', slug: 'a-slug', parent: 0 }] });
    const res = await syncContent(client, membershipWs(), { ...item, siloNodeId: 'F' }, { content: '# Hi\n\ntext' });

    expect(res.ok).toBe(true);
    const input = inputOf(calls, 'create-post')!;
    expect(input.type).toBe('post');
    expect(input.title).toBe('T');
    expect(input.blocks).toEqual([{ type: 'prose', markdown: '# Hi\n\ntext' }]);
    expect(input.seoTitle).toBe('An SEO title');
    expect(input.focusKeyword).toBe('kw');
    // F sits under category A (#10): its slug is fetched, not the id sent.
    expect(input.categories).toEqual(['a-slug']);
  });

  it('no body → a shell create with no blocks key at all', async () => {
    const { calls, client } = abilitySite();
    await syncContent(client, emptyWorkspace({ name: 's', url: 'https://x.test' }), item, { syncCategories: false });
    const input = inputOf(calls, 'create-post')!;
    expect(input.blocks).toBeUndefined();
  });
});

describe('syncContent conflict guards', () => {
  const pushed: ContentItem = { ...item, wpPostId: 7, lastModifiedRemote: 'T1' };
  const ws = emptyWorkspace({ name: 's', url: 'https://x.test' });

  it("WP edited since last sync → 'modified' conflict, nothing written", async () => {
    const { calls, client } = abilitySite({ remote: { id: 7, baseModified: 'T9' } });
    const res = await syncContent(client, ws, pushed, { syncCategories: false });
    expect(res).toEqual({ ok: false, conflict: true, reason: 'modified', remoteModified: 'T9' });
    expect(calls.some(c => c.method === 'POST')).toBe(false);
  });

  it('a stored modified_gmt with a space matches the abilities baseModified with a T', async () => {
    const { client } = abilitySite({ remote: { id: 7, baseModified: '2026-10-01T08:00:00' } });
    const res = await syncContent(
      client,
      ws,
      { ...pushed, lastModifiedRemote: '2026-10-01 08:00:00' },
      {
        syncCategories: false,
        seoBestEffort: true,
      },
    );
    expect(res.ok).toBe(true);
  });

  it("already published → 'published' conflict, even with nothing changed", async () => {
    const { client } = abilitySite({ remote: { id: 7, baseModified: 'T1', status: 'publish' } });
    const res = await syncContent(client, ws, pushed, { syncCategories: false });
    expect(res).toEqual({ ok: false, conflict: true, reason: 'published' });
  });

  it('force bypasses both checks and writes anyway', async () => {
    const { calls, client } = abilitySite({ remote: { id: 7, baseModified: 'T9', status: 'publish' } });
    const res = await syncContent(client, ws, pushed, { syncCategories: false, force: true, seoBestEffort: true });
    expect(res.ok).toBe(true);
    expect(calls.some(c => c.url.includes('update-seo'))).toBe(true);
  });
});

describe('syncContent update (already-synced item)', () => {
  const pushed: ContentItem = { ...item, wpPostId: 7, lastModifiedRemote: 'T1' };
  const ws = emptyWorkspace({ name: 's', url: 'https://x.test' });

  it('body + meta: update-body first, then update-seo chained on its fresh baseModified', async () => {
    const { calls, client } = abilitySite({ remote: { id: 7, baseModified: 'T1' } });
    const res = await syncContent(client, ws, pushed, { syncCategories: false, content: '# New' });

    expect(res.ok).toBe(true);
    expect(inputOf(calls, 'update-body')).toMatchObject({
      id: 7,
      baseModified: 'T1',
      blocks: [{ type: 'prose', markdown: '# New' }],
    });
    expect(inputOf(calls, 'update-seo')).toMatchObject({ id: 7, baseModified: 'T2', title: 'T' });
    if (res.ok) expect(res.patch.lastModifiedRemote).toBe('T3');
  });

  it('SEO refused even bare: the body is already on WP, so report it instead of wedging the item', async () => {
    const { client } = abilitySite({ seo: 'always', remote: { id: 7, baseModified: 'T1' } });
    const res = await syncContent(client, ws, pushed, {
      syncCategories: false,
      content: '# New',
      seoBestEffort: true,
    });

    // Failing outright here would leave lastModifiedRemote untouched, so every later push would
    // false-conflict until someone passed --force. The body DID land, so say so.
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.patch.wpPostId).toBe(7);
    // update-body's fresh baseModified — the token the next push's conflict guard compares against.
    expect(res.patch.lastModifiedRemote).toBe('T2');
    expect(res.seoWarning).toBeTruthy();
    expect(res.patch.seoSyncedAt).toBeUndefined();
  });

  it('meta-only: no update-body call at all', async () => {
    const { calls, client } = abilitySite({ remote: { id: 7, baseModified: 'T1' } });
    await syncContent(client, ws, pushed, { syncCategories: false });
    expect(calls.some(c => c.url.includes('update-body'))).toBe(false);
    expect(inputOf(calls, 'update-seo')).toBeDefined();
  });

  it("another editor's post is never body-overwritten — refused before any write", async () => {
    const { calls, client } = abilitySite({ remote: { id: 7, baseModified: 'T1', editor: 'elementor' } });
    const res = await syncContent(client, ws, pushed, { syncCategories: false, force: true, content: '# New' });
    expect(res).toMatchObject({ ok: false, conflict: false });
    expect(res.ok || res.conflict ? '' : res.error).toMatch(/别的编辑器/);
    expect(calls.some(c => c.method === 'POST' && c.url.includes(ABILITY))).toBe(false);
  });

  it('  ...but its SEO still pushes (meta-only is allowed on an editor post)', async () => {
    const { client } = abilitySite({ remote: { id: 7, baseModified: 'T1', editor: 'elementor' } });
    const res = await syncContent(client, ws, pushed, { syncCategories: false });
    expect(res.ok).toBe(true);
  });
});

describe('syncContent category placement', () => {
  const terms = [
    { id: 10, name: 'A', slug: 'a-slug', parent: 0 },
    { id: 20, name: 'B', slug: 'b-slug', parent: 0 },
    { id: 7, name: 'R &amp; D', slug: 'r-d', parent: 10 },
    { id: 8, name: 'C &amp; more', slug: 'c-more', parent: 10 },
  ];

  it("files a never-pushed item under its node's known WP category, resolved to the slug", async () => {
    const { calls, client } = abilitySite({ existingTerms: terms });
    const res = await syncContent(client, membershipWs(), { ...item, siloNodeId: 'F' });

    expect(res.ok).toBe(true);
    expect(inputOf(calls, 'create-post')!.categories).toEqual(['a-slug']);
    // No term search/create round-trips: the id was known and only its slug fetched.
    expect(calls.some(c => c.url === '/wp/v2/categories' || c.url.startsWith('/wp/v2/categories?'))).toBe(false);
    if (res.ok) expect(res.patch.termIds).toEqual([10]);
  });

  it('adds the placement category to known termIds instead of ignoring the tree', async () => {
    const { calls, client } = abilitySite({
      existingTerms: [...terms, { id: 99, name: 'X', slug: 'x-slug', parent: 0 }],
    });
    await syncContent(client, membershipWs(), { ...item, siloNodeId: 'B', termIds: [99] });
    expect(inputOf(calls, 'create-post')!.categories).toEqual(['x-slug', 'b-slug']);
  });

  it('creates a missing category under its known parent, matching names exactly (search is fuzzy)', async () => {
    const { calls, client } = abilitySite({ existingTerms: terms });
    await syncContent(client, membershipWs(), { ...item, siloNodeId: 'C' });

    expect(calls.find(c => c.method === 'GET' && c.url.startsWith('/wp/v2/categories?'))?.url).toContain('parent=10');
    expect(calls.find(c => c.method === 'POST' && c.url === '/wp/v2/categories')?.body).toEqual({
      name: 'C',
      parent: 10,
    });
    expect(inputOf(calls, 'create-post')!.categories).toEqual(['c']);
  });

  it('reuses an existing category whose escaped name matches exactly', async () => {
    const ws = membershipWs();
    ws.nodes = ws.nodes.map(n => (n.id === 'C' ? { ...n, term: 'R & D' } : n));
    const { calls, client } = abilitySite({ existingTerms: terms });
    await syncContent(client, ws, { ...item, siloNodeId: 'C' });
    expect(calls.some(c => c.method === 'POST' && c.url === '/wp/v2/categories')).toBe(false);
    expect(inputOf(calls, 'create-post')!.categories).toEqual(['r-d']);
  });

  it('a term deleted on WP drops out instead of sending a null slug', async () => {
    const { calls, client } = abilitySite({ existingTerms: terms.filter(t => t.id !== 99) });
    await syncContent(client, membershipWs(), { ...item, siloNodeId: 'B', termIds: [99] });
    expect(inputOf(calls, 'create-post')!.categories).toEqual(['b-slug']);
  });
});
