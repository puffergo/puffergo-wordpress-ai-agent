import { describe, expect, it } from 'vitest';
import { emptyWorkspace, createContent } from '../model/factory';
import { buildNoteLinkIndex, formatWikilink, noteNameFromPath, noteNamesFromScan } from './note-links';

const ws = (contents: ReturnType<typeof createContent>[]) => ({ ...emptyWorkspace({ name: 'T', url: '' }), contents });

describe('note-links', () => {
  const a = createContent('n', 'WordPress 产品展示怎么做：5 个步骤', 'docs', { slug: 'wordpress-product-display' });
  const b = createContent('n', 'Other', 'docs', { slug: 'other' });

  it('names a content by its title-derived note name when the host reports none', () => {
    expect(buildNoteLinkIndex(ws([a])).nameFor(a.id)).toBe('WordPress 产品展示怎么做：5 个步骤');
  });

  it('resolves note name, legacy slug and id to the content (case-insensitive)', () => {
    const idx = buildNoteLinkIndex(ws([a, b]));
    expect(idx.idFor('WordPress 产品展示怎么做：5 个步骤')).toBe(a.id);
    expect(idx.idFor('WORDPRESS-PRODUCT-DISPLAY')).toBe(a.id);
    expect(idx.idFor(b.id)).toBe(b.id);
    expect(idx.idFor('nope')).toBeUndefined();
  });

  it('prefers a note name over another content that has that string as its slug', () => {
    const named = createContent('n', 'x', 'docs', { slug: 'x-slug' });
    const slugged = createContent('n', 'Y', 'docs', { slug: 'shared' });
    const idx = buildNoteLinkIndex(ws([named, slugged]), new Map([[named.id, 'shared']]));
    expect(idx.idFor('shared')).toBe(named.id);
  });

  it('reads note names from scanned paths (either separator)', () => {
    expect(noteNameFromPath('a/b/My Note.md')).toBe('My Note');
    expect(noteNameFromPath('C:\\v\\My Note.md')).toBe('My Note');
    expect(
      noteNamesFromScan(
        new Map([
          ['c1', { path: 'x/N.md' }],
          ['c2', {}],
        ]),
      ),
    ).toEqual(new Map([['c1', 'N']]));
  });

  it('formats [[name]] or [[name|text]]', () => {
    expect(formatWikilink('N')).toBe('[[N]]');
    expect(formatWikilink('N', 'N')).toBe('[[N]]');
    expect(formatWikilink('N', 'see N')).toBe('[[N|see N]]');
  });
});
