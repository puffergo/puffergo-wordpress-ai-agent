/**
 * Sync one content item to WordPress through the PufferGo plugin's ABILITIES — the one write path:
 *   (optional) conflict check → resolve category slugs → create-post (shell or with body)
 *   → update-body (body on an existing post) → update-seo (title/slug/SEO/categories).
 *
 * Body policy: the body travels as MARKDOWN and the PLUGIN compiles it to core WordPress blocks — the
 * one compiler, in one place; this layer never produces HTML. A host that owns the body (Obsidian
 * plugin, CLI) passes the note's Markdown via `resolveContent`/`content`; the extension, which keeps
 * bodies in WP/Obsidian, pushes a body-less shell / metadata-only update instead. A post the plugin
 * reports as someone else's editor content (`editor` on get-blocks) is never body-overwritten.
 *
 * Pure orchestration over WpClient; the caller persists the returned patch.
 */

import type { AbilityPost, AbilitySeoInput, WpClient } from '../wp/client';
import type { ContentItem, Seo, SiloNode, SiloWorkspace } from '../model/types';
import { getNodePath, getContentsForNode, isCategoryNode, taxonomyForNode } from '../model/selectors';
import { focusKeywords } from '../model/selectors';
import { WpHttpError, isAuthError } from '../ports/network';

export interface SyncOptions {
  /** Overwrite even if WP was modified since last sync. Default false → returns a conflict instead. */
  force?: boolean;
  /** Create/resolve the WP category path from the keyword hierarchy (post type only). Default true. */
  syncCategories?: boolean;
  /** MARKDOWN body to author on WP (wikilinks already resolved to real links by the host's codec pass).
   *  OMITTED by the extension (bodies live in WP/Obsidian, never in the projection) → pushes a body-less
   *  shell / metadata-only update. A host that DOES own the body (Obsidian plugin, CLI) passes the
   *  note's Markdown here so the same push also authors the article. Ignored when `resolveContent` is
   *  also given — that one wins, and is preferred by any caller whose resolution does real work (e.g.
   *  uploading images), since it's only invoked AFTER the pre-push gate below decides the push is
   *  actually going through. */
  content?: string;
  /** Treat the SEO write as best-effort. Default false (strict): any SEO write failure fails the whole
   *  push — but by then the post has ALREADY been created, and a failed result isn't persisted, so the
   *  post's WP id is lost and a retry creates a duplicate draft (e.g. on any site without an SEO plugin,
   *  whose update-seo refuses with `invalid_seo`/`no_seo_plugin`). When true, the post's patch is kept
   *  and the SEO failure comes back as `seoWarning` instead. */
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

/** Both sides of the conflict comparison come from the SAME server clock but in different notations:
 *  import stored `modified_gmt` ("YYYY-MM-DD HH:MM:SS"), the abilities return `baseModified` (a "T").
 *  Normalize to the abilities' form so an untouched post never false-positives. */
const baseOf = (gmt: string): string => gmt.replace(' ', 'T');

/** The item's SEO as the abilities take it. Blank fields are left out entirely — sending '' would
 *  erase a value the site already has, and the plugin validates what it receives. */
function seoInput(seo: Seo | undefined): AbilitySeoInput {
  if (!seo) return {};
  const title = seo.title.trim();
  const description = seo.description.trim();
  const kws = focusKeywords(seo);
  return {
    ...(title ? { seoTitle: title } : {}),
    ...(description ? { seoDescription: description } : {}),
    ...(kws.length ? { focusKeyword: kws[0], keywords: kws.slice(1) } : {}),
  };
}

const hasSeoFields = (input: AbilitySeoInput): boolean =>
  input.seoTitle !== undefined || input.seoDescription !== undefined || input.focusKeyword !== undefined;

/** User-facing reason an SEO write failed, naming the common "site has no SEO plugin" case (the
 *  plugin refuses with `no_seo_plugin` advice) apart from a real error worth reading. */
function describeSeoFailure(e: unknown): string {
  const body =
    e instanceof WpHttpError ? (e.body as { data?: { errors?: Array<{ code?: string }> } } | undefined) : undefined;
  const noPlugin =
    body?.data?.errors?.some(err => err.code === 'no_seo_plugin') ||
    (e instanceof WpHttpError && /no SEO plugin/i.test(e.message));
  if (noPlugin) return '站点未安装或未启用 Rank Math/Yoast，SEO 字段未写入';
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
    // 1. Pre-push checks — only meaningful for an already-synced item. One get-blocks read carries
    //    everything: the concurrency token (`baseModified`), the live status, and whether the post is
    //    body-editable at all (someone else's editor → `editor` set).
    //    a) Compare against what we saw at last sync for INEQUALITY: any divergence means someone
    //       edited it on WP (a stronger, timezone-immune signal than "remote is newer").
    //    b) The post is already `publish` on WP: pushing overwrites live production content, and
    //       that's likely irreversible — always confirm, even when nothing else has changed.
    let remote: Awaited<ReturnType<WpClient['getBlocks']>> | undefined;
    if (item.wpPostId) {
      remote = await client.getBlocks(item.wpPostId);
      if (!force) {
        if (item.lastModifiedRemote && remote.baseModified !== baseOf(item.lastModifiedRemote)) {
          return { ok: false, conflict: true, reason: 'modified', remoteModified: remote.baseModified };
        }
        if (remote.status === 'publish') {
          return { ok: false, conflict: true, reason: 'published' };
        }
      }
    }

    // 1b. Resolve the body only NOW that the push is confirmed to proceed — see `resolveContent`'s doc.
    const markdown = opts.resolveContent ? await opts.resolveContent(item) : opts.content;
    const body = markdown?.trim() ? markdown : undefined;

    // 1c. A post made in another editor (classic / page builder) has no blocks of ours to replace;
    //     the plugin would refuse update-body anyway — say so up front, before anything was written.
    //     A meta-only push (no body) stays allowed: its SEO and title are still editable.
    if (body && remote?.editor) {
      return {
        ok: false,
        conflict: false,
        error:
          '这篇在 WordPress 里是用别的编辑器做的，推送正文会毁掉它的排版，已跳过。请在 WordPress 编辑器里改，或清空这篇笔记的正文只推送 SEO 和分类。',
      };
    }

    // 2. Assign this content's categories on WP, mirroring production. Skipped for types with no
    //    hierarchical taxonomy (e.g. page). Honors BOTH membership records (see getContentsForNode):
    //    its known `termIds` (imported / multi-category), plus the category of where it sits in the
    //    tree — so a never-pushed item, or one just moved, lands where the tree shows it. The taxonomy
    //    falls back to the tree's when the site's types haven't been discovered (else: no category at
    //    all, and WP files the post under its default category). The abilities take category SLUGS, so
    //    every id is resolved to its slug (cached; a term deleted on WP drops out).
    const taxonomyRestBase = client.taxRestBaseFor(item.postType) ?? taxonomyForNode(ws, item.siloNodeId);
    let termIds: number[] | undefined;
    let categories: string[] | undefined;
    if (syncCategories && taxonomyRestBase) {
      const home = await resolvePlacementTerm(client, ws, item.siloNodeId, taxonomyRestBase);
      const known = item.termIds ?? [];
      const merged = home && !known.includes(home.id) ? [...known, home.id] : known;
      if (merged.length) {
        termIds = merged;
        const slugs: string[] = [];
        for (const id of merged) {
          const slug = home && id === home.id ? home.slug : await client.termSlug(taxonomyRestBase, id);
          if (slug && !slugs.includes(slug)) slugs.push(slug);
        }
        if (slugs.length) categories = slugs;
      }
    }

    const seo = seoInput(item.seo);
    let pushed: AbilityPost;
    let seoWarning: string | undefined;

    if (!item.wpPostId) {
      // 3a. CREATE: one call carries title, slug, the whole body (compiled by the plugin) and the SEO.
      //     A body-less shell is exactly the same call with no blocks — the extension's default.
      const input = {
        type: item.postType,
        title: item.title,
        ...(item.slug ? { slug: item.slug } : {}),
        ...(body ? { blocks: [{ type: 'prose' as const, markdown: body }] } : {}),
        ...(categories ? { categories } : {}),
        ...seo,
      };
      try {
        pushed = await client.createPost(input);
      } catch (e) {
        // A site with no SEO plugin refuses the SEO part (invalid_seo/no_seo_plugin) BEFORE creating
        // anything. Under seoBestEffort, retry as a shell+body+categories create and keep the warning —
        // otherwise the whole push dies and the item keeps no wpPostId (the duplicate-draft trap).
        if (!seoBestEffort || !hasSeoFields(seo) || !(e instanceof WpHttpError) || e.code !== 'invalid_seo') throw e;
        seoWarning = describeSeoFailure(e);
        const { seoTitle: _t, seoDescription: _d, focusKeyword: _f, keywords: _k, ...rest } = input;
        pushed = await client.createPost(rest);
      }
    } else {
      // 3b. UPDATE: body first (update-body), then title/slug/SEO/categories (update-seo) — each write
      //     carries the previous one's `baseModified`. Either step is skipped when it has nothing to
      //     do, so a meta-only push is exactly one update-seo call.
      const id = item.wpPostId!;
      let bm = remote!.baseModified;
      if (body) {
        const r = await client.updateBody({ id, baseModified: bm, blocks: [{ type: 'prose', markdown: body }] });
        bm = r.baseModified;
      }
      const seoCall = {
        id,
        baseModified: bm,
        title: item.title,
        ...(item.slug ? { slug: item.slug } : {}),
        ...(categories ? { categories } : {}),
        ...seo,
      };
      try {
        pushed = await client.updateSeo(seoCall);
      } catch (e) {
        if (!seoBestEffort || !hasSeoFields(seo) || !(e instanceof WpHttpError) || e.code !== 'invalid_seo') throw e;
        seoWarning = describeSeoFailure(e);
        const { seoTitle: _t, seoDescription: _d, focusKeyword: _f, keywords: _k, ...rest } = seoCall;
        try {
          pushed = await client.updateSeo(rest);
        } catch (retry) {
          // By now the BODY is already on WP. Throwing would return no patch, so `lastModifiedRemote`
          // would never advance and EVERY later push of this item would false-conflict until someone
          // forced it — a permanently wedged item in a batch sync. Report what did land instead, with
          // the SEO warning attached. Only for an SEO-field refusal; a real failure (conflict, network)
          // still has to surface. Meta-only pushes (no body) have written nothing, so they throw.
          if (!body || !(retry instanceof WpHttpError) || retry.code !== 'invalid_seo') throw retry;
          seoWarning = describeSeoFailure(retry);
          return {
            ok: true,
            seoWarning,
            patch: { wpPostId: id, lastModifiedRemote: bm, wpLink: remote!.permalink ?? item.wpLink },
          };
        }
      }
    }

    // 4. Return the patch for the caller to persist. `lastModifiedRemote` is the abilities' final
    //    `baseModified` — the same clock and notation the next push's conflict guard reads, so a post
    //    only WE just changed never false-positives. `wpLink` is the canonical `permalink` (a draft's
    //    `link` is a nonce'd preview URL — useless for internal-link resolution and for the user).
    //    `seoSyncedAt` only when SEO actually got written — a best-effort skip must not claim it did.
    return {
      ok: true,
      ...(seoWarning ? { seoWarning } : {}),
      patch: {
        wpPostId: pushed.id,
        ...(seoWarning ? {} : { seoSyncedAt: new Date().toISOString() }),
        lastModifiedRemote: pushed.baseModified,
        dirtyAt: null, // pushed → local is in sync again
        ...(pushed.permalink ? { wpLink: pushed.permalink } : {}),
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
 * WP term of the category a node places content into: its nearest category node's `wpCategoryId`
 * when known (rename-proof), else found-or-created by name — starting below the deepest ancestor
 * category whose id IS known, so a known parent is never re-resolved by name. Returns `{id, slug}`
 * (the ledger stores ids; the abilities take slugs). Undefined when the node has no category
 * ancestor (type-root / 未分类 / virtual folders only).
 */
async function resolvePlacementTerm(
  client: WpClient,
  ws: SiloWorkspace,
  nodeId: string,
  tax: string,
): Promise<{ id: number; slug: string } | undefined> {
  const path = getNodePath(ws, nodeId).filter(isCategoryNode);
  if (!path.length) return undefined;
  let known = -1;
  for (let i = path.length - 1; i >= 0 && known < 0; i--) if (path[i].wpCategoryId != null) known = i;
  if (known === path.length - 1) {
    const id = path[known].wpCategoryId!;
    const slug = await client.termSlug(tax, id);
    return slug ? { id, slug } : undefined;
  }
  const parent = known >= 0 ? path[known].wpCategoryId! : 0;
  const leaf = await client.ensureTermPath(
    tax,
    path.slice(known + 1).map(n => n.term),
    parent,
  );
  return leaf ?? undefined;
}

export type NodeSyncResult = { ok: true; patch: Partial<SiloNode> } | { ok: false; error: string; authError?: boolean };

/**
 * Push a category NODE's own SEO to its WordPress term (the archive page's meta). Resolves the term
 * id from `node.wpCategoryId`, or creates the term path (excluding system ancestors) when the
 * category was planned in the extension but doesn't exist on WP yet. Only valid for real term nodes
 * (those with a `taxonomyRestBase`); system/type-root/site-root nodes have no term to write. Term
 * SEO travels through the plugin's seo-meta route — the abilities address posts only.
 */
export async function syncNode(client: WpClient, ws: SiloWorkspace, node: SiloNode): Promise<NodeSyncResult> {
  try {
    if (!isCategoryNode(node)) return { ok: false, error: '该节点不是分类，没有可推送的分类 SEO' };
    const tax = node.taxonomyRestBase;
    if (!tax) return { ok: false, error: '无法确定该分类所属的 taxonomy' };
    const termId = node.wpCategoryId ?? (await resolvePlacementTerm(client, ws, node.id, tax))?.id;
    if (termId == null) return { ok: false, error: '无法解析分类的 WordPress term id' };
    if (node.seo) await client.writeTermSeo(termId, node.seo);
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
