/**
 * linkGraph — the invariants a renderer depends on. Edge-id uniqueness in particular is not cosmetic:
 * G6 aborts the entire render on a duplicate, so a violation means a blank screen, not a stray line.
 */

import { describe, expect, it } from 'vitest';
import { emptyWorkspace, createNode, createContent } from './factory';
import { linkGraph, GRAPH_ROOT_ID } from './graph';
import type { SiloWorkspace } from './types';

const SITE = 'https://example.com';
const base = (): SiloWorkspace => emptyWorkspace({ name: 'Site', url: SITE });

describe('linkGraph — root', () => {
  it('uses the synthetic positioning root when no homepage has been imported', () => {
    const pillar = createNode('p', 'pillar', null);
    const g = linkGraph({ ...base(), nodes: [pillar] });
    expect(g.nodes.find(n => n.id === GRAPH_ROOT_ID)).toBeDefined();
  });

  it('drops the synthetic root once the homepage exists — they are the same thing', () => {
    const pillar = createNode('p', 'pillar', null);
    const home = { ...createContent(pillar.id, 'Home'), wpLink: `${SITE}/` };
    const g = linkGraph({ ...base(), nodes: [pillar], contents: [home] });
    expect(g.nodes.find(n => n.id === GRAPH_ROOT_ID)).toBeUndefined();
    expect(g.nodes.find(n => n.isHome)?.id).toBe(home.id);
    // Pillars now hang off the homepage.
    expect(g.edges.some(e => e.type === 'backbone' && e.source === home.id && e.target === pillar.id)).toBe(true);
  });

  it('does not hang the homepage off its own type-root, which would close a cycle', () => {
    const pillar = createNode('p', 'pillar', null);
    const home = { ...createContent(pillar.id, 'Home'), wpLink: `${SITE}/` };
    const g = linkGraph({ ...base(), nodes: [pillar], contents: [home] });
    expect(g.edges.some(e => e.source === pillar.id && e.target === home.id)).toBe(false);
  });
});

describe('linkGraph — edge ids', () => {
  it('are unique even when a real link runs along the backbone', () => {
    // The homepage menu links to a section: that pair is BOTH the backbone and an internal link.
    const pillar = createNode('p', 'pillar', null);
    const home = { ...createContent(pillar.id, 'Home'), wpLink: `${SITE}/` };
    const ws: SiloWorkspace = {
      ...base(),
      nodes: [pillar],
      contents: [home],
      edges: [{ from: home.id, to: pillar.id, type: 'internal-link', placement: 'nav' }],
    };
    const g = linkGraph(ws);
    const ids = g.edges.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the authored link and drops the duplicate structural edge', () => {
    const pillar = createNode('p', 'pillar', null);
    const home = { ...createContent(pillar.id, 'Home'), wpLink: `${SITE}/` };
    const ws: SiloWorkspace = {
      ...base(),
      nodes: [pillar],
      contents: [home],
      edges: [{ from: home.id, to: pillar.id, type: 'internal-link', placement: 'nav' }],
    };
    const pair = linkGraph(ws).edges.filter(e => e.source === home.id && e.target === pillar.id);
    expect(pair).toHaveLength(1);
    expect(pair[0].type).toBe('internal');
    expect(pair[0].placement).toBe('nav');
  });

  it('stay unique across backbone / internal / external in a busier graph', () => {
    const pillar = createNode('p', 'pillar', null);
    const child = createNode('c', 'cluster', pillar.id);
    const home = { ...createContent(pillar.id, 'Home'), wpLink: `${SITE}/` };
    const a = { ...createContent(child.id, 'A'), wpLink: `${SITE}/a/` };
    const ws: SiloWorkspace = {
      ...base(),
      nodes: [pillar, child],
      contents: [home, a],
      edges: [
        { from: home.id, to: pillar.id, type: 'internal-link' },
        { from: home.id, to: a.id, type: 'internal-link' },
        { from: a.id, to: home.id, type: 'internal-link' },
        { from: home.id, to: 'https://other.com/', type: 'external-link' },
        { from: a.id, to: 'https://other.com/', type: 'external-link' },
      ],
    };
    const ids = linkGraph(ws).edges.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
