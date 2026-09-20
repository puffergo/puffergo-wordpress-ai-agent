/**
 * Read-only selectors over a SiloWorkspace. Pure functions used by the UI and sync layers.
 */

import type { ContentItem, Seo, SiloNode, SiloWorkspace } from './types';
import { CORE_KEYWORDS_MAX, LONGTAIL_KEYWORDS_MAX } from './seo-limits';

/** Top-level Pillar nodes (direct children of the root/site positioning). */
export const getPillars = (ws: SiloWorkspace): SiloNode[] => ws.nodes.filter(n => n.parentId === null);

/** Direct child nodes of a given node. */
export const getChildNodes = (ws: SiloWorkspace, nodeId: string): SiloNode[] =>
  ws.nodes.filter(n => n.parentId === nodeId);

/** The rest_base of a post type's hierarchical taxonomy, from the connection's discovered types.
 *  Undefined for types with no taxonomy (e.g. page) or before a connection exists. */
export const taxonomyOfType = (ws: SiloWorkspace, postType: string): string | undefined =>
  ws.connection?.contentTypes?.find(t => t.type === postType)?.taxonomyRestBase;

/**
 * Is this node a REAL WordPress category (a taxonomy term), vs a purely-organizational virtual folder?
 * The keyword tree unifies both: every node is a keyword; `isCategory` flips it between "backed by a WP
 * term (round-trips, gets an archive-page SEO)" and "just my own folder (transparent to WP)". System
 * grouping nodes (type-roots 博客/产品, 未分类) are never categories.
 */
export const isCategoryNode = (n: SiloNode): boolean => !n.system && n.isCategory === true;

/** Walk a node's ancestry (self first) and return the nearest taxonomy rest_base — a category ancestor's
 *  own taxonomy, else the enclosing type-root's. Undefined when the node isn't inside any typed subtree
 *  (e.g. a legacy top-level keyword node with no type-root above it). */
export const taxonomyForNode = (ws: SiloWorkspace, nodeId: string): string | undefined => {
  const byId = new Map(ws.nodes.map(n => [n.id, n]));
  const guard = new Set<string>();
  let cur = byId.get(nodeId) ?? null;
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    if (cur.taxonomyRestBase) return cur.taxonomyRestBase;
    cur = cur.parentId ? (byId.get(cur.parentId) ?? null) : null;
  }
  return undefined;
};

/** The node itself or its nearest ancestor that is a real WP category — where a content placed at
 *  `nodeId` lands on WordPress (virtual folders are transparent). Null when there is none. */
export const nearestCategoryNode = (ws: SiloWorkspace, nodeId: string): SiloNode | null => {
  for (const n of [...getNodePath(ws, nodeId)].reverse()) if (isCategoryNode(n)) return n;
  return null;
};

/** A content's hierarchical taxonomy: from the connection's discovered types, else (no connection
 *  loaded / types not discovered yet) from where it sits in the tree. */
export const taxonomyOfContent = (ws: SiloWorkspace, content: ContentItem): string | undefined =>
  taxonomyOfType(ws, content.postType) ?? taxonomyForNode(ws, content.siloNodeId);

/**
 * Content shown under a node. A content's category membership has TWO records — `siloNodeId` (where it
 * sits locally) and `termIds` (its categories on WP, known once imported or pushed) — and every reader
 * must honor both, or content goes missing whenever they haven't converged yet (never pushed, just
 * moved, types not discovered).
 *   - a real TERM node (has `wpCategoryId` + `taxonomyRestBase`): content anchored here by `siloNodeId`,
 *     plus every content of this taxonomy whose `termIds` include this term — so a multi-category post
 *     appears under each of its categories (one item, many homes). Matching on (taxonomy, termId)
 *     avoids cross-taxonomy collisions (product_cat#5 vs category#5).
 *   - otherwise (type-root / 未分类 / page-root / virtual folder): content anchored here by `siloNodeId`.
 */
export const getContentsForNode = (ws: SiloWorkspace, nodeId: string): ContentItem[] => {
  const node = ws.nodes.find(n => n.id === nodeId);
  if (node && isCategoryNode(node) && node.wpCategoryId != null && node.taxonomyRestBase) {
    const tax = node.taxonomyRestBase;
    const termId = node.wpCategoryId;
    return ws.contents.filter(
      c => c.siloNodeId === nodeId || ((c.termIds ?? []).includes(termId) && taxonomyOfContent(ws, c) === tax),
    );
  }
  return ws.contents.filter(c => c.siloNodeId === nodeId);
};

/** Node → root path of terms, e.g. ["solar street light", "solar street light price"]. Used to
 *  build the WP category path that mirrors the keyword hierarchy. */
export const getNodePath = (ws: SiloWorkspace, nodeId: string): SiloNode[] => {
  const byId = new Map(ws.nodes.map(n => [n.id, n]));
  const path: SiloNode[] = [];
  let cur = byId.get(nodeId) ?? null;
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    path.unshift(cur);
    cur = cur.parentId ? (byId.get(cur.parentId) ?? null) : null;
  }
  return path;
};

/**
 * The focus keywords to write: the core keyword, then long-tail ones, capped by the site's limits
 * (see seo-limits.ts). Empty when there is nothing to write.
 */
export const focusKeywords = (seo: Seo): string[] =>
  [...seo.coreKeywords.slice(0, CORE_KEYWORDS_MAX), ...seo.longTailKeywords.slice(0, LONGTAIL_KEYWORDS_MAX)]
    .map(s => s.trim())
    .filter(Boolean);

/** The focus keywords as Rank Math / Yoast store them: comma-joined. '' when there is nothing to write. */
export const focusKeywordString = (seo: Seo): string => focusKeywords(seo).join(', ');

/** Content items not yet pushed (status draft with no wpPostId) — for the "N pending" counter. */
export const getPendingContents = (ws: SiloWorkspace): ContentItem[] => ws.contents.filter(c => c.wpPostId === null);

/** Content items with unpushed LOCAL edits since the last push (`dirtyAt` set) — for the "N 待同步"
 *  badge. Distinct from `getPendingContents`: a pending item has never been pushed at all, while a
 *  dirty item may already live on WP but has since been edited here and needs a re-push. */
export const getDirtyContents = (ws: SiloWorkspace): ContentItem[] => ws.contents.filter(c => c.dirtyAt != null);

const normalizeTerm = (s: string): string => s.trim().toLowerCase();

/**
 * True if any of the content's core/long-tail keywords *covers* `term` — i.e. contains it as a
 * normalized substring (long-tails naturally contain their head term, which is the SEO-correct match).
 * Single source of truth for keyword coverage; reuse it everywhere rather than re-deriving. Empty
 * `term` → true (nothing to require).
 */
export const contentCoversTerm = (content: ContentItem, term: string): boolean => {
  const t = normalizeTerm(term);
  if (!t) return true;
  return [...content.seo.coreKeywords, ...content.seo.longTailKeywords].some(k => normalizeTerm(k).includes(t));
};

/** Alignment of a content with the keyword of the node it hangs under. */
export type ContentAlignment = 'aligned' | 'misaligned' | 'no-keywords' | 'n/a';

/**
 * Whether a content's keywords cover the term of its parent Silo node (its place in the tree):
 *   - 'n/a'         : node missing / a system holding node / empty term — nothing to judge
 *   - 'no-keywords' : content has no keywords yet — a "still to fill" state, NOT a misalignment
 *   - 'aligned'     : some keyword covers the node term
 *   - 'misaligned'  : has keywords but none covers the node term → worth a gentle reminder
 * Deliberately three-plus states so imported / unfilled content isn't flagged as a problem.
 */
export const contentAlignment = (ws: SiloWorkspace, content: ContentItem): ContentAlignment => {
  const node = ws.nodes.find(n => n.id === content.siloNodeId);
  if (!node || node.system || !node.term.trim()) return 'n/a';
  const hasKeywords = content.seo.coreKeywords.length + content.seo.longTailKeywords.length > 0;
  if (!hasKeywords) return 'no-keywords';
  return contentCoversTerm(content, node.term) ? 'aligned' : 'misaligned';
};
