/**
 * radialPlacement — deterministic concentric-ring coordinates for the link graph.
 *
 * Replaces a force simulation. A force layout has no notion of where authority ENTERS the site, so
 * every node competes for the middle and the result reads as noise however the edges are styled. Here
 * the picture states the architecture directly: the homepage sits at the centre, each ring outward is
 * one link-hop further from it, and external domains are pushed past everything else so the outermost
 * ring is unambiguously "off this site".
 *
 * Angles come from SECTOR ALLOCATION, not from spreading each ring evenly. Each subtree owns a wedge
 * of the circle sized by how much it contains, and its descendants are placed only inside that wedge.
 * The alternative — every ring independently spread over the full circle — gives a subtree no
 * territory of its own: a category lands at one angle while its articles compete for slots against
 * every other silo's articles, and the edges back to the parent stretch across the whole disc. Sectors
 * make a silo a contiguous wedge, so those edges are short and the shape of the site is legible.
 *
 * Being pure and non-iterative also removes the multi-second settling wait and the position cache that
 * existed only to hide it — the same workspace always yields the same picture.
 *
 * Coordinates are unitless and centred on (0,0); the renderer fits them to the viewport.
 */

import type { LinkGraph } from './graph';

export interface RadialOptions {
  /** Distance between consecutive rings. */
  ringGap?: number;
  /** Target arc length between neighbours on a ring — a ring grows to honour it, up to the cap below. */
  minSpacing?: number;
  /**
   * How far one ring may grow past `ringGap` to relieve crowding, as a multiple of `ringGap`. Without
   * a cap, a single silo holding dozens of leaves flings its ring — and everything outside it — into
   * the distance, trading a little label overlap for a canvas that is mostly empty.
   */
  maxRingStretch?: number;
}

// Tuned against a real ~40-node site. Deliberately tight: the rings only have to be far enough apart
// to read as separate rings, and a node's label may clip a neighbour's — that costs less than forcing
// the user to pan across a mostly-empty canvas to see a graph this small. Zoom handles the rest.
const DEFAULTS = { ringGap: 170, minSpacing: 88, maxRingStretch: 3 } as const;

/** Ring 0 is the centre; everything else is placed by hop distance from it. */
export interface RadialPlacement {
  positions: Record<string, [number, number]>;
  /** Node id at the centre — the homepage when there is one. */
  centerId: string | null;
  /** Ring index per node, exposed for tests and for anything wanting to reason about depth. */
  ringOf: Record<string, number>;
}

export function radialPlacement(graph: LinkGraph, opts: RadialOptions = {}): RadialPlacement {
  const ringGap = opts.ringGap ?? DEFAULTS.ringGap;
  const minSpacing = opts.minSpacing ?? DEFAULTS.minSpacing;
  const maxRingStretch = opts.maxRingStretch ?? DEFAULTS.maxRingStretch;

  const positions: Record<string, [number, number]> = {};
  const ringOf: Record<string, number> = {};
  if (!graph.nodes.length) return { positions, centerId: null, ringOf };

  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const isExternal = (id: string) => byId.get(id)?.type === 'external';

  // The homepage is the entry point; without one (nothing imported yet) fall back to whatever node has
  // the most connections, so the picture still has a sensible middle instead of an arbitrary one.
  const degree = new Map<string, number>();
  for (const e of graph.edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const center =
    graph.nodes.find(n => n.isHome) ??
    [...graph.nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))[0];

  // Two adjacency views. External edges are excluded from both: an external domain must not act as a
  // bridge that drags two unrelated pages onto the same ring.
  //   `backbone` — the site's own hierarchy (首页 → 支柱 → 子 → 内容).
  //   `adj`      — every internal edge, hierarchy and authored links alike.
  const backbone = new Map<string, string[]>();
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (isExternal(e.source) || isExternal(e.target)) continue;
    (adj.get(e.source) ?? adj.set(e.source, []).get(e.source)!).push(e.target);
    (adj.get(e.target) ?? adj.set(e.target, []).get(e.target)!).push(e.source);
    if (e.type !== 'backbone') continue;
    (backbone.get(e.source) ?? backbone.set(e.source, []).get(e.source)!).push(e.target);
    (backbone.get(e.target) ?? backbone.set(e.target, []).get(e.target)!).push(e.source);
  }

  // The spanning tree decides both the ring index and the wedge each node lives in, so it has to be
  // the site's STRUCTURE, not merely the shortest link path. Walking every edge at once lets a nav
  // link jump the queue: 首页 links straight to About Us, so About Us gets adopted by 首页 and its real
  // parent 「Pages」 is left an empty shell off to one side. Hence two passes — hierarchy first, and
  // only then whatever the links can still reach (content whose silo node is missing, link-only
  // clusters). A graph with no backbone at all degrades to the plain link walk.
  const depth = new Map<string, number>([[center.id, 0]]);
  const children = new Map<string, string[]>();
  const attach = (parent: string, child: string) =>
    (children.get(parent) ?? children.set(parent, []).get(parent)!).push(child);

  const walk = (neighbours: Map<string, string[]>, seeds: string[]) => {
    const queue = [...seeds];
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i];
      // Sorted so the tree — and therefore the whole picture — never depends on edge insertion order.
      for (const next of [...(neighbours.get(cur) ?? [])].sort()) {
        if (depth.has(next)) continue;
        depth.set(next, depth.get(cur)! + 1);
        attach(cur, next);
        queue.push(next);
      }
    }
  };
  walk(backbone, [center.id]);
  // Seeded with everything already placed, in ring order, so the leftovers attach to the nearest
  // structural node rather than all piling onto the centre.
  walk(
    adj,
    [...depth.keys()].sort((a, b) => depth.get(a)! - depth.get(b)! || a.localeCompare(b)),
  );

  const connectedMax = Math.max(0, ...[...depth.values()]);
  const detached = graph.nodes.filter(n => !isExternal(n.id) && !depth.has(n.id)).map(n => n.id);
  // A page the walk never reached (no links at all) still needs a home. Park it one ring beyond the
  // connected graph — visibly detached, which is exactly what it is — hanging off the centre so it
  // gets a wedge like everything else.
  const internalMax = connectedMax + (detached.length ? 1 : 0);
  const externalRing = internalMax + 1;

  for (const n of graph.nodes) {
    ringOf[n.id] = isExternal(n.id) ? externalRing : (depth.get(n.id) ?? internalMax);
  }

  // External domains sit on the outermost ring but inherit the SECTOR of a page that links to them, so
  // the edge runs outward instead of across the picture. First linking page wins (edges sorted for
  // stability); one with no internal source at all hangs off the centre.
  const externalParent = new Map<string, string>();
  for (const e of [...graph.edges].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const [ext, other] of [
      [e.target, e.source],
      [e.source, e.target],
    ]) {
      if (!isExternal(ext) || isExternal(other) || externalParent.has(ext)) continue;
      externalParent.set(ext, other);
    }
  }

  detached.forEach(id => attach(center.id, id));
  for (const n of graph.nodes) {
    if (isExternal(n.id)) attach(externalParent.get(n.id) ?? center.id, n.id);
  }

  // Wedge size is proportional to the number of LEAVES a subtree ends up drawing, not its node count:
  // that is what stops a deep-but-thin branch from claiming as much of the circle as a shallow one
  // holding thirty articles.
  const weight = new Map<string, number>();
  const weigh = (id: string): number => {
    const cached = weight.get(id);
    if (cached !== undefined) return cached;
    weight.set(id, 1); // guards against a cycle; overwritten below
    const kids = children.get(id) ?? [];
    const w = kids.length ? kids.reduce((sum, k) => sum + weigh(k), 0) : 1;
    weight.set(id, w);
    return w;
  };
  weigh(center.id);

  // Give each subtree its own arc, then recurse inside it. A node sits at the middle of its own wedge.
  const angleOf = new Map<string, number>();
  const allocate = (id: string, start: number, end: number): void => {
    angleOf.set(id, (start + end) / 2);
    const kids = children.get(id) ?? [];
    if (!kids.length) return;
    const total = kids.reduce((sum, k) => sum + weigh(k), 0) || 1;
    let cursor = start;
    for (const kid of kids) {
      const span = ((end - start) * weigh(kid)) / total;
      allocate(kid, cursor, cursor + span);
      cursor += span;
    }
  };
  allocate(center.id, 0, 2 * Math.PI);

  // Radii accumulate rather than being `ringGap * r`: a crowded inner ring that had to grow could
  // otherwise end up OUTSIDE a sparse ring beyond it, inverting the hierarchy the layout exists to
  // show; and the outermost ring (usually a handful of external domains) would be flung to a multiple
  // of the gap, leaving the picture mostly empty.
  const ringMembers = new Map<number, string[]>();
  for (const n of graph.nodes) {
    const r = ringOf[n.id];
    (ringMembers.get(r) ?? ringMembers.set(r, []).get(r)!).push(n.id);
  }

  positions[center.id] = [0, 0];
  let prevRadius = 0;
  for (let r = 1; r <= externalRing; r++) {
    const ids = ringMembers.get(r);
    if (!ids?.length) continue;

    // Widen only as far as this ring's TIGHTEST neighbouring pair needs. Sector allocation has already
    // fixed the angles, so spacing is bought with radius rather than by shifting a node out of the
    // wedge it belongs to.
    const angles = ids.map(id => angleOf.get(id) ?? 0).sort((a, b) => a - b);
    let minGap = 2 * Math.PI;
    for (let i = 1; i < angles.length; i++) minGap = Math.min(minGap, angles[i] - angles[i - 1]);
    if (angles.length > 1) minGap = Math.min(minGap, angles[0] + 2 * Math.PI - angles[angles.length - 1]);

    const wanted = minGap > 0 ? minSpacing / minGap : prevRadius + ringGap;
    const radius = Math.min(Math.max(prevRadius + ringGap, wanted), prevRadius + ringGap * maxRingStretch);
    prevRadius = radius;

    for (const id of ids) {
      const a = angleOf.get(id) ?? 0;
      positions[id] = [Math.cos(a) * radius, Math.sin(a) * radius];
    }
  }

  return { positions, centerId: center.id, ringOf };
}
