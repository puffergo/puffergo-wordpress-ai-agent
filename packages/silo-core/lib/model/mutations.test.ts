/**
 * Unit tests for the pure workspace mutation helpers.
 */

import { describe, expect, it } from 'vitest';
import { emptyWorkspace, createNode, createContent, emptySeo } from './factory';
import {
  addNode,
  addContent,
  updateNode,
  updateContent,
  collectSubtreeNodeIds,
  moveContent,
  moveNode,
  deleteNode,
  setContentLinks,
  deleteContent,
  addKeyword,
  updateKeyword,
  deleteKeyword,
} from './mutations';
import type { SiloWorkspace } from './types';

const baseWs = (): SiloWorkspace => emptyWorkspace({ name: 'Test Site', url: 'https://example.com' });

describe('addNode', () => {
  it('adds a top-level pillar and returns the created node', () => {
    const { ws, node } = addNode(baseWs(), 'solar light', 'pillar', null);
    expect(ws.nodes).toHaveLength(1);
    expect(ws.nodes[0]).toBe(node);
    expect(node.term).toBe('solar light');
    expect(node.parentId).toBeNull();
  });

  it('does not mutate the original workspace', () => {
    const ws0 = baseWs();
    addNode(ws0, 'solar light', 'pillar', null);
    expect(ws0.nodes).toHaveLength(0);
  });

  it('carries the intent through when provided', () => {
    const { node } = addNode(baseWs(), 'buy solar light', 'cluster', 'p1', 'commercial');
    expect(node.intent).toBe('commercial');
  });
});

describe('addContent', () => {
  it('adds a content item under a node with default postType "post"', () => {
    const { ws, content } = addContent(baseWs(), 'n1', 'Best Solar Lights 2026');
    expect(ws.contents).toHaveLength(1);
    expect(content.postType).toBe('post');
    expect(content.siloNodeId).toBe('n1');
    expect(content.wpPostId).toBeNull();
  });

  it('honors an explicit postType', () => {
    const { content } = addContent(baseWs(), 'n1', 'Widget', 'product');
    expect(content.postType).toBe('product');
  });
});

describe('updateNode', () => {
  it('patches only the matching node', () => {
    let ws = baseWs();
    ws = { ...ws, nodes: [createNode('a', 'pillar', null), createNode('b', 'pillar', null)] };
    const [a, b] = ws.nodes;
    const next = updateNode(ws, a.id, { term: 'a-renamed' });
    expect(next.nodes.find(n => n.id === a.id)?.term).toBe('a-renamed');
    expect(next.nodes.find(n => n.id === b.id)?.term).toBe('b');
  });

  it('is a no-op (structurally) when the id does not exist', () => {
    const ws = { ...baseWs(), nodes: [createNode('a', 'pillar', null)] };
    const next = updateNode(ws, 'missing', { term: 'x' });
    expect(next.nodes).toEqual(ws.nodes);
  });
});

describe('updateContent', () => {
  it('patches only the matching content', () => {
    const c1 = createContent('n1', 'A');
    const c2 = createContent('n1', 'B');
    const ws = { ...baseWs(), contents: [c1, c2] };
    const next = updateContent(ws, c1.id, { title: 'A2' });
    expect(next.contents.find(c => c.id === c1.id)?.title).toBe('A2');
    expect(next.contents.find(c => c.id === c2.id)?.title).toBe('B');
  });
});

describe('collectSubtreeNodeIds', () => {
  it('includes the node itself plus all descendants', () => {
    const root = createNode('root', 'pillar', null);
    const child = createNode('child', 'cluster', root.id);
    const grandchild = createNode('grandchild', 'cluster', child.id);
    const unrelated = createNode('unrelated', 'pillar', null);
    const ws = { ...baseWs(), nodes: [root, child, grandchild, unrelated] };
    const ids = collectSubtreeNodeIds(ws, root.id);
    expect(ids).toEqual(new Set([root.id, child.id, grandchild.id]));
  });

  it('returns just the node id itself for a leaf with no children', () => {
    const leaf = createNode('leaf', 'cluster', null);
    const ws = { ...baseWs(), nodes: [leaf] };
    expect(collectSubtreeNodeIds(ws, leaf.id)).toEqual(new Set([leaf.id]));
  });

  it('returns a singleton set for an id that does not exist in the workspace', () => {
    const ws = baseWs();
    expect(collectSubtreeNodeIds(ws, 'nope')).toEqual(new Set(['nope']));
  });
});

describe('moveContent', () => {
  it('reassigns siloNodeId and leaves everything else untouched', () => {
    const c = createContent('n1', 'A');
    const ws = { ...baseWs(), contents: [c] };
    const next = moveContent(ws, c.id, 'n2');
    expect(next.contents[0].siloNodeId).toBe('n2');
    expect(next.contents[0].title).toBe('A');
  });

  it('is a no-op for an unknown content id', () => {
    const c = createContent('n1', 'A');
    const ws = { ...baseWs(), contents: [c] };
    const next = moveContent(ws, 'missing', 'n2');
    expect(next.contents).toEqual(ws.contents);
  });
});

describe('moveNode', () => {
  it('reparents a node and flips kind to cluster when nested', () => {
    const a = createNode('a', 'pillar', null);
    const b = createNode('b', 'pillar', null);
    const ws = { ...baseWs(), nodes: [a, b] };
    const next = moveNode(ws, b.id, a.id);
    const moved = next.nodes.find(n => n.id === b.id)!;
    expect(moved.parentId).toBe(a.id);
    expect(moved.kind).toBe('cluster');
  });

  it('flips kind to pillar when moved to top level', () => {
    const a = createNode('a', 'pillar', null);
    const b = createNode('b', 'cluster', a.id);
    const ws = { ...baseWs(), nodes: [a, b] };
    const next = moveNode(ws, b.id, null);
    const moved = next.nodes.find(n => n.id === b.id)!;
    expect(moved.parentId).toBeNull();
    expect(moved.kind).toBe('pillar');
  });

  it('is a no-op when the target parent equals the node itself', () => {
    const a = createNode('a', 'pillar', null);
    const ws = { ...baseWs(), nodes: [a] };
    const next = moveNode(ws, a.id, a.id);
    expect(next).toBe(ws);
  });

  it('guards against creating a cycle (dropping a node into its own subtree)', () => {
    const root = createNode('root', 'pillar', null);
    const child = createNode('child', 'cluster', root.id);
    const ws = { ...baseWs(), nodes: [root, child] };
    const next = moveNode(ws, root.id, child.id);
    expect(next).toBe(ws);
    expect(next.nodes.find(n => n.id === root.id)?.parentId).toBeNull();
  });
});

describe('deleteNode', () => {
  it('removes the node, its whole subtree, their contents, and touching edges', () => {
    const root = createNode('root', 'pillar', null);
    const child = createNode('child', 'cluster', root.id);
    const survivor = createNode('survivor', 'pillar', null);
    const c1 = createContent(root.id, 'under root');
    const c2 = createContent(child.id, 'under child');
    const c3 = createContent(survivor.id, 'under survivor');
    const ws: SiloWorkspace = {
      ...baseWs(),
      nodes: [root, child, survivor],
      contents: [c1, c2, c3],
      edges: [
        { from: c1.id, to: c3.id, type: 'internal-link' },
        { from: c3.id, to: c1.id, type: 'internal-link' },
        { from: c3.id, to: 'https://external.example', type: 'external-link' },
      ],
    };
    const next = deleteNode(ws, root.id);
    expect(next.nodes.map(n => n.id)).toEqual([survivor.id]);
    expect(next.contents.map(c => c.id)).toEqual([c3.id]);
    // both edges touching c1 (which got deleted) should be gone; c3's external edge survives
    expect(next.edges).toEqual([{ from: c3.id, to: 'https://external.example', type: 'external-link' }]);
  });
});

describe('setContentLinks', () => {
  it('replaces internal + external links for the content, preserving anchor/dofollow of surviving edges', () => {
    const a = createContent('n1', 'A');
    const b = createContent('n1', 'B');
    const c = createContent('n1', 'C');
    const ws: SiloWorkspace = {
      ...baseWs(),
      contents: [a, b, c],
      edges: [
        { from: a.id, to: b.id, type: 'internal-link', anchor: 'read more', dofollow: true },
        { from: a.id, to: 'https://old.example', type: 'external-link' },
      ],
    };
    const next = setContentLinks(ws, a.id, [b.id, c.id], ['https://new.example']);
    const fromA = next.edges.filter(e => e.from === a.id);
    expect(fromA).toHaveLength(3);
    const toB = fromA.find(e => e.to === b.id)!;
    expect(toB.anchor).toBe('read more');
    expect(toB.dofollow).toBe(true);
    const toC = fromA.find(e => e.to === c.id)!;
    expect(toC.anchor).toBeUndefined();
    expect(fromA.find(e => e.to === 'https://old.example')).toBeUndefined();
    expect(fromA.find(e => e.to === 'https://new.example')).toBeDefined();
  });

  it('drops self-links and de-dupes targets', () => {
    const a = createContent('n1', 'A');
    const b = createContent('n1', 'B');
    const ws: SiloWorkspace = { ...baseWs(), contents: [a, b], edges: [] };
    const next = setContentLinks(ws, a.id, [a.id, b.id, b.id], ['', 'https://x.example', 'https://x.example']);
    const fromA = next.edges.filter(e => e.from === a.id);
    expect(fromA).toHaveLength(2);
    expect(fromA.some(e => e.to === a.id)).toBe(false);
  });

  it("leaves other content's edges untouched", () => {
    const a = createContent('n1', 'A');
    const b = createContent('n1', 'B');
    const ws: SiloWorkspace = {
      ...baseWs(),
      contents: [a, b],
      edges: [{ from: b.id, to: a.id, type: 'internal-link' }],
    };
    const next = setContentLinks(ws, a.id, [], []);
    expect(next.edges).toEqual([{ from: b.id, to: a.id, type: 'internal-link' }]);
  });
});

describe('deleteContent', () => {
  it('removes the content and any edges touching it', () => {
    const a = createContent('n1', 'A');
    const b = createContent('n1', 'B');
    const ws: SiloWorkspace = {
      ...baseWs(),
      contents: [a, b],
      edges: [
        { from: a.id, to: b.id, type: 'internal-link' },
        { from: b.id, to: a.id, type: 'internal-link' },
      ],
    };
    const next = deleteContent(ws, a.id);
    expect(next.contents.map(c => c.id)).toEqual([b.id]);
    expect(next.edges).toEqual([]);
  });
});

describe('addKeyword', () => {
  it('creates a new local keyword entity', () => {
    const { ws, keyword } = addKeyword(baseWs(), 'solar light');
    expect(ws.keywords).toHaveLength(1);
    expect(keyword.term).toBe('solar light');
    expect(keyword.source).toBe('local');
  });

  it('is idempotent by normalized term: a second add with different casing/whitespace returns the existing entity, no duplicate', () => {
    const { ws: ws1, keyword: k1 } = addKeyword(baseWs(), 'Solar Light');
    const { ws: ws2, keyword: k2 } = addKeyword(ws1, '  solar light  ');
    expect(ws2.keywords).toHaveLength(1);
    expect(k2.id).toBe(k1.id);
  });

  it('returns the ws unchanged (same ref) and a synthetic empty-id keyword for a blank term', () => {
    const ws0 = baseWs();
    const { ws, keyword } = addKeyword(ws0, '   ');
    expect(ws).toBe(ws0);
    expect(keyword.id).toBe('');
  });
});

describe('updateKeyword', () => {
  it('is a no-op for an unknown id', () => {
    const ws0 = baseWs();
    expect(updateKeyword(ws0, 'missing', { term: 'x' })).toBe(ws0);
  });

  it('renames the term and propagates into every content/category SEO field that used the EXACT old term (case-insensitive)', () => {
    const { ws: ws1, keyword } = addKeyword(baseWs(), 'solar light');
    const content = createContent('n1', 'A', 'post', {
      // Only the exact-match entry ('Solar Light') is a rename target; a longer phrase that merely
      // *contains* the term ('best Solar Light 2026') is NOT touched — renameTermInSeo matches whole
      // keyword strings only, it does not do substring replacement within a phrase.
      seo: { ...emptySeo(), coreKeywords: ['Solar Light'], longTailKeywords: ['best Solar Light 2026'] },
    });
    const catNode = createNode('cat', 'pillar', null, {
      seo: { ...emptySeo(), coreKeywords: ['solar light'] },
    });
    const ws2 = { ...ws1, contents: [content], nodes: [catNode] };
    const next = updateKeyword(ws2, keyword.id, { term: 'solar street light' });
    expect(next.keywords.find(k => k.id === keyword.id)?.term).toBe('solar street light');
    expect(next.contents[0].seo.coreKeywords).toEqual(['solar street light']);
    expect(next.contents[0].seo.longTailKeywords).toEqual(['best Solar Light 2026']);
    expect(next.nodes[0].seo?.coreKeywords).toEqual(['solar street light']);
  });

  it('merges into an existing keyword when the new term collides, dropping the collided-into entity and keeping the renamed id', () => {
    const { ws: ws1, keyword: kA } = addKeyword(baseWs(), 'solar light');
    const { ws: ws2, keyword: kB } = addKeyword(ws1, 'solar lamp');
    const next = updateKeyword(ws2, kA.id, { term: 'solar lamp' });
    expect(next.keywords).toHaveLength(1);
    expect(next.keywords[0].id).toBe(kA.id);
    expect(next.keywords.find(k => k.id === kB.id)).toBeUndefined();
  });

  it('patches non-term fields without triggering a rename', () => {
    const { ws: ws1, keyword } = addKeyword(baseWs(), 'solar light');
    const next = updateKeyword(ws1, keyword.id, { intent: 'commercial' });
    expect(next.keywords[0].term).toBe('solar light');
    expect(next.keywords[0].intent).toBe('commercial');
  });
});

describe('deleteKeyword', () => {
  it('removes the keyword entity only, never touching content/category SEO fields that reference it', () => {
    const { ws: ws1, keyword } = addKeyword(baseWs(), 'solar light');
    const content = createContent('n1', 'A', 'post', {
      seo: { ...emptySeo(), coreKeywords: ['solar light'] },
    });
    const ws2 = { ...ws1, contents: [content] };
    const next = deleteKeyword(ws2, keyword.id);
    expect(next.keywords).toEqual([]);
    // content SEO is untouched — deletion is entity-only, not cascading
    expect(next.contents[0].seo.coreKeywords).toEqual(['solar light']);
  });

  it('is a no-op for an unknown id', () => {
    const ws0 = baseWs();
    expect(deleteKeyword(ws0, 'missing')).toBe(ws0);
  });

  it('is idempotent: deleting twice is safe', () => {
    const { ws: ws1, keyword } = addKeyword(baseWs(), 'solar light');
    const once = deleteKeyword(ws1, keyword.id);
    const twice = deleteKeyword(once, keyword.id);
    expect(twice.keywords).toEqual([]);
  });
});
