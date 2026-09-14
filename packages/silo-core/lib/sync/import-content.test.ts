/**
 * Integration test for importFromWp's body pull: a real WpClient over a stubbed NetworkPort, checking
 * that `ImportResult.bodies` is populated with Markdown, and that an internal link between two pulled
 * posts round-trips to `[[slug]]` using the SAME resolution edges are built from.
 */
import { describe, expect, it } from 'vitest';
import { emptyWorkspace } from '../model/factory';
import { WpClient } from '../wp/client';
import { importFromWp } from './import-content';
import type { NetworkPort, HttpRequest, HttpResponse } from '../ports/network';

const SITE = 'https://x.test';

function stubNetwork(): NetworkPort {
  return {
    async request(req: HttpRequest): Promise<HttpResponse> {
      const url = req.url;
      if (url.includes('/wp/v2/posts')) {
        const posts = [
          {
            id: 10,
            link: `${SITE}/target-post/`,
            slug: 'target-post',
            modified: '2026-01-01T00:00:00',
            title: { rendered: 'Target Post' },
            content: { rendered: '<p>Plain target body.</p>' },
          },
          {
            id: 11,
            link: `${SITE}/source-post/`,
            slug: 'source-post',
            modified: '2026-01-01T00:00:00',
            title: { rendered: 'Source Post' },
            content: {
              rendered:
                '<p>See <a href="https://x.test/target-post/">Target</a> and <a href="https://other.com/y">External</a>.</p>',
            },
          },
        ];
        return { status: 200, json: posts, headers: { 'x-wp-totalpages': '1' } };
      }
      if (url.includes('/puffergo/v1/seo-meta')) {
        return { status: 404, json: { code: 'rest_no_route' } };
      }
      return { status: 404, json: { code: 'rest_no_route' } };
    },
  };
}

describe('importFromWp — body pull', () => {
  it("converts each post's content.rendered to Markdown and rewrites the resolved internal link to [[slug]]", async () => {
    const client = new WpClient(stubNetwork(), { siteUrl: SITE, username: 'a', appPassword: 'b' });
    const ws = emptyWorkspace({ name: 'T', url: SITE });

    const result = await importFromWp(client, ws, ['post']);

    const target = result.ws.contents.find(c => c.wpPostId === 10)!;
    const source = result.ws.contents.find(c => c.wpPostId === 11)!;
    expect(result.bodies.get(target.id)).toContain('Plain target body.');
    const sourceBody = result.bodies.get(source.id)!;
    expect(sourceBody).toContain('[[target-post|Target]]');
    expect(sourceBody).toContain('[External](https://other.com/y)');
    // The edge and the body agree: this is what makes it safe to reuse resolveInternalTarget for both.
    expect(result.ws.edges.some(e => e.from === source.id && e.to === target.id && e.type === 'internal-link')).toBe(
      true,
    );
  });
});
