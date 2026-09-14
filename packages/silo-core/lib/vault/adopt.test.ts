import { describe, expect, it } from 'vitest';
import { emptyWorkspace } from '../model/factory';
import { ensureNodePathByTerms } from './adopt';

describe('ensureNodePathByTerms', () => {
  it('creates a pillar→cluster chain when nothing matches yet', () => {
    const ws = emptyWorkspace({ name: 'S', url: '' });
    const { ws: next, nodeId } = ensureNodePathByTerms(ws, ['Solar Street Light', 'How It Works']);

    expect(next.nodes).toHaveLength(2);
    const pillar = next.nodes.find(n => n.term === 'Solar Street Light')!;
    const cluster = next.nodes.find(n => n.term === 'How It Works')!;
    expect(pillar.kind).toBe('pillar');
    expect(pillar.parentId).toBeNull();
    expect(cluster.kind).toBe('cluster');
    expect(cluster.parentId).toBe(pillar.id);
    expect(nodeId).toBe(cluster.id);
  });

  it('reuses an existing node instead of creating a near-duplicate (case-insensitive match)', () => {
    const ws0 = emptyWorkspace({ name: 'S', url: '' });
    const { ws: seeded } = ensureNodePathByTerms(ws0, ['Solar Street Light']);

    const { ws: next, nodeId } = ensureNodePathByTerms(seeded, ['solar street light', 'New Cluster']);

    expect(next.nodes.filter(n => n.term.toLowerCase() === 'solar street light')).toHaveLength(1);
    const pillar = next.nodes.find(n => n.term.toLowerCase() === 'solar street light')!;
    const cluster = next.nodes.find(n => n.term === 'New Cluster')!;
    expect(cluster.parentId).toBe(pillar.id);
    expect(nodeId).toBe(cluster.id);
  });

  it('keeps same-named terms under DIFFERENT parents as separate nodes (matches parent+term, not term alone)', () => {
    const ws0 = emptyWorkspace({ name: 'S', url: '' });
    const { ws: withA } = ensureNodePathByTerms(ws0, ['Pillar A', 'Shared Name']);
    const { ws: next } = ensureNodePathByTerms(withA, ['Pillar B', 'Shared Name']);

    expect(next.nodes.filter(n => n.term === 'Shared Name')).toHaveLength(2);
  });

  it('resolves to nodeId: null for an all-blank path (e.g. a note at the vault root)', () => {
    const ws = emptyWorkspace({ name: 'S', url: '' });
    const { ws: next, nodeId } = ensureNodePathByTerms(ws, ['']);
    expect(nodeId).toBeNull();
    expect(next.nodes).toHaveLength(0);
  });
});
