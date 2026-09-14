/**
 * Apply an AGENT-authored plan JSON into a SiloWorkspace. The agent (Claude Code / Cursor / …) does the
 * generative thinking (keyword research, silo structure, per-page SEO) and emits this plan; the CLI
 * turns it into real model entities deterministically, resolving the plan's local `key`s to generated
 * ids.
 *
 * IDEMPOTENT by natural key: re-running the same plan upserts rather than duplicates. Keywords dedupe by
 * term; a node is claimed by (resolved parentId + normalized term); a content by (siloNodeId + slug, or
 * title when no slug). So iterating a plan.json and re-running `silo plan` updates the existing tree in
 * place instead of growing a second copy — and it works even on a fresh clone of the vault (no hidden
 * key→id state needed), because the natural key lives in the model itself.
 */

import {
  addKeyword,
  addNode,
  addContent,
  updateContent,
  updateNode,
  setContentLinks,
  type SearchIntent,
  type SiloWorkspace,
  type NodeKind,
} from '@puffergo/silo-core';

export interface PlanKeyword {
  term: string;
  intent?: SearchIntent;
  plannedTier?: 'head' | 'longtail';
  note?: string;
}
export interface PlanSeo {
  title?: string;
  description?: string;
  coreKeywords?: string[];
  longTailKeywords?: string[];
}
export interface PlanNode {
  key: string;
  term: string;
  kind: NodeKind;
  parent?: string | null;
  intent?: SearchIntent;
  isCategory?: boolean;
  /** Post type this node's subtree hosts (e.g. 'post', 'docs'). Set it on the top of a type branch;
   *  descendants inherit it, so two trees can live in one workspace without their terms colliding. */
  postType?: string;
  /** REST base of the taxonomy this node's term belongs to ('categories', 'docs_category', …). Must be
   *  set alongside `postType` on a branch root so the node pushes back to the RIGHT taxonomy. */
  taxonomyRestBase?: string;
  /** SEO for the category ARCHIVE page this node represents — its own rankable page. */
  seo?: PlanSeo;
}
export interface PlanContent {
  key?: string;
  node: string;
  title: string;
  slug?: string;
  postType?: string;
  seo?: PlanSeo;
  internalLinks?: string[]; // references other contents' `key`
  externalLinks?: string[];
  /** Why this article exists — its job in the silo (aligns with Step3 的 purpose). Guidance for writing,
   *  surfaced as an editable `purpose` frontmatter field. Not sent to WordPress. */
  purpose?: string;
}
export interface Plan {
  profile?: { name: string; url: string; tagline?: string };
  keywords?: PlanKeyword[];
  nodes?: PlanNode[];
  contents?: PlanContent[];
}

export interface ApplyResult {
  ws: SiloWorkspace;
  /** plan content key -> generated content id (for file writing + internal-link resolution). */
  contentIds: Map<string, string>;
  /** generated content id -> its purpose text from the plan (the article's job in the silo). */
  purposes: Map<string, string>;
  counts: {
    keywords: number;
    nodes: number;
    contents: number;
    /** how many nodes/contents matched an existing entity and were updated instead of created. */
    nodesReused: number;
    contentsReused: number;
  };
}

const norm = (s: string): string => s.trim().toLowerCase();

/** Validate + apply. Throws on structural errors (unknown parent/node key) so the agent gets a clear
 *  message to fix its plan rather than producing a silently-broken tree. */
export function applyPlan(ws: SiloWorkspace, plan: Plan): ApplyResult {
  let next = ws;
  const counts = { keywords: 0, nodes: 0, contents: 0, nodesReused: 0, contentsReused: 0 };

  for (const k of plan.keywords ?? []) {
    if (!k.term?.trim()) continue;
    const r = addKeyword(next, k.term, { intent: k.intent, plannedTier: k.plannedTier, note: k.note });
    next = r.ws;
    counts.keywords++;
  }

  // Nodes: resolve parent keys → ids. Process so a parent is always created before its children by
  // repeatedly draining the ones whose parent is already resolved (handles any input order).
  const nodeIds = new Map<string, string>();
  const pending = [...(plan.nodes ?? [])];
  let guard = pending.length * pending.length + 1;
  while (pending.length && guard-- > 0) {
    const n = pending.shift()!;
    const parentKey = n.parent ?? null;
    // A parent key that isn't defined in this plan may name an EXISTING node by its term (e.g. the
    // type-root '文章'/'文档' created by import) — resolve it so a plan can graft onto a pulled tree.
    const existingParent =
      parentKey !== null && !nodeIds.has(parentKey)
        ? next.nodes.find(nd => norm(nd.term) === norm(parentKey))
        : undefined;
    if (parentKey !== null && !nodeIds.has(parentKey) && !existingParent) {
      pending.push(n); // parent not resolved yet — try later
      continue;
    }
    const parentId = parentKey === null ? null : (nodeIds.get(parentKey) ?? existingParent!.id);
    // Upsert by (parentId + term): claim an existing sibling node with the same term instead of adding
    // a duplicate, so re-running the plan is idempotent.
    const existing = next.nodes.find(
      nd => !nd.system && (nd.parentId ?? null) === parentId && norm(nd.term) === norm(n.term),
    );
    let nodeId: string;
    if (existing) {
      nodeId = existing.id;
      const patch: Record<string, unknown> = {};
      if (n.intent) patch.intent = n.intent;
      if (n.isCategory) patch.isCategory = true;
      if (n.postType) patch.postType = n.postType;
      if (n.taxonomyRestBase) patch.taxonomyRestBase = n.taxonomyRestBase;
      if (n.seo) patch.seo = { title: '', description: '', coreKeywords: [], longTailKeywords: [], ...n.seo };
      if (Object.keys(patch).length) next = updateNode(next, nodeId, patch);
      counts.nodesReused++;
    } else {
      const r = addNode(next, n.term, n.kind, parentId, n.intent);
      const patch: Record<string, unknown> = {};
      if (n.isCategory) patch.isCategory = true;
      if (n.postType) patch.postType = n.postType;
      if (n.taxonomyRestBase) patch.taxonomyRestBase = n.taxonomyRestBase;
      if (n.seo) patch.seo = { title: '', description: '', coreKeywords: [], longTailKeywords: [], ...n.seo };
      next = Object.keys(patch).length ? updateNode(r.ws, r.node.id, patch) : r.ws;
      nodeId = r.node.id;
      counts.nodes++;
    }
    nodeIds.set(n.key, nodeId);
  }
  if (pending.length) {
    throw new Error(`plan.nodes: unresolved parent references: ${pending.map(p => p.key).join(', ')}`);
  }

  // Contents: resolve node key → id, set SEO, stash purpose + link intents for a second pass.
  const contentIds = new Map<string, string>();
  const purposes = new Map<string, string>();
  const linkIntents: { id: string; internal: string[]; external: string[] }[] = [];
  for (const c of plan.contents ?? []) {
    const nodeId = nodeIds.get(c.node);
    if (!nodeId) throw new Error(`plan.contents: unknown node key "${c.node}" for "${c.title}"`);
    const seo = {
      title: c.seo?.title ?? '',
      description: c.seo?.description ?? '',
      coreKeywords: c.seo?.coreKeywords ?? [],
      longTailKeywords: c.seo?.longTailKeywords ?? [],
    };
    // Upsert by (siloNodeId + slug, or title when no slug): update the existing page in place rather than
    // adding a second copy on a re-run. Preserves the content id (and thus the md file's silo: id).
    const existing = next.contents.find(
      ct =>
        ct.siloNodeId === nodeId && (c.slug ? norm(ct.slug ?? '') === norm(c.slug) : norm(ct.title) === norm(c.title)),
    );
    let contentId: string;
    if (existing) {
      contentId = existing.id;
      next = updateContent(next, contentId, { title: c.title, slug: c.slug, seo });
      counts.contentsReused++;
    } else {
      const r = addContent(next, nodeId, c.title, c.postType ?? 'post');
      next = updateContent(r.ws, r.content.id, { slug: c.slug, seo });
      contentId = r.content.id;
      counts.contents++;
    }
    if (c.key) contentIds.set(c.key, contentId);
    if (c.purpose) purposes.set(contentId, c.purpose);
    linkIntents.push({ id: contentId, internal: c.internalLinks ?? [], external: c.externalLinks ?? [] });
  }

  // Second pass: now that every content key is resolved, wire internal links (key → id) + external.
  for (const li of linkIntents) {
    const internalIds = li.internal.map(k => contentIds.get(k)).filter((x): x is string => !!x);
    if (internalIds.length || li.external.length) {
      next = setContentLinks(next, li.id, internalIds, li.external);
    }
  }

  return { ws: next, contentIds, purposes, counts };
}
