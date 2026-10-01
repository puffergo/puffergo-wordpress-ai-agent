/**
 * Integration test for importFromWp's body pull: a real WpClient over a stubbed NetworkPort, checking
 * that `ImportResult.bodies` is populated with the plugin's Markdown (get-blocks?full), and that an
 * internal link between two pulled posts round-trips to `[[slug]]` using the SAME resolution edges are
 * built from. Bodies are only pulled when `wantBodies` is set (the extension host leaves it off).
 */
import { describe, expect, it } from 'vitest';
import { emptyWorkspace } from '../model/factory';
import { WpClient } from '../wp/client';
import { importFromWp } from './import-content';
import type { NetworkPort, HttpRequest, HttpResponse } from '../ports/network';

const SITE = 'https://x.test';
const ABILITY = '/wp-abilities/v1/abilities/puffergo';

/** The body Markdown the plugin hands back for each post id (get-blocks?full), all-prose. */
const BODY_MD: Record<number, string> = {
  10: 'Plain target body.',
  // Push writes internal links ROOT-RELATIVE (`/target-post/`) so a body survives a domain change, so
  // a pulled body can hold either form — both must resolve back to the same wikilink.
  11: 'See [Target](https://x.test/target-post/), [Again](/target-post/) and [External](https://other.com/y).',
};

function stubNetwork(): NetworkPort {
  return {
    async request(req: HttpRequest): Promise<HttpResponse> {
      const url = req.url.replace(`${SITE}/wp-json`, '');
      if (url.startsWith(`${ABILITY}/get-blocks/run`)) {
        const id = Number(new URL(req.url).searchParams.get('input[id]'));
        const md = BODY_MD[id];
        return {
          status: 200,
          json: {
            id,
            type: 'post',
            title: 'T',
            status: 'draft',
            baseModified: '2026-01-01T00:00:00',
            link: `${SITE}/?p=${id}`,
            permalink: `${SITE}/?p=${id}`,
            blocks: md == null ? [] : [{ path: '1', kind: 'prose', markdown: md }],
          },
        };
      }
      if (url.startsWith('/wp/v2/posts')) {
        const posts = [
          {
            // A draft's `link` is a nonce'd preview URL — exactly what must never reach the ledger.
            id: 10,
            link: `${SITE}/target-post/?preview=true&_ppp=deadbeef`,
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

describe('importFromWp — body pull (wantBodies)', () => {
  it("pulls each post's Markdown body and rewrites the resolved internal link to [[note name|text]]", async () => {
    const client = new WpClient(stubNetwork(), { siteUrl: SITE, username: 'a', appPassword: 'b' });
    const ws = emptyWorkspace({ name: 'T', url: SITE });

    const result = await importFromWp(client, ws, ['post'], { wantBodies: true });

    const target = result.ws.contents.find(c => c.wpPostId === 10)!;
    const source = result.ws.contents.find(c => c.wpPostId === 11)!;
    expect(result.bodies.get(target.id)).toBe('Plain target body.');
    const sourceBody = result.bodies.get(source.id)!;
    // Named after the target's note file (its title) — Obsidian resolves a click by file name, not slug.
    expect(sourceBody).toContain('[[Target Post|Target]]');
    // The root-relative form push emits must resolve identically — `new URL('/x')` has no host, so this
    // only works because canon() resolves relative hrefs against the site URL. Regression guard.
    expect(sourceBody).toContain('[[Target Post|Again]]');
    expect(sourceBody).toContain('[External](https://other.com/y)');
    // The edge and the body agree: this is what makes it safe to reuse resolveInternalTarget for both.
    expect(result.ws.edges.some(e => e.from === source.id && e.to === target.id && e.type === 'internal-link')).toBe(
      true,
    );
  });

  it('stores a draft address without the preview nonce — a stored preview URL would be written into other bodies', async () => {
    const client = new WpClient(stubNetwork(), { siteUrl: SITE, username: 'a', appPassword: 'b' });
    const ws = emptyWorkspace({ name: 'T', url: SITE });

    const result = await importFromWp(client, ws, ['post'], { wantBodies: true });
    const target = result.ws.contents.find(c => c.wpPostId === 10)!;

    // WP handed us `?preview=true&_ppp=deadbeef`; the nonce expires, so it can't be what links resolve to.
    expect(target.wpLink).toBe(`${SITE}/target-post/`);
    expect(target.wpLink).not.toContain('_ppp');
    expect(target.wpLink).not.toContain('preview');
  });

  it('links to the note name the host reports when the target note already exists under another name', async () => {
    const client = new WpClient(stubNetwork(), { siteUrl: SITE, username: 'a', appPassword: 'b' });
    const first = await importFromWp(client, emptyWorkspace({ name: 'T', url: SITE }), ['post'], { wantBodies: true });
    const target = first.ws.contents.find(c => c.wpPostId === 10)!;
    const source = first.ws.contents.find(c => c.wpPostId === 11)!;

    const again = await importFromWp(client, first.ws, ['post'], {
      wantBodies: true,
      noteNames: new Map([[target.id, 'target-post']]),
    });
    expect(again.bodies.get(source.id)).toContain('[[target-post|Target]]');
  });

  it('without wantBodies, no body is pulled at all (the extension host)', async () => {
    const client = new WpClient(stubNetwork(), { siteUrl: SITE, username: 'a', appPassword: 'b' });
    const result = await importFromWp(client, emptyWorkspace({ name: 'T', url: SITE }), ['post']);
    expect(result.bodies.size).toBe(0);
    // Edges still parse from the rendered HTML regardless.
    const source = result.ws.contents.find(c => c.wpPostId === 11)!;
    const target = result.ws.contents.find(c => c.wpPostId === 10)!;
    expect(result.ws.edges.some(e => e.from === source.id && e.to === target.id && e.type === 'internal-link')).toBe(
      true,
    );
  });
});

describe('importFromWp — onlyIds', () => {
  it('imports just the named posts and leaves the rest of the workspace alone', async () => {
    const client = new WpClient(stubNetwork(), { siteUrl: SITE, username: 'a', appPassword: 'b' });
    const res = await importFromWp(client, emptyWorkspace({ name: 's', url: SITE }), ['post'], {
      onlyIds: [10],
      wantBodies: true,
    });
    expect(res.ws.contents.map(c => c.wpPostId)).toEqual([10]);
    expect([...res.bodies.values()]).toEqual(['Plain target body.']);
  });
});
