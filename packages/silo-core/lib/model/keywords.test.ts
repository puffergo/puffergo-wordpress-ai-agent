/**
 * Unit tests for reconcileKeywords — the non-destructive merge between free keyword strings used in
 * content/category SEO and the managed KeywordEntity vocabulary.
 */

import { describe, expect, it } from 'vitest';
import { emptyWorkspace, createNode, createContent, emptySeo } from './factory';
import { reconcileKeywords, normalizeTerm } from './keywords';
import type { SiloWorkspace } from './types';

const baseWs = (): SiloWorkspace => emptyWorkspace({ name: 'Test Site', url: 'https://example.com' });

describe('normalizeTerm', () => {
  it('trims and lower-cases', () => {
    expect(normalizeTerm('  Solar Light  ')).toBe('solar light');
  });
});

describe('reconcileKeywords', () => {
  it('adopts a used term that has no entity yet, tagged as local for local-only content', () => {
    const node = createNode('n', 'pillar', null);
    const content = createContent(node.id, 'A', 'post', { seo: { ...emptySeo(), coreKeywords: ['solar light'] } });
    const ws = { ...baseWs(), nodes: [node], contents: [content] };
    const kws = reconcileKeywords(ws);
    expect(kws).toHaveLength(1);
    expect(kws[0].term).toBe('solar light');
    expect(kws[0].source).toBe('local');
  });

  it('tags a term used by cloud-pushed content (wpPostId set) as source "cloud"', () => {
    const node = createNode('n', 'pillar', null);
    const content = createContent(node.id, 'A', 'post', {
      wpPostId: 42,
      seo: { ...emptySeo(), coreKeywords: ['solar light'] },
    });
    const ws = { ...baseWs(), nodes: [node], contents: [content] };
    const kws = reconcileKeywords(ws);
    expect(kws[0].source).toBe('cloud');
  });

  it('tags a term used by both a local and a cloud content as "both"', () => {
    const node = createNode('n', 'pillar', null);
    const a = createContent(node.id, 'A', 'post', { seo: { ...emptySeo(), coreKeywords: ['solar light'] } });
    const b = createContent(node.id, 'B', 'post', {
      wpPostId: 1,
      seo: { ...emptySeo(), coreKeywords: ['solar light'] },
    });
    const ws = { ...baseWs(), nodes: [node], contents: [a, b] };
    const kws = reconcileKeywords(ws);
    expect(kws).toHaveLength(1);
    expect(kws[0].source).toBe('both');
  });

  it('keeps a planned-only keyword with zero usage (never drops it)', () => {
    const ws: SiloWorkspace = { ...baseWs(), keywords: [{ id: 'k1', term: 'future keyword', source: 'local' }] };
    const kws = reconcileKeywords(ws);
    expect(kws).toEqual([{ id: 'k1', term: 'future keyword', source: 'local' }]);
  });

  it('is idempotent: running twice on its own output yields the same set', () => {
    const node = createNode('n', 'pillar', null);
    const content = createContent(node.id, 'A', 'post', { seo: { ...emptySeo(), coreKeywords: ['solar light'] } });
    const ws = { ...baseWs(), nodes: [node], contents: [content] };
    const once = reconcileKeywords(ws);
    const twice = reconcileKeywords({ ...ws, keywords: once });
    expect(twice).toEqual(once);
  });

  it('provenance is monotonic: a word planned locally stays flagged local even after being merged to "both"', () => {
    const node = createNode('n', 'pillar', null);
    const local = { id: 'k1', term: 'solar light', source: 'local' as const };
    const cloudContent = createContent(node.id, 'A', 'post', {
      wpPostId: 1,
      seo: { ...emptySeo(), coreKeywords: ['solar light'] },
    });
    const ws: SiloWorkspace = { ...baseWs(), nodes: [node], contents: [cloudContent], keywords: [local] };
    const kws = reconcileKeywords(ws);
    expect(kws[0].source).toBe('both');
  });

  it('de-dupes existing entities that collide on normalized term, keeping only the first', () => {
    const ws: SiloWorkspace = {
      ...baseWs(),
      keywords: [
        { id: 'k1', term: 'Solar Light', source: 'local' },
        { id: 'k2', term: 'solar light', source: 'cloud' },
      ],
    };
    const kws = reconcileKeywords(ws);
    expect(kws).toHaveLength(1);
    expect(kws[0].id).toBe('k1');
  });

  it('counts category (node) SEO usage, treating a node with a WP term id as cloud provenance', () => {
    const cat = createNode('cat', 'pillar', null, {
      wpCategoryId: 5,
      seo: { ...emptySeo(), coreKeywords: ['solar light'] },
    });
    const ws = { ...baseWs(), nodes: [cat] };
    const kws = reconcileKeywords(ws);
    expect(kws[0].source).toBe('cloud');
  });

  it('handles an empty workspace with no crash and no keywords', () => {
    expect(reconcileKeywords(baseWs())).toEqual([]);
  });
});
