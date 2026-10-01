/**
 * Unit tests for the body codec — the push/pull Markdown-side wikilink transforms and the shared
 * asset pass. (No HTML is produced or parsed anymore: the plugin compiles Markdown to blocks.)
 */

import { describe, expect, it } from 'vitest';
import { emptyWorkspace, createContent } from '../model/factory';
import {
  buildLinkResolver,
  resolveWikilinks,
  restoreWikilinks,
  rootRelativePermalink,
  isLocalAssetRef,
  extractLocalImageRefs,
  rewriteImageRefs,
  resolveBodyAssets,
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

describe('resolveWikilinks (push)', () => {
  const resolver = buildLinkResolver(
    wsWith([createContent('n', 'Guide', 'post', { slug: 'guide', wpLink: 'https://x.com/guide' })]),
  );

  it('rewrites a resolvable [[slug]] to a real, root-relative Markdown link (no domain)', () => {
    const { md, unresolved } = resolveWikilinks('See [[guide]] here.', resolver);
    expect(md).toBe('See [guide](/guide) here.');
    expect(md).not.toContain('x.com'); // domain must not leak into in-content links
    expect(unresolved).toEqual([]);
  });

  it('rewrites a [[note name|text]] link (the form Obsidian can click through)', () => {
    expect(resolveWikilinks('Read the [[Guide|full guide]].', resolver).md).toBe('Read the [full guide](/guide).');
  });

  it('honors a [[slug|alias]] display text', () => {
    expect(resolveWikilinks('Read the [[guide|full guide]].', resolver).md).toBe('Read the [full guide](/guide).');
  });

  it('degrades an unresolved [[slug]] to plain text and reports it', () => {
    const { md, unresolved } = resolveWikilinks('Missing [[nope]].', resolver);
    expect(md).toBe('Missing nope.');
    expect(unresolved).toEqual(['nope']);
  });

  it('returns empty string for a blank body (→ shell push, no overwrite)', () => {
    expect(resolveWikilinks('   \n', resolver)).toEqual({ md: '', unresolved: [] });
  });

  it('leaves ordinary markdown (headings, lists) untouched for the plugin compiler', () => {
    const src = '## Title\n\n- one\n- two';
    expect(resolveWikilinks(src, resolver).md).toBe(src);
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

describe('restoreWikilinks (pull)', () => {
  it('rewrites a resolved internal link to [[slug]], leaving an unresolved one as a plain link', () => {
    const md = 'See [how it works](/how-it-works/) and [elsewhere](https://other.com/x).';
    const out = restoreWikilinks(md, url => (url === '/how-it-works/' ? 'how-it-works' : undefined));
    expect(out).toContain('[[how-it-works|how it works]]');
    expect(out).toContain('[elsewhere](https://other.com/x)');
  });

  it('omits the alias when the link text already equals the slug', () => {
    const out = restoreWikilinks('[how-it-works](/x/)', () => 'how-it-works');
    expect(out.trim()).toBe('[[how-it-works]]');
  });

  it('never touches an image, however local its path', () => {
    const md = '![alt](./diagram.png)\n![x](https://cdn/x.png)';
    expect(restoreWikilinks(md, () => 'anything')).toBe(md);
  });

  it('returns empty for empty/whitespace-only input', () => {
    expect(restoreWikilinks('', () => undefined)).toBe('');
    expect(restoreWikilinks('   \n  ', () => undefined)).toBe('');
  });

  it('leaves headings, lists and emphasis alone — prose the plugin handed back as-is', () => {
    const md = '## Title\n\n- one **bold**\n- two _italic_';
    expect(restoreWikilinks(md, () => undefined)).toBe(md);
  });

  it('keeps a link whose text contains parentheses intact', () => {
    const md = '[see (details)](/x/)';
    expect(restoreWikilinks(md, url => (url === '/x/' ? 'x-note' : undefined))).toBe('[[x-note|see (details)]]');
  });
});
