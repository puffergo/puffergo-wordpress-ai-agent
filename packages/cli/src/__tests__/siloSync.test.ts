import { describe, it, expect } from 'vitest';
import { emptyWorkspace, type SiloWorkspace } from '@puffergo/silo-core';
import { changedIds, isEdited, matchTargets, noteHash, recordSynced, type Scan } from '../lib/siloSync';

const DIR = '/v';
const ws = (): SiloWorkspace => ({
  ...emptyWorkspace({ name: 's', url: 'https://x.test' }),
  contents: [
    {
      id: 'a',
      siloNodeId: 'n',
      postType: 'post',
      title: 'A',
      slug: 'a-post',
      wpPostId: 1,
      wpLink: 'https://x.test/a/',
      seoSyncedAt: null,
      lastModifiedRemote: null,
      seo: { title: '', description: '', coreKeywords: [], longTailKeywords: [] },
    },
    {
      id: 'b',
      siloNodeId: 'n',
      postType: 'post',
      title: 'B',
      slug: 'b-post',
      wpPostId: 2,
      seoSyncedAt: null,
      lastModifiedRemote: null,
      seo: { title: '', description: '', coreKeywords: [], longTailKeywords: [] },
    },
    {
      id: 'c',
      siloNodeId: 'n',
      postType: 'post',
      title: 'C',
      slug: 'c-post',
      wpPostId: null,
      seoSyncedAt: null,
      lastModifiedRemote: null,
      seo: { title: '', description: '', coreKeywords: [], longTailKeywords: [] },
    },
  ],
});
const note = (name: string, body: string, fm = 'x: 1') => ({ path: `${DIR}/blog/${name}.md`, fm, body });

describe('silo push picks only what changed', () => {
  it('new notes, and notes edited since their last sync; untouched pulled posts are left alone', () => {
    const scan: Scan = new Map([
      ['a', note('A note', '\nold\n')],
      ['b', note('B note', '\nsame\n')],
      ['c', note('C note', '\n')],
    ]);
    const synced = { a: noteHash(note('A note', '\nolder\n')), b: noteHash(scan.get('b')!) };
    expect(changedIds(ws(), scan, synced)).toEqual(['a', 'c']);
  });

  it('a note never synced counts as edited only when it has a body', () => {
    expect(isEdited('a', new Map([['a', note('A', '\n')]]), {})).toBe(false);
    expect(isEdited('a', new Map([['a', note('A', '\ntext\n')]]), {})).toBe(true);
  });

  it('names a note by file name, path, slug, silo id, WP id or link', () => {
    const scan: Scan = new Map([
      ['a', note('A note', '')],
      ['b', note('B note', '')],
    ]);
    expect(matchTargets(['A note.md', 'b-post', 'c', '1', 'https://x.test/a', 'nope'], ws(), scan, DIR)).toEqual({
      ids: ['a', 'b', 'c', 'a', 'a'],
      unknown: ['nope'],
    });
    expect(matchTargets(['blog/B note.md'], ws(), scan, DIR).ids).toEqual(['b']);
  });

  it('after a run: synced notes take their new hash, unchanged ones stay unchanged, edited ones stay edited', () => {
    const before: Scan = new Map([
      ['a', note('A', 'x')],
      ['b', note('B', 'y')],
      ['c', note('C', 'edited')],
    ]);
    const synced = { b: noteHash(before.get('b')!), c: noteHash(note('C', 'orig')) };
    // The run rewrote every note's frontmatter.
    const after: Scan = new Map([...before].map(([id, n]) => [id, { ...n, fm: 'x: 2' }]));
    const out = recordSynced(synced, before, after, ['a']);
    expect(out.a).toBe(noteHash(after.get('a')!));
    expect(out.b).toBe(noteHash(after.get('b')!));
    expect(isEdited('c', after, out)).toBe(true);
  });
});
