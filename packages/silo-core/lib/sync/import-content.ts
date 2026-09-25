/**
 * import-content — pull EXISTING WordPress content into the Silo model, the inverse of the push flow.
 *
 * WordPress is the source of truth. Here we read what's already there and recover its *relationship*
 * structure so the god's-eye view reflects the site as it actually is:
 *   - internal links (same-site `<a href>`, resolved to the target ContentItem)  → internal-link edges
 *   - external links (other-domain `<a href>`)                                   → external-link edges
 *   - keywords (Rank Math focus keyword, when the site exposes it via REST)       → Seo fields
 * We never author or inject links — parsing only reads. See parse-links.ts.
 */

import type { PostType, ContentItem, Edge, SiloWorkspace, LinkPlacement, BrokenLink } from '../model/types';
import { createContent, createNode } from '../model/factory';
import { reconcileKeywords } from '../model/keywords';
import { applySeoLimits, type SeoLimits } from '../model/seo-limits';
import { parseLinks, canonicalHost, isFallbackPermalink, type RawLink } from '../wp/parse-links';
import { wpHtmlToMarkdown } from '../content/body-codec';
import { buildNoteLinkIndex } from '../vault/note-links';
import type { WpClient, WpRawPost } from '../wp/client';

/** Per-document analysis surfaced in the UI at a glance (counts + the raw links behind them). */
export interface DocLinkReport {
  contentId: string;
  title: string;
  wpPostId: number;
  /** Internal links that resolved to another imported ContentItem (real relationship edges). */
  internalResolved: number;
  /** Same-site links whose target wasn't among the imported set (e.g. homepage, unselected type). */
  internalUnresolved: RawLink[];
  external: RawLink[];
  keywords: string[];
}

export interface ImportResult {
  ws: SiloWorkspace;
  /** The type-root nodes created/reused this import (博客/产品/解决方案…) — the top of each per-type
   *  taxonomy backbone. The UI expands these so the freshly-imported structure is visible. */
  rootNodeIds: string[];
  reports: DocLinkReport[];
  imported: number;
  /** Each imported content's body, converted to vault Markdown (`wpHtmlToMarkdown`) — internal links
   *  rewritten to `[[slug]]` using the SAME resolution this import used for its own edges, so a note's
   *  body and its edges never disagree about what's "internal". Keyed by ContentItem id. A content
   *  whose post had no `content.rendered` (rare — deleted between list and fetch) is simply absent. */
  bodies: Map<string, string>;
  /** Active SEO plugin as reported by the PufferGo read route ('rank-math' | 'yoast' | 'none'), or
   *  `null` when the route is absent — i.e. the PufferGo plugin isn't installed, so keywords couldn't
   *  be read and the UI should offer to install it. */
  seoProvider: string | null;
}

/** The named entities WordPress actually emits in `*.rendered` (it numeric-encodes the rest). */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
};

/**
 * Decode HTML entities. WordPress hands back `title.rendered` with special characters encoded — an
 * en dash becomes `&#8211;`, a non-breaking space `&nbsp;` — so a title stored without decoding shows
 * up literally as "首页 &#8211; 中文" everywhere the title is displayed or pushed back.
 *
 * Done in ONE pass rather than chained replaces, so an already-escaped entity is not decoded twice
 * (`&amp;#8211;` must yield the text `&#8211;`, not an en dash).
 */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      // Reject non-characters and anything out of range rather than emitting U+FFFD.
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

const stripHtml = (s: string): string => decodeEntities(s.replace(/<[^>]*>/g, '')).trim();

/** Read Rank Math keywords/title/description out of a post's REST-exposed meta (present only when the
 *  site registers them via show_in_rest). Returns null when nothing usable is there. */
function seoFromMeta(meta: Record<string, unknown> | undefined): Partial<ContentItem['seo']> | null {
  if (!meta) return null;
  const fk = typeof meta.rank_math_focus_keyword === 'string' ? meta.rank_math_focus_keyword : '';
  const title = typeof meta.rank_math_title === 'string' ? meta.rank_math_title : '';
  const description = typeof meta.rank_math_description === 'string' ? meta.rank_math_description : '';
  const kws = fk
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (!kws.length && !title && !description) return null;
  return {
    title,
    description,
    coreKeywords: kws.slice(0, 1),
    longTailKeywords: kws.slice(1),
  };
}

/** Generic, plugin-agnostic SEO read: Yoast exposes the effective title/description via
 *  `yoast_head_json` on every post when active — no PufferGo plugin, no show_in_rest needed. The focus
 *  keyword is NOT in this payload (Yoast keeps it private), so keywords stay empty here. Returns null
 *  when the payload is absent (Yoast inactive) or empty. */
function seoFromYoastHead(head: WpRawPost['yoast_head_json']): Partial<ContentItem['seo']> | null {
  if (!head || typeof head !== 'object') return null;
  const title = typeof head.title === 'string' ? head.title : '';
  const description = typeof head.description === 'string' ? head.description : '';
  if (!title && !description) return null;
  return { title, description, coreKeywords: [], longTailKeywords: [] };
}

export interface ImportOptions {
  onProgress?: (done: number, total: number, label: string) => void;
  /** Content id → existing note file name, so pulled bodies link to notes by their real names
   *  (note-links.ts). Contents without an entry use the name their note will be created with. */
  noteNames?: ReadonlyMap<string, string>;
  /** Import only these WP post ids (the rest of the workspace is left as it is). Default: every post. */
  onlyIds?: readonly number[];
}

/** Catch-all node term for content of a type that carries no taxonomy term. */
const UNCATEGORIZED_TERM = '未分类';

/**
 * Pull the given content types from WP, parse each doc's links, and merge everything into `ws`:
 * imported posts become ContentItems (parked under one "imported" bucket node), resolved internal
 * links + all external links become edges, Rank Math keywords fill the Seo fields. Idempotent per
 * wpPostId — re-importing updates the existing ContentItem instead of duplicating it.
 */
export async function importFromWp(
  client: WpClient,
  ws: SiloWorkspace,
  postTypes: PostType[],
  opts: ImportOptions = {},
): Promise<ImportResult> {
  const siteUrl = ws.profile.url;

  // 1. pull raw posts for every requested type
  const raw: { postType: PostType; post: WpRawPost }[] = [];
  for (let i = 0; i < postTypes.length; i++) {
    const pt = postTypes[i];
    opts.onProgress?.(i, postTypes.length, `拉取 ${pt}`);
    const posts = await client.listAllContentType(pt);
    posts.forEach(post => {
      if (!opts.onlyIds || opts.onlyIds.includes(post.id)) raw.push({ postType: pt, post });
    });
  }
  // 1b. lazily probe + batch-read SEO meta for all pulled posts (null = PufferGo plugin absent)
  opts.onProgress?.(postTypes.length, postTypes.length, '读取 SEO');
  const allIds = raw.map(r => r.post.id);
  let seoProvider: string | null = null;
  let seoLimits: SeoLimits | undefined;
  const seoById = new Map<number, { title: string; description: string; focusKeyword: string }>();
  try {
    const seo = await client.fetchSeoMeta(allIds);
    if (seo) {
      seoProvider = seo.provider;
      seo.items.forEach(it => seoById.set(it.id, it));
      seoLimits = seo.limits ?? undefined; // the site's PufferGo plugin decides the limits Silo checks against
      applySeoLimits(seoLimits);
    }
  } catch {
    // A real auth/permission error shouldn't abort the whole import; treat SEO as unavailable.
    seoProvider = null;
  }

  // 2. Build the taxonomy backbone. The Silo tree mirrors WordPress's OWN structure so it round-trips:
  //    one TYPE-ROOT node per imported type (博客/产品/解决方案…), that type's hierarchical taxonomy terms
  //    mirrored as child nodes (parent/child preserved), and an "未分类" catch-all per type. Content then
  //    hangs off its term node — or the catch-all when it has none. Types without a taxonomy (pages) keep
  //    their content flat directly under the type-root. Idempotent: re-import reuses nodes by stable
  //    identity (type-root by postType; term node by taxonomy + term id) instead of duplicating.
  opts.onProgress?.(postTypes.length, postTypes.length, '拉取分类');
  const nodes = [...ws.nodes];
  /** Silo node id → the front-end ARCHIVE url it represents (category archive or post-type archive).
   *  These are link targets that exist as nodes but never as ContentItems — see the resolution step. */
  const archiveUrlByNodeId = new Map<string, string>();

  const findTypeRoot = (pt: PostType) =>
    nodes.find(n => n.system && n.parentId === null && n.postType === pt && n.wpCategoryId == null);
  const findTermNode = (tax: string, termId: number) =>
    nodes.find(n => n.taxonomyRestBase === tax && n.wpCategoryId === termId);

  const typeRootId = new Map<PostType, string>();
  const termNodeIdByType = new Map<PostType, Map<number, string>>();
  const uncategorizedId = new Map<PostType, string>();

  // Importing only some posts (onlyIds): only their types and the categories they sit in (with those
  // categories' parents) come in, not every category of the site.
  const usedTypes = new Set(raw.map(r => r.postType));
  for (const pt of postTypes) {
    if (opts.onlyIds && !usedTypes.has(pt)) continue;
    const tax = client.taxRestBaseFor(pt);
    let root = findTypeRoot(pt);
    if (!root) {
      root = createNode(client.typeLabel(pt), 'pillar', null, {
        system: true,
        postType: pt,
        ...(tax ? { taxonomyRestBase: tax } : {}),
      });
      nodes.push(root);
    }
    typeRootId.set(pt, root.id);
    if (!tax) continue; // no taxonomy (e.g. pages) → content sits flat under the type-root

    let terms = await client.listAllTerms(tax);
    if (opts.onlyIds) {
      const keep = new Set(raw.filter(r => r.postType === pt).flatMap(r => r.post.termIds ?? []));
      for (let grew = true; grew; ) {
        grew = false;
        for (const t of terms)
          if (keep.has(t.id) && t.parent && !keep.has(t.parent)) {
            keep.add(t.parent);
            grew = true;
          }
      }
      terms = terms.filter(t => keep.has(t.id));
    }
    const nodeIdByTerm = new Map<number, string>();
    const placeTerm = (termId: number, name: string, parentId: string, archiveUrl?: string): void => {
      let node = findTermNode(tax, termId);
      if (!node) {
        // Imported from a real WP taxonomy → it IS a category (isCategory:true), preset so the user
        // never has to re-flag it.
        node = createNode(name, 'cluster', parentId, {
          postType: pt,
          taxonomyRestBase: tax,
          wpCategoryId: termId,
          isCategory: true,
        });
        nodes.push(node);
      } else {
        // keep the mirrored node in sync with WP (its name/parent may have changed there)
        node.term = name;
        node.parentId = parentId;
        node.postType = pt;
        node.isCategory = true;
      }
      nodeIdByTerm.set(termId, node.id);
      // A category archive is a real destination that menus link to; remember its URL so those links
      // resolve to this node instead of being discarded as unresolvable.
      if (archiveUrl) archiveUrlByNodeId.set(node.id, archiveUrl);
    };
    // place parents before children so each child can point at a real parent node
    const remaining = [...terms];
    let guard = remaining.length + 1;
    while (remaining.length && guard-- > 0) {
      for (let i = remaining.length - 1; i >= 0; i--) {
        const t = remaining[i];
        if (t.parent !== 0 && !nodeIdByTerm.has(t.parent)) continue;
        placeTerm(t.id, t.name, t.parent === 0 ? root.id : nodeIdByTerm.get(t.parent)!, t.link);
        remaining.splice(i, 1);
      }
    }
    // orphans (parent term absent from the pull) attach to the type-root so nothing is dropped
    remaining.forEach(t => placeTerm(t.id, t.name, root!.id, t.link));
    termNodeIdByType.set(pt, nodeIdByTerm);
  }

  const ensureUncategorized = (pt: PostType): string => {
    const cached = uncategorizedId.get(pt);
    if (cached) return cached;
    const rootId = typeRootId.get(pt)!;
    let node = nodes.find(n => n.system && n.parentId === rootId && n.term === UNCATEGORIZED_TERM);
    if (!node) {
      node = createNode(UNCATEGORIZED_TERM, 'cluster', rootId, { system: true, postType: pt });
      nodes.push(node);
    }
    uncategorizedId.set(pt, node.id);
    return node.id;
  };

  const resolveNodeId = (pt: PostType, termIds: number[] | undefined): string => {
    const rootId = typeRootId.get(pt)!;
    if (!client.taxRestBaseFor(pt)) return rootId; // flat type (pages)
    const map = termNodeIdByType.get(pt);
    const tid = (termIds ?? []).find(id => map?.has(id));
    return tid != null ? map!.get(tid)! : ensureUncategorized(pt);
  };

  opts.onProgress?.(postTypes.length, postTypes.length, '解析关系');

  // 3. build/refresh a ContentItem per post (dedup by wpPostId)
  const byWpId = new Map<number, ContentItem>(
    ws.contents.filter(c => c.wpPostId != null).map(c => [c.wpPostId as number, c]),
  );
  const contents = [...ws.contents];
  const upsert = (item: ContentItem) => {
    const idx = contents.findIndex(c => c.id === item.id);
    if (idx >= 0) contents[idx] = item;
    else contents.push(item);
  };

  /** SEO from the dedicated read route (primary), falling back to wp/v2 meta if a site exposes it. */
  const seoPatchFor = (post: WpRawPost): Partial<ContentItem['seo']> | null => {
    const fromRoute = seoById.get(post.id);
    if (fromRoute) {
      const kws = fromRoute.focusKeyword
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      if (kws.length || fromRoute.title || fromRoute.description) {
        return {
          title: fromRoute.title,
          description: fromRoute.description,
          coreKeywords: kws.slice(0, 1),
          longTailKeywords: kws.slice(1),
        };
      }
    }
    // Fallbacks, in order: Rank Math meta exposed via show_in_rest, then Yoast's generic head payload.
    return seoFromMeta(post.meta) ?? seoFromYoastHead(post.yoast_head_json);
  };

  const imported: { item: ContentItem; post: WpRawPost }[] = [];
  for (const { postType, post } of raw) {
    const existing = byWpId.get(post.id);
    const seoPatch = seoPatchFor(post);
    const title = stripHtml(post.title?.rendered ?? '');
    const nodeId = resolveNodeId(postType, post.termIds);
    const base = existing ?? createContent(nodeId, title, postType);
    const item: ContentItem = {
      ...base,
      siloNodeId: nodeId,
      termIds: post.termIds ?? [],
      postType,
      title: title || base.title,
      slug: post.slug || base.slug,
      wpPostId: post.id,
      wpLink: post.link,
      wpStatus: post.status ?? base.wpStatus,
      lastModifiedRemote: post.modified_gmt ?? post.modified,
      dirtyAt: null, // freshly pulled from WP → in sync
      seo: seoPatch ? { ...base.seo, ...seoPatch } : base.seo,
    };
    upsert(item);
    imported.push({ item, post });
  }

  // 4. index imported + pre-existing content by canonical permalink for internal-link resolution
  const byUrl = new Map<string, string>(); // canonical url -> contentId
  const canon = (u: string): string => {
    try {
      const url = new URL(u);
      return `${canonicalHost(url.toString())}${url.pathname.replace(/\/$/, '')}`.toLowerCase();
    } catch {
      return u.toLowerCase();
    }
  };
  // A fallback `?page_id=N` permalink shares canon()'s bucket with the site root, so it must never land
  // in byUrl and clobber the real homepage's entry — it is matched by wpPostId instead, see
  // `resolveInternalTarget` below.
  contents.forEach(c => {
    if (c.wpLink && !isFallbackPermalink(c.wpLink)) byUrl.set(canon(c.wpLink), c.id);
  });

  /**
   * Post-type ARCHIVE urls (`/case-studies`, `/products`, …), derived from the permalinks of the type's
   * own items. WordPress does not expose `archive_link` over REST in the view context, and the archive
   * slug is a rewrite rule we can't read — but every item of a type with an archive sits directly under
   * it (`/case-studies/<slug>/`), so the shared leading segment IS the archive path.
   *
   * Guarded to avoid inventing archives that don't exist: the prefix must be shared by ALL of the
   * type's items, be exactly ONE segment, and not be numeric. That last rule is what keeps date-based
   * permalinks (`/2026/07/20/hello`) from registering `/2026` as the blog archive.
   */
  const pathSegments = (u: string): string[] => {
    try {
      return new URL(u).pathname.split('/').filter(Boolean);
    } catch {
      return [];
    }
  };
  for (const [pt, rootId] of typeRootId) {
    const links = imported.filter(x => x.item.postType === pt && x.item.wpLink).map(x => x.item.wpLink!);
    if (!links.length) continue;
    const firsts = new Set(links.map(l => pathSegments(l)[0] ?? ''));
    const seg = firsts.size === 1 ? [...firsts][0] : '';
    // One shared, non-numeric leading segment, and the items must actually sit BELOW it (not be it).
    if (!seg || /^\d+$/.test(seg) || links.some(l => pathSegments(l).length < 2)) continue;
    try {
      archiveUrlByNodeId.set(rootId, new URL(`/${seg}`, siteUrl).toString());
    } catch {
      /* unparseable site url — skip */
    }
  }

  // Archives resolve to the NODE that represents them. Without this, every menu link pointing at a
  // section (which is most of them) is dropped, and the homepage looks like it links nowhere — the
  // exact flow from the site's strongest page down into each silo goes missing.
  for (const [nodeId, url] of archiveUrlByNodeId) {
    const key = canon(url);
    if (!byUrl.has(key)) byUrl.set(key, nodeId);
  }

  // 5. parse links per doc → edges + report. Drop stale edges from re-imported docs first.
  const importedIds = new Set(imported.map(x => x.item.id));
  const edges: Edge[] = ws.edges.filter(
    e => !(importedIds.has(e.from) && (e.type === 'internal-link' || e.type === 'external-link')),
  );
  const reports: DocLinkReport[] = [];

  /**
   * The homepage is parsed from its FULL themed HTML; every other page from `content.rendered` alone.
   *
   * Why asymmetric: a theme's header/footer links are identical on every page, so parsing them
   * everywhere would add the same nav fan-out N times and turn the graph into a near-complete mesh —
   * destroying the in-silo/cross-silo reading that is the whole point of this view. Parsing them ONCE,
   * on the page that in practice holds the most external authority, captures the 首页 → pillar flow
   * the tree otherwise misses without the blow-up. It also mirrors how the links actually count:
   * boilerplate repeated site-wide passes very little beyond the first occurrence.
   *
   * Best-effort: one extra HTTP fetch, and any failure falls back to `content.rendered`.
   */
  const homeUrl = canon(siteUrl);
  // Exclude page_id-fallback links here too (see isFallbackPermalink above) — otherwise a slugless
  // draft/private page can win this `find` (whichever comes first in `imported`) and get treated as
  // THE homepage document, silently swapping in the wrong page's nav for the whole site.
  const homeDoc = imported.find(
    ({ item }) => item.wpLink && !isFallbackPermalink(item.wpLink) && canon(item.wpLink) === homeUrl,
  );
  let homeHtml: string | null = null;
  if (homeDoc?.item.wpLink) {
    homeHtml = (await client.fetchRenderedPage(homeDoc.item.wpLink).catch(() => '')) || null;
  }

  // WordPress falls back to an ugly `?page_id=N` / `?p=N` permalink for posts that don't have a real
  // pretty permalink yet (draft / pending / private / trashed). `canon()` strips the query string, so
  // that fallback's empty pathname collapses onto the SAME key as the homepage — without this, every
  // such link would silently resolve as "links to 首页" instead of being reported unresolved/broken.
  // Resolve those by WP post id directly, bypassing canon() entirely.
  // Built from the whole workspace, not just this batch, so a `?p=N` link still resolves when its
  // target came in on an earlier import (or a post type this run didn't fetch).
  const byWpPostId = new Map<number, string>(
    contents.filter(c => c.wpPostId != null).map(c => [c.wpPostId as number, c.id]),
  );
  const byId = (url: string): string | undefined => {
    try {
      const params = new URL(url, siteUrl).searchParams;
      const idStr = params.get('page_id') ?? params.get('p');
      const id = idStr ? Number(idStr) : NaN;
      return Number.isFinite(id) ? byWpPostId.get(id) : undefined;
    } catch {
      return undefined;
    }
  };
  // Order matters: the id lookup must come FIRST for a fallback permalink. canon() would otherwise
  // strip its query string, leaving the empty site-root path — a `?page_id=123` link would match the
  // homepage's byUrl entry and be recorded as "links to 首页".
  // A fallback permalink is resolved by id ONLY — never fall through to byUrl, whose site-root key is
  // the homepage; an unknown id has to stay unresolved (i.e. get reported) rather than silently
  // becoming a link to 首页.
  const resolveInternalTarget = (url: string): string | undefined =>
    isFallbackPermalink(url, siteUrl) ? byId(url) : byUrl.get(canon(url));

  // Body-side reuse of the exact same resolution edges are built from — a note's `[[wikilink]]`s and
  // its silo edges must never disagree about what counts as "internal". Never the homepage's full themed
  // HTML (only `parseLinks` wants that, for the nav fan-out reason documented above): the vault body is
  // always just the article's own `content.rendered`.
  const noteLinks = buildNoteLinkIndex({ ...ws, contents }, opts.noteNames);
  const resolveWikilinkName = (url: string): string | undefined => {
    const targetId = resolveInternalTarget(url);
    return targetId ? noteLinks.nameFor(targetId) : undefined;
  };
  const bodies = new Map<string, string>();

  for (const { item, post } of imported) {
    const bodyHtml = post.content?.rendered ?? '';
    if (bodyHtml) bodies.set(item.id, wpHtmlToMarkdown(bodyHtml, resolveWikilinkName));

    const html = (item.id === homeDoc?.item.id && homeHtml) || bodyHtml;
    const { internal, external } = parseLinks(html, siteUrl, post.link);
    const internalUnresolved: RawLink[] = [];
    let internalResolved = 0;
    for (const link of internal) {
      const targetId = link.url ? resolveInternalTarget(link.url) : undefined;
      if (targetId && targetId !== item.id) {
        edges.push({
          from: item.id,
          to: targetId,
          type: 'internal-link',
          anchor: link.anchor,
          dofollow: link.dofollow,
          placement: link.placement,
        });
        internalResolved++;
      } else {
        internalUnresolved.push(link);
      }
    }
    for (const link of external) {
      if (link.url)
        edges.push({
          from: item.id,
          to: link.url,
          type: 'external-link',
          anchor: link.anchor,
          dofollow: link.dofollow,
          placement: link.placement,
        });
    }
    reports.push({
      contentId: item.id,
      title: item.title,
      wpPostId: post.id,
      internalResolved,
      internalUnresolved,
      external,
      keywords: [...item.seo.coreKeywords, ...item.seo.longTailKeywords],
    });
  }

  /**
   * Probe the same-site links that resolved to nothing, and keep the ones that are genuinely dead.
   *
   * "Unresolved" alone is not a defect — it also covers links into content types this import didn't
   * pull. Only an HTTP status separates the two, and that needs a live request, which the (pure)
   * health analysis can't make. So the probe happens here and the verdict is persisted.
   *
   * Deduped by URL and capped, because this is the one part of import that costs one request per
   * distinct target. A failed probe returns 0 and is dropped — an offline moment must never be
   * reported to the user as a broken link.
   */
  const PROBE_LIMIT = 60;
  const unresolvedByUrl = new Map<string, { from: string; href: string; anchor: string; placement?: LinkPlacement }>();
  for (const r of reports) {
    for (const l of r.internalUnresolved) {
      if (!l.url || unresolvedByUrl.has(l.url)) continue;
      unresolvedByUrl.set(l.url, { from: r.contentId, href: l.href, anchor: l.anchor, placement: l.placement });
    }
  }
  const brokenLinks: BrokenLink[] = [];
  const probeTargets = [...unresolvedByUrl.entries()].slice(0, PROBE_LIMIT);
  for (let i = 0; i < probeTargets.length; i++) {
    const [url, meta] = probeTargets[i];
    opts.onProgress?.(i, probeTargets.length, '检查站内死链');
    const status = await client.probeUrlStatus(url);
    if (status >= 400) brokenLinks.push({ ...meta, url, status });
  }

  // When the PufferGo read route is absent (seoProvider null), detect what we could still read
  // generically, so the UI reflects reality (e.g. "Yoast — 标题/描述已读，关键词需插件") instead of a
  // blanket "install PufferGo" prompt.
  if (seoProvider == null) {
    // Mirror the data priority in seoPatchFor (rank_math meta before yoast head) so the reported
    // provider matches where the SEO fields actually came from.
    if (raw.some(r => seoFromMeta(r.post.meta))) seoProvider = 'rank-math';
    else if (raw.some(r => seoFromYoastHead(r.post.yoast_head_json))) seoProvider = 'yoast';
  }

  // Prune emptied SYSTEM holding nodes: the legacy single "从 WordPress 导入" bucket whose content just
  // moved to the new type-roots, and any "未分类" catch-all that ended up empty. Real term nodes (not
  // system) are always kept — they mirror the WP category tree even when they hold no content yet.
  const keptNodes = nodes.filter(n => {
    if (!n.system) return true;
    const hasChildren = nodes.some(m => m.parentId === n.id);
    const hasContent = contents.some(c => c.siloNodeId === n.id);
    return hasChildren || hasContent;
  });
  const keptIds = new Set(keptNodes.map(n => n.id));

  // Merge the imported keywords into the managed vocabulary (incremental: adopts new cloud words,
  // refreshes provenance, keeps the user's local planned words). Never destructive.
  const mergedWs = { ...ws, nodes: keptNodes, contents, edges, brokenLinks };
  const keywords = reconcileKeywords(mergedWs);

  return {
    ws: { ...mergedWs, keywords, ...(seoLimits ? { seoLimits } : {}) },
    rootNodeIds: [...typeRootId.values()].filter(id => keptIds.has(id)),
    reports,
    imported: imported.length,
    bodies,
    seoProvider,
  };
}

export interface RefreshResult {
  /** The content refreshed from the cloud (same id / siloNodeId; `dirtyAt` cleared). Unchanged when
   *  there was nothing to pull. */
  item: ContentItem;
  /** Live WP `modified_gmt` at refresh time (null if the post is gone). */
  remoteGmt: string | null;
  /** True when the post no longer exists on WP (deleted there) — the caller decides what to do. */
  deleted?: boolean;
}

/**
 * Pull a SINGLE content item's latest state from WordPress (title / slug / status / categories / SEO),
 * without re-importing the whole tree. Returns the refreshed ContentItem for the caller to apply. The
 * caller is responsible for the conflict guard: if `item.dirtyAt` is set (unpushed local edits),
 * applying this overwrites them, so it should confirm with the user first.
 */
export async function refreshContentFromWp(client: WpClient, item: ContentItem): Promise<RefreshResult> {
  if (item.wpPostId == null) return { item, remoteGmt: item.lastModifiedRemote };
  const post = await client.fetchContentItem(item.postType, item.wpPostId);
  if (!post) return { item, remoteGmt: null, deleted: true };

  let seoPatch: Partial<ContentItem['seo']> | null = null;
  try {
    const seo = await client.fetchSeoMeta([post.id]);
    const it = seo?.items.find(x => x.id === post.id);
    if (it) {
      const kws = it.focusKeyword
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      if (kws.length || it.title || it.description) {
        seoPatch = {
          title: it.title,
          description: it.description,
          coreKeywords: kws.slice(0, 1),
          longTailKeywords: kws.slice(1),
        };
      }
    }
  } catch {
    // SEO read unavailable (plugin absent / permission) — fall back below, never abort the refresh.
  }
  if (!seoPatch) seoPatch = seoFromMeta(post.meta) ?? seoFromYoastHead(post.yoast_head_json);

  const title = stripHtml(post.title?.rendered ?? '');
  const updated: ContentItem = {
    ...item,
    title: title || item.title,
    slug: post.slug || item.slug,
    termIds: post.termIds ?? [],
    wpStatus: post.status ?? item.wpStatus,
    wpLink: post.link,
    lastModifiedRemote: post.modified_gmt ?? post.modified,
    dirtyAt: null,
    seo: seoPatch ? { ...item.seo, ...seoPatch } : item.seo,
  };
  return { item: updated, remoteGmt: updated.lastModifiedRemote };
}
