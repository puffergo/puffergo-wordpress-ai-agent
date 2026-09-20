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
  it("converts each post's content.rendered to Markdown and rewrites the resolved internal link to [[note name|text]]", async () => {
    const client = new WpClient(stubNetwork(), { siteUrl: SITE, username: 'a', appPassword: 'b' });
    const ws = emptyWorkspace({ name: 'T', url: SITE });

    const result = await importFromWp(client, ws, ['post']);

    const target = result.ws.contents.find(c => c.wpPostId === 10)!;
    const source = result.ws.contents.find(c => c.wpPostId === 11)!;
    expect(result.bodies.get(target.id)).toContain('Plain target body.');
    const sourceBody = result.bodies.get(source.id)!;
    // Named after the target's note file (its title) — Obsidian resolves a click by file name, not slug.
    expect(sourceBody).toContain('[[Target Post|Target]]');
    expect(sourceBody).toContain('[External](https://other.com/y)');
    // The edge and the body agree: this is what makes it safe to reuse resolveInternalTarget for both.
    expect(result.ws.edges.some(e => e.from === source.id && e.to === target.id && e.type === 'internal-link')).toBe(
      true,
    );
  });

  it('links to the note name the host reports when the target note already exists under another name', async () => {
    const client = new WpClient(stubNetwork(), { siteUrl: SITE, username: 'a', appPassword: 'b' });
    const first = await importFromWp(client, emptyWorkspace({ name: 'T', url: SITE }), ['post']);
    const target = first.ws.contents.find(c => c.wpPostId === 10)!;
    const source = first.ws.contents.find(c => c.wpPostId === 11)!;

    const again = await importFromWp(client, first.ws, ['post'], { noteNames: new Map([[target.id, 'target-post']]) });
    expect(again.bodies.get(source.id)).toContain('[[target-post|Target]]');
  });
});

describe('importFromWp — onlyIds', () => {
  it('imports just the named posts and leaves the rest of the workspace alone', async () => {
    const client = new WpClient(stubNetwork(), { siteUrl: SITE, username: 'a', appPassword: 'b' });
    const res = await importFromWp(client, emptyWorkspace({ name: 's', url: SITE }), ['post'], { onlyIds: [10] });
    expect(res.ws.contents.map(c => c.wpPostId)).toEqual([10]);
    expect([...res.bodies.values()]).toEqual(['Plain target body.']);
  });
});
