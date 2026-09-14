/**
 * radialPlacement — the ring assignment IS the architecture the view communicates, so the invariants
 * are asserted rather than eyeballed: homepage at the centre, one ring per hop, externals outside
 * everything, and no node left unplaced.
 */

import { describe, expect, it } from 'vitest';
import { radialPlacement } from './layout';
import type { LinkGraph } from './graph';

const node = (id: string, over: Partial<LinkGraph['nodes'][number]> = {}): LinkGraph['nodes'][number] => ({
  id,
  label: id,
  type: 'content',
  pillarId: null,
  inboundInternal: 0,
  outboundInternal: 0,
  orphan: false,
  ...over,
});

const edge = (source: string, target: string, type: LinkGraph['edges'][number]['type'] = 'internal') => ({
  id: `${source}->${target}`,
  source,
  target,
  type,
});

const dist = (p: [number, number]) => Math.hypot(p[0], p[1]);

describe('radialPlacement', () => {
  it('returns nothing for an empty graph rather than throwing', () => {
    const out = radialPlacement({ nodes: [], edges: [] });
    expect(out.centerId).toBeNull();
    expect(out.positions).toEqual({});
  });

  it('puts the homepage at the origin', () => {
    const g: LinkGraph = {
      nodes: [node('home', { isHome: true }), node('a'), node('b')],
      edges: [edge('home', 'a'), edge('a', 'b')],
    };
    const { positions, centerId } = radialPlacement(g);
    expect(centerId).toBe('home');
    expect(positions.home).toEqual([0, 0]);
  });

  it('places each node one ring further out per link hop', () => {
    const g: LinkGraph = {
      nodes: [node('home', { isHome: true }), node('a'), node('b'), node('c')],
      edges: [edge('home', 'a'), edge('a', 'b'), edge('b', 'c')],
    };
    const { positions, ringOf } = radialPlacement(g);
    expect([ringOf.home, ringOf.a, ringOf.b, ringOf.c]).toEqual([0, 1, 2, 3]);
    expect(dist(positions.a)).toBeLessThan(dist(positions.b));
    expect(dist(positions.b)).toBeLessThan(dist(positions.c));
  });

  it('pushes external domains outside every internal node', () => {
    // `ext` links off the homepage itself — one hop — so only the explicit rule keeps it outermost.
    const g: LinkGraph = {
      nodes: [node('home', { isHome: true }), node('a'), node('b'), node('ext', { type: 'external' })],
      edges: [edge('home', 'a'), edge('a', 'b'), edge('home', 'ext', 'external')],
    };
    const { positions, ringOf } = radialPlacement(g);
    expect(ringOf.ext).toBeGreaterThan(Math.max(ringOf.home, ringOf.a, ringOf.b));
    expect(dist(positions.ext)).toBeGreaterThan(dist(positions.b));
  });

  it('does not let an external node bridge two unrelated pages onto the same ring', () => {
    // Both pages link to the same external domain. Walking through it would make `far` a 2-hop node;
    // it is actually unreachable from home and must land on the detached ring instead.
    const g: LinkGraph = {
      nodes: [node('home', { isHome: true }), node('near'), node('far'), node('ext', { type: 'external' })],
      edges: [edge('home', 'near'), edge('near', 'ext', 'external'), edge('far', 'ext', 'external')],
    };
    const { ringOf } = radialPlacement(g);
    expect(ringOf.near).toBe(1);
    expect(ringOf.far).toBeGreaterThan(ringOf.near);
  });

  it('places disconnected content beyond the connected graph but inside the external ring', () => {
    const g: LinkGraph = {
      nodes: [node('home', { isHome: true }), node('a'), node('lonely'), node('ext', { type: 'external' })],
      edges: [edge('home', 'a'), edge('home', 'ext', 'external')],
    };
    const { ringOf } = radialPlacement(g);
    expect(ringOf.lonely).toBeGreaterThan(ringOf.a);
    expect(ringOf.ext).toBeGreaterThan(ringOf.lonely);
  });

  it('falls back to the most-connected node when no homepage is known', () => {
    const g: LinkGraph = {
      nodes: [node('hub'), node('a'), node('b'), node('c')],
      edges: [edge('hub', 'a'), edge('hub', 'b'), edge('hub', 'c')],
    };
    expect(radialPlacement(g).centerId).toBe('hub');
  });

  it('gives every node a finite position', () => {
    const g: LinkGraph = {
      nodes: [node('home', { isHome: true }), node('a'), node('b'), node('ext', { type: 'external' })],
      edges: [edge('home', 'a'), edge('a', 'b'), edge('b', 'ext', 'external')],
    };
    const { positions } = radialPlacement(g);
    for (const n of g.nodes) {
      expect(positions[n.id]).toBeDefined();
      expect(Number.isFinite(positions[n.id][0]) && Number.isFinite(positions[n.id][1])).toBe(true);
    }
  });

  it('grows a crowded ring so neighbours keep their spacing', () => {
    const many = Array.from({ length: 40 }, (_, i) => node(`n${i}`));
    const g: LinkGraph = {
      nodes: [node('home', { isHome: true }), ...many],
      edges: many.map(n => edge('home', n.id)),
    };
    const { positions } = radialPlacement(g, { ringGap: 100, minSpacing: 120 });
    // 40 nodes × 120 spacing needs a circumference of 4800 → radius well beyond one ringGap.
    expect(dist(positions.n0)).toBeGreaterThan(100);
  });

  it('is deterministic — the same graph always yields the same picture', () => {
    const g: LinkGraph = {
      nodes: [node('home', { isHome: true }), node('a'), node('b')],
      edges: [edge('home', 'a'), edge('home', 'b')],
    };
    expect(radialPlacement(g).positions).toEqual(radialPlacement(g).positions);
  });
});

describe('radialPlacement — ring radii', () => {
  it('never lets an outer ring fall inside an inner one, however crowded the inner ring is', () => {
    // 60 nodes on ring 1 force it to grow far past one ringGap; ring 2 must still sit beyond it.
    const ring1 = Array.from({ length: 60 }, (_, i) => node(`a${i}`));
    const g: LinkGraph = {
      nodes: [node('home', { isHome: true }), ...ring1, node('deep')],
      edges: [...ring1.map(n => edge('home', n.id)), edge('a0', 'deep')],
    };
    const { positions } = radialPlacement(g, { ringGap: 100, minSpacing: 140 });
    const innerMax = Math.max(...ring1.map(n => dist(positions[n.id])));
    expect(dist(positions.deep)).toBeGreaterThan(innerMax);
  });

  it('keeps the external ring just outside the content, not flung to a multiple of the gap', () => {
    const chain = ['a', 'b', 'c', 'd'];
    const g: LinkGraph = {
      nodes: [node('home', { isHome: true }), ...chain.map(id => node(id)), node('ext', { type: 'external' })],
      edges: [edge('home', 'a'), ...chain.slice(1).map((id, i) => edge(chain[i], id)), edge('home', 'ext', 'external')],
    };
    const { positions } = radialPlacement(g, { ringGap: 100, minSpacing: 10 });
    // 5 internal rings then the external one: one gap beyond the last content ring, not 6×.
    expect(dist(positions.ext) - dist(positions.d)).toBeCloseTo(100, 0);
  });
});

describe('radialPlacement — edge length', () => {
  /** Angular gap between two placed nodes, 0..π. */
  const angleGap = (a: [number, number], b: [number, number]) => {
    const d = Math.abs(Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
    return Math.min(d, 2 * Math.PI - d);
  };

  it('puts an external domain beside the page that links to it, not across the graph', () => {
    // Eight ring-1 pages; only `p3` links out. Without angular anchoring the external node takes
    // whatever slot is left and its single edge spans the whole picture.
    const pages = Array.from({ length: 8 }, (_, i) => node(`p${i}`));
    const g: LinkGraph = {
      nodes: [node('home', { isHome: true }), ...pages, node('ext', { type: 'external' })],
      edges: [...pages.map(p => edge('home', p.id)), edge('p3', 'ext', 'external')],
    };
    const { positions } = radialPlacement(g);
    // Nearer in angle to its own source than to the average page — i.e. genuinely anchored.
    expect(angleGap(positions.ext, positions.p3)).toBeLessThan(Math.PI / 4);
  });

  it('averages anchors as directions, so a node between angle ~0 and ~2π does not flip to the far side', () => {
    // `a` and `b` end up at the first and last slots of ring 1 — adjacent on the circle, but their
    // raw numeric mean is π, the exact opposite side.
    const ring1 = Array.from({ length: 6 }, (_, i) => node(`r${i}`));
    const g: LinkGraph = {
      nodes: [node('home', { isHome: true }), ...ring1, node('shared')],
      edges: [...ring1.map(n => edge('home', n.id)), edge('r0', 'shared'), edge('r5', 'shared')],
    };
    const { positions } = radialPlacement(g);
    const toR0 = angleGap(positions.shared, positions.r0);
    const toR5 = angleGap(positions.shared, positions.r5);
    expect(Math.max(toR0, toR5)).toBeLessThan(Math.PI / 2);
  });
});

describe('radialPlacement — sector allocation', () => {
  const angleOf = (p: [number, number]) => {
    const a = Math.atan2(p[1], p[0]);
    return a < 0 ? a + 2 * Math.PI : a;
  };
  const gap = (a: number, b: number) => Math.min(Math.abs(a - b), 2 * Math.PI - Math.abs(a - b));

  /** home → 3 pillars, each with `perPillar` articles. */
  const siloGraph = (perPillar: number) => {
    const pillars = ['P0', 'P1', 'P2'].map(id => node(id));
    const leaves = pillars.flatMap(p => Array.from({ length: perPillar }, (_, i) => node(`${p.id}_a${i}`)));
    return {
      nodes: [node('home', { isHome: true }), ...pillars, ...leaves],
      edges: [
        ...pillars.map(p => edge('home', p.id)),
        ...pillars.flatMap(p => Array.from({ length: perPillar }, (_, i) => edge(p.id, `${p.id}_a${i}`))),
      ],
      pillars,
    };
  };

  it('keeps a silo contiguous — every article sits inside its own pillar wedge', () => {
    const { pillars, ...g } = siloGraph(4);
    const { positions } = radialPlacement(g as LinkGraph);
    for (const p of pillars) {
      const own = Array.from({ length: 4 }, (_, i) => angleOf(positions[`${p.id}_a${i}`]));
      const others = pillars
        .filter(q => q.id !== p.id)
        .flatMap(q => Array.from({ length: 4 }, (_, i) => angleOf(positions[`${q.id}_a${i}`])));
      // The pillar's own articles are all angularly nearer to it than any other pillar's article.
      const worstOwn = Math.max(...own.map(a => gap(a, angleOf(positions[p.id]))));
      const bestOther = Math.min(...others.map(a => gap(a, angleOf(positions[p.id]))));
      expect(worstOwn).toBeLessThan(bestOther);
    }
  });

  it('sizes a wedge by how much the subtree holds, not by counting branches', () => {
    const big = Array.from({ length: 12 }, (_, i) => node(`big_a${i}`));
    const g: LinkGraph = {
      nodes: [node('home', { isHome: true }), node('big'), node('small'), ...big, node('small_a0')],
      edges: [
        edge('home', 'big'),
        edge('home', 'small'),
        ...big.map(n => edge('big', n.id)),
        edge('small', 'small_a0'),
      ],
    };
    const { positions } = radialPlacement(g);
    // The 12-article silo must span far more of the circle than the 1-article one.
    const bigSpan = Math.max(...big.map(n => gap(angleOf(positions[n.id]), angleOf(positions.big))));
    const smallSpan = gap(angleOf(positions.small_a0), angleOf(positions.small));
    expect(bigSpan).toBeGreaterThan(smallSpan);
  });

  it('keeps a crowded ring from flinging everything outside it into the distance', () => {
    // 60 leaves under one pillar: uncapped, the ring radius would be minSpacing/tinyAngle.
    const leaves = Array.from({ length: 60 }, (_, i) => node(`a${i}`));
    const g: LinkGraph = {
      nodes: [node('home', { isHome: true }), node('p'), ...leaves],
      edges: [edge('home', 'p'), ...leaves.map(n => edge('p', n.id))],
    };
    const { positions } = radialPlacement(g, { ringGap: 100, minSpacing: 120, maxRingStretch: 3 });
    expect(dist(positions.a0)).toBeLessThanOrEqual(100 + 100 * 3 + 0.001);
  });

  it('does not depend on the order edges happen to arrive in', () => {
    const { pillars: _p, ...g } = siloGraph(3);
    const shuffled: LinkGraph = { nodes: [...g.nodes], edges: [...g.edges].reverse() };
    expect(radialPlacement(shuffled).positions).toEqual(radialPlacement(g as LinkGraph).positions);
  });
});

describe('radialPlacement — hierarchy wins over a shortcut link', () => {
  it('keeps a page under its type-root even when the homepage links straight to it', () => {
    // The exact shape that broke in practice: 「Pages」 is the structural parent of About Us, but the
    // homepage's nav also links About Us directly. Walking all edges at once let 首页 adopt it and
    // left 「Pages」 an empty shell.
    // A sibling pillar is present so 「Pages」 owns a real wedge rather than the whole circle —
    // otherwise "inside the parent's wedge" is vacuously true.
    const g: LinkGraph = {
      nodes: [
        node('home', { isHome: true }),
        node('Pages'),
        node('about'),
        node('contact'),
        node('Posts'),
        node('post1'),
        node('post2'),
      ],
      edges: [
        edge('home', 'Pages', 'backbone'),
        edge('Pages', 'about', 'backbone'),
        edge('Pages', 'contact', 'backbone'),
        edge('home', 'Posts', 'backbone'),
        edge('Posts', 'post1', 'backbone'),
        edge('Posts', 'post2', 'backbone'),
        edge('home', 'about'), // nav link — one hop, but not the hierarchy
        edge('home', 'contact'),
      ],
    };
    const { ringOf, positions } = radialPlacement(g);
    expect(ringOf.Pages).toBe(1);
    // Structurally two levels down, so two rings out — not pulled to ring 1 by the nav link.
    expect(ringOf.about).toBe(2);
    expect(ringOf.contact).toBe(2);
    // And they live in Pages' wedge: nearer in angle to Pages than the wedge is wide.
    const ang = (p: [number, number]) => Math.atan2(p[1], p[0]);
    const gapTo = (id: string) => {
      const d = Math.abs(ang(positions[id]) - ang(positions.Pages));
      return Math.min(d, 2 * Math.PI - d);
    };
    // Nearer to their own parent than any of the sibling pillar's posts are.
    const worstOwn = Math.max(gapTo('about'), gapTo('contact'));
    const bestOther = Math.min(gapTo('post1'), gapTo('post2'));
    expect(worstOwn).toBeLessThan(bestOther);
  });

  it('still reaches content that has no backbone path at all', () => {
    // No backbone edges anywhere — must degrade to the plain link walk rather than orphan everything.
    const g: LinkGraph = {
      nodes: [node('home', { isHome: true }), node('a'), node('b')],
      edges: [edge('home', 'a'), edge('a', 'b')],
    };
    const { ringOf } = radialPlacement(g);
    expect([ringOf.a, ringOf.b]).toEqual([1, 2]);
  });
});
