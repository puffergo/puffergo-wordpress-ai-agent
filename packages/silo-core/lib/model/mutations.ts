/**
 * Immutable mutation helpers for the Silo workspace. Pure functions returning a NEW workspace, so
 * the UI can persist the result and undo/redo stay simple. Domain logic lives here (not the view)
 * so it is reusable by the Obsidian host too.
 */

import type {
  ContentItem,
  KeywordEntity,
  NodeKind,
  PostType,
  SearchIntent,
  Seo,
  SiloNode,
  SiloWorkspace,
} from './types';
import { createContent, createNode, newId } from './factory';
import { normalizeTerm } from './keywords';
import { nearestCategoryNode } from './selectors';

/** Add a keyword node (pillar at top level, or a child cluster). Returns the new ws + created node. */
export const addNode = (
  ws: SiloWorkspace,
  term: string,
  kind: NodeKind,
  parentId: string | null,
  intent?: SearchIntent,
): { ws: SiloWorkspace; node: SiloNode } => {
  const node = createNode(term, kind, parentId, intent ? { intent } : undefined);
  return { ws: { ...ws, nodes: [...ws.nodes, node] }, node };
};

/** Add a content item under a node. Returns the new ws + created content. */
export const addContent = (
  ws: SiloWorkspace,
  siloNodeId: string,
  title: string,
  postType: PostType = 'post',
): { ws: SiloWorkspace; content: ContentItem } => {
  const content = createContent(siloNodeId, title, postType);
  return { ws: { ...ws, contents: [...ws.contents, content] }, content };
};

/** Patch a node's editable fields (term / intent / kind). */
export const updateNode = (
  ws: SiloWorkspace,
  nodeId: string,
  patch: Partial<
    Pick<SiloNode, 'term' | 'intent' | 'kind' | 'seo' | 'isCategory' | 'taxonomyRestBase' | 'postType' | 'wpCategoryId'>
  >,
): SiloWorkspace => ({
  ...ws,
  nodes: ws.nodes.map(n => (n.id === nodeId ? { ...n, ...patch } : n)),
});

/** Patch a content item's fields. */
export const updateContent = (ws: SiloWorkspace, contentId: string, patch: Partial<ContentItem>): SiloWorkspace => ({
  ...ws,
  contents: ws.contents.map(c => (c.id === contentId ? { ...c, ...patch } : c)),
});

/** Every descendant node id of `nodeId`, inclusive. */
export const collectSubtreeNodeIds = (ws: SiloWorkspace, nodeId: string): Set<string> => {
  const ids = new Set<string>([nodeId]);
  let added = true;
  while (added) {
    added = false;
    for (const n of ws.nodes) {
      if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
        ids.add(n.id);
        added = true;
      }
    }
  }
  return ids;
};

/**
 * Move a content item under a different keyword node (drag-and-drop re-parenting). Its `siloNodeId`
 * changes, and so does its WP category record `termIds`: the old place's category is swapped for the
 * new one's (other categories of a multi-category post stay). Left alone, the stale `termIds` would keep
 * showing it under the old category and push would re-send the old category — the move silently undone.
 * Keywords, links (edges) and everything else stay put, per design.
 */
export const moveContent = (ws: SiloWorkspace, contentId: string, newNodeId: string): SiloWorkspace => ({
  ...ws,
  contents: ws.contents.map(c => {
    if (c.id !== contentId) return c;
    if (!c.termIds?.length) return { ...c, siloNodeId: newNodeId };
    const from = nearestCategoryNode(ws, c.siloNodeId)?.wpCategoryId;
    const to = nearestCategoryNode(ws, newNodeId)?.wpCategoryId;
    const kept = c.termIds.filter(id => id !== from);
    return { ...c, siloNodeId: newNodeId, termIds: to != null && !kept.includes(to) ? [...kept, to] : kept };
  }),
});

/**
 * Move a keyword node under a new parent (drag re-parenting). `newParentId === null` makes it a
 * top-level pillar; nesting it makes it a cluster (kind auto-adjusts so "pillar = top level" holds).
 * Guards against cycles: dropping a node into its own subtree is a no-op (returns ws unchanged).
 */
export const moveNode = (ws: SiloWorkspace, nodeId: string, newParentId: string | null): SiloWorkspace => {
  if (nodeId === newParentId) return ws;
  const subtree = collectSubtreeNodeIds(ws, nodeId);
  if (newParentId && subtree.has(newParentId)) return ws; // would create a cycle
  return {
    ...ws,
    nodes: ws.nodes.map(n =>
      n.id === nodeId ? { ...n, parentId: newParentId, kind: newParentId ? 'cluster' : 'pillar' } : n,
    ),
  };
};

/** Delete a node and its whole subtree (descendant nodes + their contents + touching edges). */
export const deleteNode = (ws: SiloWorkspace, nodeId: string): SiloWorkspace => {
  const gone = collectSubtreeNodeIds(ws, nodeId);
  const removedContentIds = new Set(ws.contents.filter(c => gone.has(c.siloNodeId)).map(c => c.id));
  return {
    ...ws,
    nodes: ws.nodes.filter(n => !gone.has(n.id)),
    contents: ws.contents.filter(c => !gone.has(c.siloNodeId)),
    edges: ws.edges.filter(e => !removedContentIds.has(e.from) && !removedContentIds.has(e.to)),
  };
};

/**
 * Replace one content's outbound link relationships (internal + external) in one shot — what the
 * editor's link selectors save. `internalTargetIds` are ContentItem ids; `externalUrls` are absolute
 * URLs. Existing anchors/dofollow for links that survive are preserved; other content's edges are
 * untouched. Links are structured relationships (like keywords) — this never edits the body.
 */
export const setContentLinks = (
  ws: SiloWorkspace,
  fromId: string,
  internalTargetIds: string[],
  externalUrls: string[],
): SiloWorkspace => {
  const prior = ws.edges.filter(e => e.from === fromId);
  const priorInternal = new Map(prior.filter(e => e.type === 'internal-link').map(e => [e.to, e]));
  const priorExternal = new Map(prior.filter(e => e.type === 'external-link').map(e => [e.to, e]));
  // Keep every edge that isn't this content's internal/external links, then re-add the chosen set.
  const kept = ws.edges.filter(e => e.from !== fromId || (e.type !== 'internal-link' && e.type !== 'external-link'));
  const nextInternal = Array.from(new Set(internalTargetIds))
    .filter(to => to && to !== fromId)
    .map(to => priorInternal.get(to) ?? { from: fromId, to, type: 'internal-link' as const });
  const nextExternal = Array.from(new Set(externalUrls))
    .filter(Boolean)
    .map(to => priorExternal.get(to) ?? { from: fromId, to, type: 'external-link' as const });
  return { ...ws, edges: [...kept, ...nextInternal, ...nextExternal] };
};

/** Delete a single content item (+ touching edges). */
export const deleteContent = (ws: SiloWorkspace, contentId: string): SiloWorkspace => ({
  ...ws,
  contents: ws.contents.filter(c => c.id !== contentId),
  edges: ws.edges.filter(e => e.from !== contentId && e.to !== contentId),
});

// ---- Managed keyword vocabulary (ws.keywords) ----------------------------------------------------

/** Replace one keyword string with another everywhere it appears in a Seo's core/long-tail arrays
 *  (case-insensitive match on the OLD term), de-duplicating. Returns the same ref if nothing changed. */
const renameTermInSeo = (seo: Seo, fromKey: string, to: string): Seo => {
  const map = (arr: string[]) => {
    let touched = false;
    const out: string[] = [];
    for (const k of arr) {
      const next = normalizeTerm(k) === fromKey ? to : k;
      if (next !== k) touched = true;
      if (!out.some(x => normalizeTerm(x) === normalizeTerm(next))) out.push(next);
    }
    return touched || out.length !== arr.length ? out : arr;
  };
  const coreKeywords = map(seo.coreKeywords);
  const longTailKeywords = map(seo.longTailKeywords);
  return coreKeywords === seo.coreKeywords && longTailKeywords === seo.longTailKeywords
    ? seo
    : { ...seo, coreKeywords, longTailKeywords };
};

/**
 * Add a managed keyword to the vocabulary. Idempotent by normalized term: if one already exists it is
 * returned unchanged (no duplicate). Newly created words are `source: 'local'` (hand-planned). Returns
 * the new ws + the resolved entity (existing or created).
 */
export const addKeyword = (
  ws: SiloWorkspace,
  term: string,
  extra?: Partial<Pick<KeywordEntity, 'intent' | 'plannedTier' | 'note'>>,
): { ws: SiloWorkspace; keyword: KeywordEntity } => {
  const t = term.trim();
  const key = normalizeTerm(t);
  const found = ws.keywords.find(k => normalizeTerm(k.term) === key);
  if (!key || found) return { ws, keyword: found ?? { id: '', term: t, source: 'local' } };
  const keyword: KeywordEntity = { id: newId('k'), term: t, source: 'local', ...extra };
  return { ws: { ...ws, keywords: [...ws.keywords, keyword] }, keyword };
};

/**
 * Patch a managed keyword. `term` triggers a RENAME that propagates across every content + category
 * SEO field (case-insensitive). If the new term collides with another existing keyword, the two MERGE
 * (the other entity is dropped; this one keeps its id). No-op if the id is unknown.
 */
export const updateKeyword = (
  ws: SiloWorkspace,
  id: string,
  patch: Partial<Pick<KeywordEntity, 'term' | 'intent' | 'plannedTier' | 'note'>>,
): SiloWorkspace => {
  const target = ws.keywords.find(k => k.id === id);
  if (!target) return ws;
  const nextTerm = patch.term?.trim();
  const rename = nextTerm != null && nextTerm !== '' && normalizeTerm(nextTerm) !== normalizeTerm(target.term);
  const fromKey = normalizeTerm(target.term);

  let contents = ws.contents;
  let nodes = ws.nodes;
  if (rename) {
    contents = ws.contents.map(c => {
      const seo = renameTermInSeo(c.seo, fromKey, nextTerm!);
      return seo === c.seo ? c : { ...c, seo };
    });
    nodes = ws.nodes.map(n => {
      if (!n.seo) return n;
      const seo = renameTermInSeo(n.seo, fromKey, nextTerm!);
      return seo === n.seo ? n : { ...n, seo };
    });
  }

  const collidedId =
    rename && ws.keywords.find(k => k.id !== id && normalizeTerm(k.term) === normalizeTerm(nextTerm!))?.id;
  const keywords = ws.keywords
    .filter(k => k.id !== collidedId) // merge: drop the entity we renamed INTO
    .map(k => (k.id === id ? { ...k, ...patch, term: nextTerm ?? k.term } : k));

  return { ...ws, contents, nodes, keywords };
};

/**
 * Delete a managed keyword from the vocabulary. This ONLY removes the entity — it never edits any
 * content or category SEO. Deleting a word that pages still target is a false premise: stripping it from
 * those pages would silently gut their SEO, and reconcile would re-adopt it on the next save anyway. The
 * UI therefore blocks deletion of an in-use word and tells the user to remove it from the referencing
 * pages first, then come back and delete the now-unused entity.
 */
export const deleteKeyword = (ws: SiloWorkspace, id: string): SiloWorkspace => {
  const target = ws.keywords.find(k => k.id === id);
  if (!target) return ws;
  return { ...ws, keywords: ws.keywords.filter(k => k.id !== id) };
};
