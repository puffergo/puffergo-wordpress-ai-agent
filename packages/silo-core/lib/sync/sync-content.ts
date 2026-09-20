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
import { getNodePath, getContentsForNode, isCategoryNode, taxonomyForNode } from '../model/selectors';
import { WpHttpError, isAuthError } from '../ports/network';

export interface SyncOptions {
  /** Overwrite even if WP was modified since last sync. Default false → returns a conflict instead. */
  force?: boolean;
  /** Create/resolve the WP category path from the keyword hierarchy (post type only). Default true. */
  syncCategories?: boolean;
  /** Rendered HTML body to author on WP. OMITTED by the extension (bodies live in WP/Obsidian, never in
   *  the projection) → pushes a body-less shell / metadata-only update. A host that DOES own the body
   *  (Obsidian plugin, CLI) passes the note's HTML here so the same push also authors the article.
   *  Ignored when `resolveContent` is also given — that one wins, and is preferred by any caller whose
   *  resolution does real work (e.g. uploading images), since it's only invoked AFTER the pre-push gate
   *  below decides the push is actually going through. */
  content?: string;
  /** Treat the SEO write as best-effort. Default false (strict): any SEO write failure fails the whole
   *  push — but by then step 3 has ALREADY created/updated the post, and a failed result isn't
   *  persisted, so the post's WP id is lost and a retry creates a duplicate draft (e.g. on any site
   *  without Rank Math, whose route 404s). When true, the post's patch is kept and the SEO failure comes
   *  back as `seoWarning` instead. */
  seoBestEffort?: boolean;
  /** Resolve this item's body lazily, called only once the pre-push gate (step 1) has already decided
   *  the push is going through. Prefer this over a pre-resolved `content` whenever resolution does real
   *  work — e.g. the Obsidian host's resolver uploads the note's local images to the WP media library,
   *  which must NOT run for a push that's about to be rejected by a conflict/already-published check
   *  (it would upload the images for nothing, and re-run again on the confirmed retry — a duplicate
   *  upload that can itself trip WP's "Destination file already exists" error on a fast retry). */
  resolveContent?: (item: ContentItem) => Promise<string | undefined>;
}

export type SyncResult =
  /** `seoWarning` is only ever set under `seoBestEffort`: the post pushed fine but its SEO wasn't written. */
  | { ok: true; patch: Partial<ContentItem>; seoWarning?: string }
  /** Needs user confirmation before pushing (bypassed with `force: true`): either WP was edited since
   *  last sync (`reason: 'modified'`, carries `remoteModified`), or the post is already live
   *  (`reason: 'published'`) — pushing would overwrite production content, likely irreversible. */
  | { ok: false; conflict: true; reason: 'modified'; remoteModified: string }
  | { ok: false; conflict: true; reason: 'published' }
  /** `authError` set when the failure looks like invalid/expired credentials (e.g. a revoked
   *  Application Password) rather than an ordinary permission or network error — see `isAuthError`. */
  | { ok: false; conflict: false; error: string; authError?: boolean };

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
  const { force = false, syncCategories = true, seoBestEffort = false } = opts;

  try {
    // 1. Pre-push checks — only meaningful for an already-synced item.
    //    a) Compare the UTC modified_gmt for INEQUALITY: any divergence from what we saw at last sync
    //       means someone edited it on WP (a stronger, timezone-immune signal than "remote is newer").
    //    b) The post is already `publish` on WP: pushing overwrites live production content, and that's
    //       likely irreversible — always confirm, even when nothing else has changed.
    if (item.wpPostId && !force) {
      const remote = await client.fetchRemoteState(item.postType, item.wpPostId);
      if (remote.modifiedGmt && item.lastModifiedRemote && remote.modifiedGmt !== item.lastModifiedRemote) {
        return { ok: false, conflict: true, reason: 'modified', remoteModified: remote.modifiedGmt };
      }
      if (remote.status === 'publish') {
        return { ok: false, conflict: true, reason: 'published' };
      }
    }

    // 1b. Resolve the body only NOW that the push is confirmed to proceed — see `resolveContent`'s doc.
    const content = opts.resolveContent ? await opts.resolveContent(item) : opts.content;

    // 1c. A body written here is plain HTML from Markdown. A post already made of blocks (PufferGo or
    //     WordPress's own) would lose them, and its note only holds their rendered text — never overwrite
    //     it, --force or not.
    if (content && item.wpPostId && /<!--\s*wp:/.test(await client.fetchRawContent(item.postType, item.wpPostId))) {
      return {
        ok: false,
        conflict: false,
        error:
          '这篇在 WordPress 里是用区块做的，推送正文会把区块变成纯 HTML，已跳过。请在 WordPress 编辑器里改，或清空这篇笔记的正文只推送 SEO 和分类。',
      };
    }

    // 2. Assign this content's categories on WP, mirroring production. Skipped for types with no
    //    hierarchical taxonomy (e.g. page). Honors BOTH membership records (see getContentsForNode):
    //    its known `termIds` (imported / multi-category), plus the category of where it sits in the tree
    //    — so a never-pushed item, or one just moved, lands where the tree shows it. The taxonomy falls
    //    back to the tree's when the site's types haven't been discovered (else: no category at all, and
    //    WP files the post under its default category).
    const taxonomyRestBase = client.taxRestBaseFor(item.postType) ?? taxonomyForNode(ws, item.siloNodeId);
    let termIds: number[] | undefined;
    if (syncCategories && taxonomyRestBase) {
      const home = await resolvePlacementTerm(client, ws, item.siloNodeId, taxonomyRestBase);
      const known = item.termIds ?? [];
      const merged = home != null && !known.includes(home) ? [...known, home] : known;
      if (merged.length) termIds = merged;
    }

    // 3. Upsert the page: without `content` this is a body-less SHELL (create empty draft / meta-only
    //    update preserving the WP body); with `content` (Obsidian/CLI host owns the body) it also
    //    authors the article HTML.
    const pushed = await client.upsertPost(item, { termIds, taxonomyRestBase, content });

    // 4. Write SEO (through the PufferGo plugin; Rank Math's own route on a site without it).
    let seoWarning: string | undefined;
    if (seoBestEffort) {
      try {
        await client.writeSeo(pushed.id, item.seo);
      } catch (e) {
        seoWarning = describeSeoWriteFailure(e);
      }
    } else {
      await client.writeSeo(pushed.id, item.seo);
    }

    // 4b. The SEO meta write bumps the post's modified time AFTER upsertPost captured it. Re-read the
    //     final modified_gmt so our stored baseline matches the true remote state — otherwise the next
    //     push's conflict guard false-positives ("WP 端已改") on a post only WE just changed.
    const finalModified = (await client.fetchRemoteState(item.postType, pushed.id)).modifiedGmt ?? pushed.modifiedGmt;

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
    return {
      ok: false,
      conflict: false,
      error: e instanceof Error ? e.message : String(e),
      ...(isAuthError(e) ? { authError: true } : {}),
    };
  }
}

/**
 * WP term id of the category a node places content into: its nearest category node's `wpCategoryId`
 * when known (rename-proof), else found-or-created by name — starting below the deepest ancestor
 * category whose id IS known, so a known parent is never re-resolved by name. Undefined when the node
 * has no category ancestor (type-root / 未分类 / virtual folders only).
 */
async function resolvePlacementTerm(
  client: WpClient,
  ws: SiloWorkspace,
  nodeId: string,
  tax: string,
): Promise<number | undefined> {
  const path = getNodePath(ws, nodeId).filter(isCategoryNode);
  if (!path.length) return undefined;
  let known = -1;
  for (let i = path.length - 1; i >= 0 && known < 0; i--) if (path[i].wpCategoryId != null) known = i;
  if (known === path.length - 1) return path[known].wpCategoryId!;
  const parent = known >= 0 ? path[known].wpCategoryId! : 0;
  const ids = await client.ensureTermPath(
    tax,
    path.slice(known + 1).map(n => n.term),
    parent,
  );
  return ids[0];
}

export type NodeSyncResult = { ok: true; patch: Partial<SiloNode> } | { ok: false; error: string; authError?: boolean };

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
    const termId = node.wpCategoryId ?? (await resolvePlacementTerm(client, ws, node.id, tax));
    if (termId == null) return { ok: false, error: '无法解析分类的 WordPress term id' };
    if (node.seo) await client.writeSeo(termId, node.seo, 'term');
    return { ok: true, patch: { wpCategoryId: termId } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      ...(isAuthError(e) ? { authError: true } : {}),
    };
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
 * the batch) — EXCEPT an auth failure (`isAuthError`, e.g. a revoked Application Password): that one
 * cause makes every remaining item fail the same way, so the loop stops right there instead of paying
 * for N more doomed round-trips (real for a Silo with hundreds/thousands of items — see
 * `runBatch`'s connection preflight in silo-ui, which usually catches this before the loop even starts;
 * this is the fallback for credentials that die mid-batch). `onItem` fires after each item so the UI can
 * show live progress. Returns a per-item outcome map keyed by content id (items after the abort point
 * are simply absent, not marked failed — the UI treats "no result yet" as unprocessed).
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
    // `syncContent` itself resolves `content`/`resolveContent` — after its own pre-push gate — so a
    // whole-batch conflict/already-published streak never wastes a resolution (e.g. an image upload)
    // per rejected item.
    const result = await syncContent(client, ws, item, opts);
    results[item.id] = result;
    onItem?.(item, result);
    if (!result.ok && !result.conflict && result.authError) break;
  }
  return results;
}
