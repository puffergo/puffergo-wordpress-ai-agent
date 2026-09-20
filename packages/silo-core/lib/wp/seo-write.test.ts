import { describe, it, expect } from 'vitest';
import { WpClient } from './client';
import type { HttpRequest, HttpResponse, NetworkPort } from '../ports/network';
import { focusKeywordString } from '../model/selectors';
import * as limits from '../model/seo-limits';
import { healthCheck } from '../model/health';
import { emptyWorkspace } from '../model/factory';

const conn = { siteUrl: 'https://x.test', username: 'u', appPassword: 'p' };

/** Records requests; `routes` answers by path (anything else → 200 {}). */
function site(routes: Record<string, HttpResponse> = {}) {
  const calls: Array<{ method: string; url: string; body?: unknown }> = [];
  const net: NetworkPort = {
    async request(r: HttpRequest): Promise<HttpResponse> {
      const url = r.url.replace('https://x.test/wp-json', '');
      calls.push({ method: r.method, url, body: r.body });
      return routes[url] ?? { status: 200, json: {} };
    },
  };
  return { calls, client: new WpClient(net, conn) };
}

const seo = {
  title: '  Gate Valves  ',
  description: ' Valves for water plants. ',
  coreKeywords: ['gate valve', 'second core'],
  longTailKeywords: ['a', ' b ', 'c', 'd', 'e', 'f'],
};

const NO_ROUTE = { status: 404, json: { code: 'rest_no_route', message: 'No route' } };

describe('SEO write (what a post / term gets)', () => {
  it('through the PufferGo plugin: trimmed title, description, 1 core + up to 4 long-tail keywords', async () => {
    const { calls, client } = site();
    await client.writeSeo(12, seo);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', url: '/puffergo/v1/seo-meta' });
    expect(calls[0].body).toEqual({
      objectType: 'post',
      id: 12,
      title: 'Gate Valves',
      description: 'Valves for water plants.',
      keywords: ['gate valve', 'a', 'b', 'c', 'd'],
    });
  });

  it("without the PufferGo plugin: the same values through Rank Math's own route", async () => {
    const { calls, client } = site({ '/puffergo/v1/seo-meta': NO_ROUTE });
    await client.writeSeo(12, seo);
    const rm = calls.find(c => c.url === '/rankmath/v1/updateMeta');
    expect(rm?.body).toEqual({
      objectID: 12,
      objectType: 'post',
      meta: {
        rank_math_title: 'Gate Valves',
        rank_math_description: 'Valves for water plants.',
        rank_math_focus_keyword: 'gate valve, a, b, c, d',
      },
    });
  });

  it('leaves out blank fields, and sends nothing when all are blank', async () => {
    const { calls, client } = site();
    await client.writeSeo(12, { title: ' ', description: 'D', coreKeywords: [], longTailKeywords: [] });
    expect(calls[0].body).toEqual({ objectType: 'post', id: 12, description: 'D' });
    const empty = site();
    await empty.client.writeSeo(12, { title: '', description: '', coreKeywords: [], longTailKeywords: [] });
    expect(empty.calls).toHaveLength(0);
  });

  it('writes a category archive as a term', async () => {
    const { calls, client } = site();
    await client.writeSeo(7, { title: 'Valves', description: '', coreKeywords: [], longTailKeywords: [] }, 'term');
    expect(calls[0].body).toEqual({ objectType: 'term', id: 7, title: 'Valves' });
  });

  it('fails with the site error when nothing can store SEO', async () => {
    const { client } = site({ '/puffergo/v1/seo-meta': NO_ROUTE, '/rankmath/v1/updateMeta': NO_ROUTE });
    await expect(client.writeSeo(12, seo)).rejects.toMatchObject({ message: 'No route' });
  });

  it('reports a plugin error (e.g. no SEO plugin) instead of falling back', async () => {
    const { calls, client } = site({
      '/puffergo/v1/seo-meta': { status: 409, json: { code: 'no_seo_plugin', message: 'No SEO plugin' } },
    });
    await expect(client.writeSeo(12, seo)).rejects.toMatchObject({ message: 'No SEO plugin' });
    expect(calls.map(c => c.url)).not.toContain('/rankmath/v1/updateMeta');
  });
});

describe('SEO limits', () => {
  it('title 30–60, description 120–160, 1 core + 4 long-tail keywords', () => {
    expect([limits.TITLE_MIN, limits.TITLE_MAX, limits.DESC_MIN, limits.DESC_MAX]).toEqual([30, 60, 120, 160]);
    expect([limits.CORE_KEYWORDS_MAX, limits.LONGTAIL_KEYWORDS_MAX, limits.FOCUS_KEYWORDS_MAX]).toEqual([1, 4, 5]);
    expect(focusKeywordString(seo)).toBe('gate valve, a, b, c, d');
  });

  it("adopts the limits the site's PufferGo plugin publishes", async () => {
    const { client } = site({
      '/puffergo/v1/seo-limits': {
        status: 200,
        json: {
          limits: {
            titleRecommended: [30, 60],
            descriptionRecommended: [120, 160],
            coreKeywordsMax: 1,
            longTailKeywordsMax: 5,
          },
        },
      },
    });
    const published = await client.fetchSeoLimits();
    limits.applySeoLimits(published);
    try {
      expect(limits.FOCUS_KEYWORDS_MAX).toBe(6);
      expect(focusKeywordString(seo)).toBe('gate valve, a, b, c, d, e');
    } finally {
      limits.applySeoLimits({
        titleRecommended: [30, 60],
        descriptionRecommended: [120, 160],
        coreKeywordsMax: 1,
        longTailKeywordsMax: 4,
      });
    }
    expect(await site({ '/puffergo/v1/seo-limits': NO_ROUTE }).client.fetchSeoLimits()).toBeNull();
  });

  it('health check flags a title over 60 characters', () => {
    const ws = emptyWorkspace({ name: 's', url: 'https://x.test' });
    ws.contents.push({
      id: 'c1',
      siloNodeId: null,
      postType: 'post',
      title: 'T',
      wpPostId: null,
      seoSyncedAt: null,
      lastModifiedRemote: null,
      seo: { title: 'x'.repeat(61), description: 'y'.repeat(130), coreKeywords: ['x'], longTailKeywords: [] },
    } as never);
    expect(healthCheck(ws).map(i => i.code)).toContain('meta-truncated');
  });
});
