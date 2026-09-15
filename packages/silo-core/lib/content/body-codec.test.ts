/**
 * Unit tests for the body codec — the push-side Markdown→WP-HTML transform and its link resolver.
 */

import { describe, expect, it } from 'vitest';
import { emptyWorkspace, createContent } from '../model/factory';
import {
  buildLinkResolver,
  markdownToWpHtml,
  rootRelativePermalink,
  isLocalAssetRef,
  extractLocalImageRefs,
  rewriteImageRefs,
  resolveBodyAssets,
  wpHtmlToMarkdown,
  type AssetUploader,
} from './body-codec';
import type { SiloWorkspace } from '../model/types';

const wsWith = (contents: SiloWorkspace['contents']): SiloWorkspace => ({
  ...emptyWorkspace({ name: 'T', url: 'https://example.com' }),
  contents,
});

describe('rootRelativePermalink', () => {
  it('strips the domain to a root-relative path (pretty permalinks)', () => {
    expect(rootRelativePermalink('https://site.com/solar-street-light/')).toBe('/solar-street-light/');
  });
  it('keeps the query for plain permalinks', () => {
    expect(rootRelativePermalink('https://example.com/?p=4355')).toBe('/?p=4355');
  });
  it('returns the input unchanged when unparseable', () => {
    expect(rootRelativePermalink('not a url')).toBe('not a url');
  });
});

describe('buildLinkResolver', () => {
  it('resolves a target by note file name, slug or id, and maps a permalink back to the note name', () => {
    const a = createContent('n', 'Solar Guide', 'post', { slug: 'guide', wpLink: 'https://x.com/guide' });
    const r = buildLinkResolver(wsWith([a]));
    expect(r.permalinkFor('Solar Guide')).toBe('https://x.com/guide'); // note name (title-named file)
    expect(r.permalinkFor('guide')).toBe('https://x.com/guide'); // legacy slug link
    expect(r.permalinkFor('GUIDE')).toBe('https://x.com/guide'); // case-insensitive
    expect(r.permalinkFor(a.id)).toBe('https://x.com/guide');
    expect(r.targetForUrl('https://x.com/guide')).toBe('Solar Guide');
  });

  it('uses the real note file name the host reports over the title-derived default', () => {
    const a = createContent('n', 'Solar Guide', 'post', { slug: 'guide', wpLink: 'https://x.com/guide' });
    const r = buildLinkResolver(wsWith([a]), new Map([[a.id, 'my renamed note']]));
    expect(r.permalinkFor('my renamed note')).toBe('https://x.com/guide');
    expect(r.targetForUrl('https://x.com/guide')).toBe('my renamed note');
  });

  it('ignores contents without a permalink', () => {
    const noLink = createContent('n', 'B', 'post', { slug: 'draft' }); // never pushed
    const r = buildLinkResolver(wsWith([noLink]));
    expect(r.permalinkFor('draft')).toBeUndefined();
  });
});

describe('markdownToWpHtml', () => {
  const resolver = buildLinkResolver(
    wsWith([createContent('n', 'Guide', 'post', { slug: 'guide', wpLink: 'https://x.com/guide' })]),
  );

  it('rewrites a resolvable [[slug]] to a real, root-relative anchor (no domain)', () => {
    const { html, unresolved } = markdownToWpHtml('See [[guide]] here.', resolver);
    expect(html).toContain('href="/guide"');
    expect(html).not.toContain('x.com'); // domain must not leak into in-content links
    expect(html).toContain('>guide</a>');
    expect(unresolved).toEqual([]);
  });

  it('rewrites a [[note name|text]] link (the form Obsidian can click through)', () => {
    const { html } = markdownToWpHtml('Read the [[Guide|full guide]].', resolver);
    expect(html).toContain('href="/guide"');
    expect(html).toContain('>full guide</a>');
  });

  it('honors a [[slug|alias]] display text', () => {
    const { html } = markdownToWpHtml('Read the [[guide|full guide]].', resolver);
    expect(html).toContain('href="/guide"');
    expect(html).toContain('>full guide</a>');
  });

  it('degrades an unresolved [[slug]] to plain text and reports it', () => {
    const { html, unresolved } = markdownToWpHtml('Missing [[nope]].', resolver);
    expect(html).not.toContain('<a');
    expect(html).toContain('nope');
    expect(unresolved).toEqual(['nope']);
  });

  it('returns empty string for a blank body (→ shell push, no overwrite)', () => {
    expect(markdownToWpHtml('   \n', resolver)).toEqual({ html: '', unresolved: [] });
  });

  it('still renders ordinary markdown (headings, lists)', () => {
    const { html } = markdownToWpHtml('## Title\n\n- one\n- two', resolver);
    expect(html).toContain('<h2>Title</h2>');
    expect(html).toContain('<li>one</li>');
  });
});

describe('asset handling', () => {
  it('isLocalAssetRef: local paths yes, remote/data URIs no', () => {
    expect(isLocalAssetRef('./img/a.png')).toBe(true);
    expect(isLocalAssetRef('a.png')).toBe(true);
    expect(isLocalAssetRef('https://x.com/a.png')).toBe(false);
    expect(isLocalAssetRef('//cdn/a.png')).toBe(false);
    expect(isLocalAssetRef('data:image/png;base64,xxxx')).toBe(false);
  });

  it('extractLocalImageRefs: finds md images + Obsidian embeds, dedups, skips remote', () => {
    const md = '![a](./one.png)\n![[two.png]]\n![b](https://x.com/remote.png)\n![c](one.png)\nagain ![[two.png]]';
    // md-image refs first (in order), then embed refs; remotes skipped, duplicates dropped.
    expect(extractLocalImageRefs(md)).toEqual(['./one.png', 'one.png', 'two.png']);
  });

  it('rewriteImageRefs: swaps mapped refs, turns embeds into md images, leaves unmapped alone', () => {
    const md = '![alt](./one.png "t")\n![[two.png]]\n![x](keep.png)';
    const out = rewriteImageRefs(
      md,
      new Map([
        ['./one.png', 'https://w/1.png'],
        ['two.png', 'https://w/2.png'],
      ]),
    );
    expect(out).toContain('![alt](https://w/1.png "t")');
    expect(out).toContain('![](https://w/2.png)');
    expect(out).toContain('![x](keep.png)');
  });

  it('resolveBodyAssets: uploads each distinct local ref once and rewrites', async () => {
    const calls: string[] = [];
    const uploader: AssetUploader = {
      async upload(ref) {
        calls.push(ref);
        return `https://cdn/${ref.replace(/[^a-z0-9]/gi, '')}`;
      },
    };
    const { md, uploaded } = await resolveBodyAssets('![](a.png) then ![](a.png) and ![[b.png]]', uploader);
    expect(uploaded).toBe(2);
    expect(calls).toEqual(['a.png', 'b.png']); // a.png only once despite two uses
    expect(md).toContain('https://cdn/apng');
    expect(md).toContain('https://cdn/bpng');
  });

  it('resolveBodyAssets: no local images → no-op, uploader never called', async () => {
    const uploader: AssetUploader = {
      upload: async () => {
        throw new Error('should not be called');
      },
    };
    expect(await resolveBodyAssets('just text and ![r](https://x/y.png)', uploader)).toEqual({
      md: 'just text and ![r](https://x/y.png)',
      uploaded: 0,
    });
  });
});

describe('wpHtmlToMarkdown', () => {
  it('converts common block/inline HTML to Markdown', () => {
    const html = '<h2>Title</h2><p>Body <strong>bold</strong> and <em>italic</em>.</p><ul><li>a</li><li>b</li></ul>';
    const md = wpHtmlToMarkdown(html, () => undefined);
    expect(md).toContain('## Title');
    expect(md).toContain('**bold**');
    expect(md).toContain('_italic_');
    expect(md).toContain('-   a');
  });

  it('rewrites a resolved internal link to [[slug]], leaving an unresolved one as a plain link', () => {
    const html =
      '<p>See <a href="/how-it-works/">how it works</a> and <a href="https://other.com/x">elsewhere</a>.</p>';
    const md = wpHtmlToMarkdown(html, url => (url === '/how-it-works/' ? 'how-it-works' : undefined));
    expect(md).toContain('[[how-it-works|how it works]]');
    expect(md).toContain('[elsewhere](https://other.com/x)');
  });

  it('omits the alias when the link text already equals the slug', () => {
    const html = '<p><a href="/x/">how-it-works</a></p>';
    const md = wpHtmlToMarkdown(html, () => 'how-it-works');
    expect(md.trim()).toBe('[[how-it-works]]');
  });

  it('returns empty for empty/whitespace-only input (no shell round-trip through turndown)', () => {
    expect(wpHtmlToMarkdown('', () => undefined)).toBe('');
    expect(wpHtmlToMarkdown('   \n  ', () => undefined)).toBe('');
  });

  it('drops <script>/<style> entirely instead of leaking their raw JS/CSS as plain text', () => {
    const html = '<p>Real text.</p><script>alert(1)</script><style>.a{color:red}</style><noscript>no js</noscript>';
    const md = wpHtmlToMarkdown(html, () => undefined);
    expect(md.trim()).toBe('Real text.');
  });

  it('ignores a stray style="" attribute on an ordinary element (attributes never leak)', () => {
    const html = '<p style="color:red;font-weight:bold">Styled but plain.</p>';
    const md = wpHtmlToMarkdown(html, () => undefined);
    expect(md).not.toContain('style=');
    expect(md).not.toContain('color:red');
    expect(md.trim()).toBe('Styled but plain.');
  });

  it('does not corrupt anchor text that itself contains parentheses', () => {
    const html = '<p><a href="/x/">see (details)</a></p>';
    const md = wpHtmlToMarkdown(html, () => undefined);
    expect(md).toContain('[see (details)](/x/)');
  });
});
