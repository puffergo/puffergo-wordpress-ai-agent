/**
 * Unit tests for read-only selectors over a SiloWorkspace.
 */

import { describe, expect, it } from 'vitest';
import { emptyWorkspace, createNode, createContent } from './factory';
import {
  getPendingContents,
  getDirtyContents,
  getNodePath,
  focusKeywordString,
  getContentsForNode,
  nearestCategoryNode,
} from './selectors';
import { emptySeo } from './factory';
import type { SiloWorkspace } from './types';
import { membershipWs } from './membership.fixture';

const baseWs = (): SiloWorkspace => emptyWorkspace({ name: 'Test Site', url: 'https://example.com' });

describe('getPendingContents', () => {
  it('returns only content with wpPostId === null', () => {
    const pending = createContent('n1', 'Pending');
    const pushed = createContent('n1', 'Pushed', 'post', { wpPostId: 42 });
    const ws = { ...baseWs(), contents: [pending, pushed] };
    expect(getPendingContents(ws)).toEqual([pending]);
  });

  it('returns an empty array for an empty workspace', () => {
    expect(getPendingContents(baseWs())).toEqual([]);
  });
});

describe('getDirtyContents', () => {
  it('returns only content with dirtyAt set, regardless of push status', () => {
    const clean = createContent('n1', 'Clean', 'post', { wpPostId: 1 });
    const dirty = createContent('n1', 'Dirty', 'post', { wpPostId: 2, dirtyAt: '2026-07-20T00:00:00Z' });
    const neverPushedDirty = createContent('n1', 'NeverPushedButDirty', 'post', { dirtyAt: '2026-07-20T00:00:00Z' });
    const ws = { ...baseWs(), contents: [clean, dirty, neverPushedDirty] };
    expect(getDirtyContents(ws)).toEqual([dirty, neverPushedDirty]);
  });

  it('treats dirtyAt: null as not dirty', () => {
    const c = createContent('n1', 'A', 'post', { dirtyAt: null });
    const ws = { ...baseWs(), contents: [c] };
    expect(getDirtyContents(ws)).toEqual([]);
  });
});

describe('getNodePath', () => {
  it('returns the root-to-node path inclusive, ordered top-down', () => {
    const root = createNode('root', 'pillar', null);
    const child = createNode('child', 'cluster', root.id);
    const grandchild = createNode('grandchild', 'cluster', child.id);
    const ws = { ...baseWs(), nodes: [root, child, grandchild] };
    expect(getNodePath(ws, grandchild.id)).toEqual([root, child, grandchild]);
  });

  it('returns a single-element path for a top-level node', () => {
    const root = createNode('root', 'pillar', null);
    const ws = { ...baseWs(), nodes: [root] };
    expect(getNodePath(ws, root.id)).toEqual([root]);
  });

  it('returns an empty array for an id that does not exist', () => {
    const ws = baseWs();
    expect(getNodePath(ws, 'missing')).toEqual([]);
  });

  it('does not infinite-loop on a cyclical parentId chain (defensive guard)', () => {
    const a = createNode('a', 'pillar', null);
    const b = createNode('b', 'cluster', a.id);
    // Force a cycle: a's parentId now points at b, which is invalid/unreachable in practice but
    // exercises the `guard` Set defense in getNodePath.
    const cyclicA = { ...a, parentId: b.id };
    const ws = { ...baseWs(), nodes: [cyclicA, b] };
    const path = getNodePath(ws, b.id);
    // Should terminate and contain each node at most once.
    const ids = path.map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('focusKeywordString', () => {
  it('caps at 1 core + 4 long-tail = 5 total (Rank Math ceiling), dropping the overflow', () => {
    const seo = { ...emptySeo(), coreKeywords: ['c1', 'c2'], longTailKeywords: ['l1', 'l2', 'l3', 'l4', 'l5'] };
    const parts = focusKeywordString(seo).split(', ');
    expect(parts).toEqual(['c1', 'l1', 'l2', 'l3', 'l4']);
  });

  it('trims, drops blanks, and returns "" when there is nothing to write', () => {
    expect(focusKeywordString({ ...emptySeo(), coreKeywords: ['  spaced  '], longTailKeywords: ['', '  '] })).toBe(
      'spaced',
    );
    expect(focusKeywordString(emptySeo())).toBe('');
  });
});

describe('getContentsForNode honors both membership records', () => {
  const ids = (ws: SiloWorkspace, nodeId: string) => getContentsForNode(ws, nodeId).map(c => c.id);

  it('lists a never-pushed content placed under a category node (no termIds yet)', () => {
    const ws = { ...membershipWs(), contents: [{ ...createContent('A', 'new'), id: 'new' }] };
    expect(ids(ws, 'A')).toEqual(['new']);
  });

  it('lists by termIds even without a connection (taxonomy taken from the tree)', () => {
    const ws = { ...membershipWs(), contents: [{ ...createContent('B', 'multi'), id: 'multi', termIds: [20, 10] }] };
    expect(ws.connection).toBeUndefined();
    expect(ids(ws, 'A')).toEqual(['multi']);
    expect(ids(ws, 'B')).toEqual(['multi']);
  });

  it('does not list content of another taxonomy that happens to share the term id', () => {
    const product = { ...createContent('root', 'p', 'product'), id: 'p', termIds: [10] };
    const ws: SiloWorkspace = {
      ...membershipWs(),
      contents: [product],
      connection: {
        siteUrl: 'https://example.com',
        username: 'u',
        appPassword: 'p',
        contentTypes: [{ type: 'product', restBase: 'products', label: 'P', taxonomyRestBase: 'product_cat' }],
      },
    };
    expect(ids(ws, 'A')).toEqual([]);
  });
});

describe('nearestCategoryNode', () => {
  it('skips virtual folders up to the enclosing category, and is null outside any category', () => {
    const ws = membershipWs();
    expect(nearestCategoryNode(ws, 'F')?.id).toBe('A');
    expect(nearestCategoryNode(ws, 'C')?.id).toBe('C');
    expect(nearestCategoryNode(ws, 'root')).toBeNull();
  });
});
