import { describe, expect, it } from 'vitest';
import { WpClient } from '../wp/client';
import { emptyWorkspace } from '../model/factory';
import type { ContentItem } from '../model/types';
import type { HttpRequest, HttpResponse, NetworkPort } from '../ports/network';
import { syncContent } from './sync-content';

/** A WP site with NO Rank Math: its SEO route doesn't exist, everything else is a plain core site. */
function siteWithoutRankMath() {
  const calls: string[] = [];
  const net: NetworkPort = {
    async request(r: HttpRequest): Promise<HttpResponse> {
      calls.push(`${r.method} ${r.url.replace('https://x.test/wp-json', '')}`);
      if (r.url.includes('/rankmath/')) return { status: 404, json: { code: 'rest_no_route', message: 'No route' } };
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
