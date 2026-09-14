/**
 * Sync one content item's STRUCTURE + SEO to WordPress. The verified minimal link:
 *   (optional) conflict check → resolve categories → upsert page SHELL → write Rank Math SEO → patch.
 *
 * Body policy: this NEVER pushes an article body. A new item is created as an empty WP draft shell
 * (body authored later in Obsidian/WP); an existing item is updated meta-only, preserving whatever
 * body already lives on WP. Pure orchestration over WpClient; the caller persists the returned patch.
 */

import type { WpClient } from '../wp/client';
import type { ContentItem, SiloNode, SiloWorkspace } from '../model/types';
import { getNodePath, getContentsForNode, isCategoryNode } from '../model/selectors';
import { WpHttpError } from '../ports/network';

export interface SyncOptions {
  /** Overwrite even if WP was modified since last sync. Default false → returns a conflict instead. */
  force?: boolean;
  /** Create/resolve the WP category path from the keyword hierarchy (post type only). Default true. */
  syncCategories?: boolean;
  /** Rendered HTML body to author on WP. OMITTED by the extension (bodies live in WP/Obsidian, never in
   *  the projection) → pushes a body-less shell / metadata-only update. A host that DOES own the body
   *  (Obsidian plugin, CLI) passes the note's HTML here so the same push also authors the article. */
  content?: string;
  /** Treat the SEO write as best-effort. Default false (strict): any SEO write failure fails the whole
   *  push — but by then step 3 has ALREADY created/updated the post, and a failed result isn't
   *  persisted, so the post's WP id is lost and a retry creates a duplicate draft (e.g. on any site
   *  without Rank Math, whose route 404s). When true, the post's patch is kept and the SEO failure comes
   *  back as `seoWarning` instead. */
  seoBestEffort?: boolean;
  /** `syncMany`/`syncNodeContents` ONLY: resolve `content` PER ITEM instead of one shared value for the
   *  whole batch (needed because `content` itself is per-content — see its own doc comment). Wins over
   *  a plain `content` when both are set. Ignored by `syncContent` itself (a single-item push already
   *  gets its content as a plain argument). */
  resolveContent?: (item: ContentItem) => Promise<string | undefined>;
}

export type SyncResult =
  /** `seoWarning` is only ever set under `seoBestEffort`: the post pushed fine but its SEO wasn't written. */
  | { ok: true; patch: Partial<ContentItem>; seoWarning?: string }
  | { ok: false; conflict: true; remoteModified: string }
  | { ok: false; conflict: false; error: string };

/** User-facing reason an SEO write failed, distinguishing the common "no Rank Math" case (its route
 *  simply doesn't exist → 404 / rest_no_route) from a real error worth reading. */
function describeSeoWriteFailure(e: unknown): string {
  if (e instanceof WpHttpError && (e.status === 404 || e.code === 'rest_no_route')) {
    return '站点未安装或未启用 Rank Math，SEO 字段未写入';
  }
  return `SEO 字段写入失败：${e instanceof Error ? e.message : String(e)}`;
}

export async function syncContent(
  client: WpClient,
  ws: SiloWorkspace,
  item: ContentItem,
  opts: SyncOptions = {},
): Promise<SyncResult> {
  const { force = false, syncCategories = true, content, seoBestEffort = false } = opts;

  try {
    // 1. Conflict check — only meaningful for an already-synced item. Compare the UTC modified_gmt for
    //    INEQUALITY: any divergence from what we saw at last sync means someone edited it on WP (a
    //    stronger, timezone-immune signal than "remote is newer").
    if (item.wpPostId && !force) {
      const remote = await client.fetchRemoteModifiedGmt(item.postType, item.wpPostId);
      if (remote && item.lastModifiedRemote && remote !== item.lastModifiedRemote) {
        return { ok: false, conflict: true, remoteModified: remote };
      }
    }

    // 2. Assign this content's categories on WP, mirroring production. Skipped for types with no
    //    hierarchical taxonomy (e.g. page).
    //    - Known membership (imported / multi-category) wins: push back ALL its term ids verbatim.
    //    - Otherwise derive from where it sits in the tree, keeping ONLY real category ancestors —
    //      type-roots (博客/产品), 未分类, and virtual organizing folders are transparent to WP, so a
    //      content under a virtual folder inherits the nearest category ancestor. ensureTermPath then
    //      finds-or-creates that category path by name.
    const taxonomyRestBase = client.taxRestBaseFor(item.postType);
    let termIds: number[] | undefined;
    if (syncCategories && taxonomyRestBase) {
      if (item.termIds && item.termIds.length) {
        termIds = item.termIds;
      } else {
        const terms = getNodePath(ws, item.siloNodeId)
          .filter(isCategoryNode)
          .map(n => n.term);
        if (terms.length) termIds = await client.ensureTermPath(taxonomyRestBase, terms);
      }
    }

    // 3. Upsert the page: without `content` this is a body-less SHELL (create empty draft / meta-only
    //    update preserving the WP body); with `content` (Obsidian/CLI host owns the body) it also
    //    authors the article HTML.
    const pushed = await client.upsertPost(item, { termIds, taxonomyRestBase, content });

    // 4. Write Rank Math SEO (the /rankmath/v1/updateMeta path — the one that actually persists).
    let seoWarning: string | undefined;
    if (seoBestEffort) {
      try {
        await client.updateRankMathMeta(pushed.id, item.seo);
      } catch (e) {
        seoWarning = describeSeoWriteFailure(e);
      }
    } else {
      await client.updateRankMathMeta(pushed.id, item.seo);
    }

    // 4b. The SEO meta write bumps the post's modified time AFTER upsertPost captured it. Re-read the
    //     final modified_gmt so our stored baseline matches the true remote state — otherwise the next
    //     push's conflict guard false-positives ("WP 端已改") on a post only WE just changed.
    const finalModified = (await client.fetchRemoteModifiedGmt(item.postType, pushed.id)) ?? pushed.modifiedGmt;

    // 5. Return the patch for the caller to persist. `seoSyncedAt` only when SEO actually got written —
    //    a best-effort skip must not claim it did.
    return {
      ok: true,
      ...(seoWarning ? { seoWarning } : {}),
      patch: {
        wpPostId: pushed.id,
        ...(seoWarning ? {} : { seoSyncedAt: new Date().toISOString() }),
        lastModifiedRemote: finalModified,
        dirtyAt: null, // pushed → local is in sync again
        ...(pushed.link ? { wpLink: pushed.link } : {}),
        // Record the categories we actually assigned, so the content shows under them and re-pushes
        // stay idempotent (a planned item's membership was resolved from its tree placement).
        ...(termIds ? { termIds } : {}),
        ...(pushed.status ? { wpStatus: pushed.status } : {}),
      },
    };
  } catch (e) {
    return { ok: false, conflict: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type NodeSyncResult = { ok: true; patch: Partial<SiloNode> } | { ok: false; error: string };

/**
 * Push a category NODE's own SEO to its WordPress term (the archive page's Rank Math meta). Resolves
 * the term id from `node.wpCategoryId`, or creates the term path (excluding system ancestors) when the
 * category was planned in the extension but doesn't exist on WP yet. Only valid for real term nodes
 * (those with a `taxonomyRestBase`); system/type-root/site-root nodes have no term to write.
 */
export async function syncNode(client: WpClient, ws: SiloWorkspace, node: SiloNode): Promise<NodeSyncResult> {
  try {
    if (!isCategoryNode(node)) return { ok: false, error: '该节点不是分类，没有可推送的分类 SEO' };
    const tax = node.taxonomyRestBase;
    if (!tax) return { ok: false, error: '无法确定该分类所属的 taxonomy' };
    let termId = node.wpCategoryId;
    if (termId == null) {
      const terms = getNodePath(ws, node.id)
        .filter(isCategoryNode)
        .map(n => n.term);
      const ids = terms.length ? await client.ensureTermPath(tax, terms) : [];
      termId = ids[0] ?? null;
    }
    if (termId == null) return { ok: false, error: '无法解析分类的 WordPress term id' };
    if (node.seo) await client.updateRankMathMeta(termId, node.seo, 'term');
    return { ok: true, patch: { wpCategoryId: termId } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Batch sync: pushes every content under a node subtree, isolating per-item failures so one bad
 *  item never aborts the batch. Returns a per-item outcome map for the UI to render. */
export async function syncNodeContents(
  client: WpClient,
  ws: SiloWorkspace,
  nodeId: string,
  opts: SyncOptions = {},
): Promise<Record<string, SyncResult>> {
  return syncMany(client, ws, getContentsForNode(ws, nodeId), opts);
}

/**
 * Batch sync an explicit list of items. Per-item failures are isolated (one bad item never aborts
 * the batch). `onItem` fires after each item so the UI can show live progress. Returns a per-item
 * outcome map keyed by content id.
 */
export async function syncMany(
  client: WpClient,
  ws: SiloWorkspace,
  items: ContentItem[],
  opts: SyncOptions = {},
  onItem?: (item: ContentItem, result: SyncResult) => void,
): Promise<Record<string, SyncResult>> {
  const results: Record<string, SyncResult> = {};
  for (const item of items) {
    const content = opts.resolveContent ? await opts.resolveContent(item) : opts.content;
    const result = await syncContent(client, ws, item, { ...opts, content });
    results[item.id] = result;
    onItem?.(item, result);
  }
  return results;
}
