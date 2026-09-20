/**
 * Silo content model — the authoritative, framework-agnostic data structure for the SEO Silo
 * content manager. Lives in `@puffergo/silo-core` so it can be reused verbatim by a future
 * Obsidian plugin (only the storage / network / view adapters differ per host).
 *
 * Core shape: a single tree rooted at the *site positioning* (mirrors PufferGo Step1 site profile).
 *   root (SiteProfile) → Pillar keyword nodes → Cluster keyword nodes → ContentItems.
 * It is really a *graph with a hierarchical backbone*: parent edges form the Silo tree; internal
 * links (V2) and external backlinks (V2) are extra edges layered on top. That is why relationships
 * live in an explicit `edges` array rather than being implied purely by the tree.
 */

import type { SeoLimits } from './seo-limits';

/** A WordPress post type slug as it exists on the connected site — 'post', 'page', WooCommerce
 *  'product', PufferGo 'puffergo_product', or ANY other CPT. Deliberately a free string, NOT a fixed
 *  enum: the site's real types are discovered at connect (see ContentTypeInfo), so the Silo works with
 *  any plugin's content types with zero hardcoded slugs. */
export type PostType = string;

/** One content type discovered from the connected WordPress — everything routing + silo→category
 *  mirroring needs, all data-driven so nothing is baked in per plugin. */
export interface ContentTypeInfo {
  /** Post type slug — also stored on ContentItem.postType. */
  type: string;
  /** REST base for the type's items (e.g. 'posts', 'pages', 'products', 'puffergo_product'). */
  restBase: string;
  /** Human-readable label from WP. */
  label: string;
  /** REST base of the type's HIERARCHICAL taxonomy (the category-equivalent) for silo→term mirroring,
   *  when it has one. e.g. post→'categories', WooCommerce product→'product_cat',
   *  PufferGo product→'puffergo_product_cat'. Absent when the type has no hierarchical taxonomy. */
  taxonomyRestBase?: string;
}

/** Search intent of a keyword node — used during planning. */
export type SearchIntent = 'informational' | 'commercial' | 'transactional' | 'navigational';

/** Planning-time classification of a keyword's NATURE: a head/broad term vs a specific long-tail. This
 *  is a research attribute of the word itself and is DISTINCT from its per-page ROLE (core focus vs
 *  long-tail focus), which is not stored on the keyword — the same word can be one page's core focus
 *  and another page's long-tail, so role lives on the content↔keyword assignment (Seo core/long-tail
 *  arrays). Optional planning hint only. */
export type KeywordTier = 'head' | 'longtail';

/** Provenance of a managed keyword: created locally (planning), pulled from the cloud (used by an
 *  imported WP post/term), or both. */
export type KeywordSource = 'local' | 'cloud' | 'both';

/**
 * A first-class, MANAGED keyword — the vocabulary the user plans, curates, and reuses. Identity is the
 * normalized term (trimmed + lower-cased); display keeps the first-seen casing. Crucially it stores NO
 * core/long-tail role: that is a property of each content assignment, because one word is legitimately
 * a page's core focus AND another page's long-tail (a healthy topic-cluster). A keyword can exist with
 * ZERO content covering it — that's a planned gap, the whole point of a planning tool.
 */
export interface KeywordEntity {
  id: string;
  /** Display casing of the term. Matched case-insensitively for identity/usage. */
  term: string;
  source: KeywordSource;
  intent?: SearchIntent;
  /** Optional planning hint of the word's nature (head vs long-tail) — NOT the per-page role. */
  plannedTier?: KeywordTier;
  note?: string;
}

/** A keyword node is either a Pillar (support pillar) or a Cluster (subtopic). */
export type NodeKind = 'pillar' | 'cluster';

/**
 * SEO fields for one content item. Field names + shape are aligned EXACTLY with PufferGo
 * `step3Data.pages[].seo` so a ContentItem can be mapped losslessly into a PufferGo pipeline
 * (`create-pages` / `publish-pages`) with zero migration on a PufferGo-equipped site.
 */
export interface Seo {
  title: string;
  description: string;
  /** 1–3 core keywords. */
  coreKeywords: string[];
  /** Up to ~5–8 long-tail keywords. */
  longTailKeywords: string[];
}

/**
 * A keyword node in the Silo tree (Pillar or Cluster). Keyword hierarchy maps 1:1 onto WordPress
 * category parent/child structure; `wpCategoryId` is the anchor, resolved/created on sync.
 */
export interface SiloNode {
  id: string;
  term: string;
  kind: NodeKind;
  intent?: SearchIntent;
  /** Parent node id, or `null` for a top-level Pillar (a direct child of the root/site positioning). */
  parentId: string | null;
  /** WP category id once resolved/created on sync; `null` until then. For nodes mirrored from a WP
   *  taxonomy term (via import), this is the term id and `taxonomyRestBase` says which taxonomy. */
  wpCategoryId: number | null;
  /** SEO for the category ARCHIVE page this node represents (e.g. /category/行业动态/) — its own
   *  rankable page. Pushed to the term's Rank Math meta (objectType:'term'). Absent on nodes that
   *  aren't real terms (site root, type-roots, 未分类) or when never edited. */
  seo?: Seo;
  /** The post type this node's subtree hosts. Set on a TYPE-ROOT node (博客/产品/解决方案…) and inherited
   *  by its term descendants, so the taxonomy backbone round-trips: content of this type mirrors into
   *  this type's taxonomy. Absent on the site root and legacy keyword-only nodes. */
  postType?: PostType;
  /** REST base of the taxonomy this node's term belongs to ('categories', 'product_cat', …). Set
   *  together with `wpCategoryId` so a node pushes back to the RIGHT taxonomy (product terms never leak
   *  into post categories). Absent on type-root/holding nodes that carry no term of their own. */
  taxonomyRestBase?: string;
  /** Whether this keyword node IS a real WordPress category (a taxonomy term). true → round-trips to a
   *  WP term (created on push if `wpCategoryId` is null) and owns an archive-page SEO. false/absent →
   *  a purely-organizational virtual folder, transparent to WP (its content inherits the nearest
   *  category ancestor). Set true automatically for terms pulled on import; new user nodes default off.
   *  System grouping nodes ignore this (they're never categories). See `isCategoryNode`. */
  isCategory?: boolean;
  /** A system/holding node — a type-root (博客/产品…) or an "未分类" catch-all, not a keyword the user
   *  chose. Content under it is exempt from keyword-alignment checks. Absent/false for real term nodes. */
  system?: boolean;
}

/**
 * A content item — the SEO/structural PROJECTION of a WordPress post/page/CPT entry, NOT the article
 * itself. The extension plans it (title/slug/SEO/placement) and one-click pushes it to WP as an empty
 * DRAFT shell; the body is then authored elsewhere (Obsidian note → WP, or wp-admin). The body is
 * therefore NEVER stored here — each host resolves it from its own source (extension → fetch from WP
 * on demand for preview; Obsidian → the note file). This is what keeps the model host-portable.
 */
export interface ContentItem {
  id: string;
  /** The keyword node this content hangs off (its place in the Silo). */
  siloNodeId: string;
  postType: PostType;
  title: string;
  /** Optional URL slug; WP generates one if omitted. */
  slug?: string;
  seo: Seo;
  /** Term ids this content belongs to in its OWN type's hierarchical taxonomy (post→categories,
   *  product→product_cat, …). Full multi-category membership as it exists on WP — the content shows
   *  under EVERY matching category node (one item, many homes) and pushes back to ALL of them, matching
   *  production. Empty/absent = uncategorized (parked under the type's 未分类, or a type with no taxonomy
   *  like page). `siloNodeId` still marks its primary/anchor home. */
  termIds?: number[];
  /** WP post id once the page exists in WordPress (created by one-click push, or discovered on import).
   *  `null` = still only a planned page in the extension, awaiting a body written in Obsidian/WP. */
  wpPostId: number | null;
  /** WordPress's own post status (`draft` / `publish` / …), captured on push/import. Undefined while
   *  the page exists only as a plan here. */
  wpStatus?: string;
  /** WP permalink, captured on import from WP. Used to resolve other posts' internal links back to
   *  this content. `null` for content planned locally that has never been pushed/pulled. */
  wpLink?: string | null;
  /** ISO timestamp of the last SEO-meta / shell push to WP. `null` before first push. */
  seoSyncedAt: string | null;
  /** WP `modified_gmt` (UTC) captured at last push/import. Compared for INEQUALITY against the live WP
   *  `modified_gmt` before pushing/refreshing to detect edits made directly in wp-admin (conflict
   *  detection). UTC so it's immune to the site's timezone / DST changes; and because both sides come
   *  from the SAME server clock, the local machine's timezone is irrelevant. */
  lastModifiedRemote: string | null;
  /** ISO timestamp of the last LOCAL edit not yet pushed to WP (set on user edits; cleared on
   *  push/import/refresh). Non-null = there are unsynced local changes — used to warn before a refresh
   *  would overwrite them from the cloud. */
  dirtyAt?: string | null;
}

/** Edge kinds. `parent` is the Silo backbone (also encoded on SiloNode.parentId / ContentItem.siloNodeId
 *  for convenience); `internal-link` and `external-link` are V2 and live only here. */
export type EdgeType = 'parent' | 'internal-link' | 'external-link';

/**
 * A relationship edge — structured link data, the same category as keywords (shown in the god's-eye
 * view, curated by the user, fed to AI as a brief). We never inject links into content from these.
 *
 * `internal-link`: `from`/`to` are both ContentItem ids (an outbound internal link resolved to its
 * target content on the same site).
 * `external-link`: `from` is a ContentItem id and `to` is the external absolute URL (an OUTBOUND
 * link to another domain). This matches what we can recover by parsing a post's rendered HTML.
 * `anchor`/`dofollow` describe the link as it appears in the content.
 */
/**
 * Which part of the page a link sits in. Google renders header/footer like everything else but
 * DISCOUNTS boilerplate links — a nav item repeated site-wide passes far less than an in-context
 * body link (the "reasonable surfer" idea: weight follows the odds of an actual click). So placement
 * is kept as data and the graph de-emphasises the template layer rather than hiding or equating it.
 *
 * Absent = parsed from `content.rendered` alone, where there IS no template markup — treated as
 * 'body' everywhere downstream, so existing workspaces need no migration.
 */
export type LinkPlacement = 'body' | 'nav' | 'footer';

export interface Edge {
  from: string;
  to: string;
  type: EdgeType;
  anchor?: string;
  dofollow?: boolean;
  /** Where on the page the link was found. Only set for docs parsed from full rendered HTML. */
  placement?: LinkPlacement;
}

/**
 * Site positioning = the ROOT of the Silo tree. Mirrors PufferGo Step1 site profile: it is both the
 * Silo's center and the source of truth feeding downstream AI content generation.
 */
export interface SiteProfile {
  /** Site / brand name shown as the Silo root. */
  name: string;
  /** Site domain (absolute URL). Also the join key that ties this Silo to the 建站 tab's site record. */
  url: string;
  /** One-line positioning. Deliberately kept minimal (not the full siteProfileSchema): the profile
   *  shape is still moving, and coupling to it would force two-place edits. See migrate.ts. */
  tagline?: string;
}

/**
 * WordPress connection config. The Application Password is stored LOCALLY ONLY (chrome.storage.local
 * in the extension; vault/saveData in Obsidian) and NEVER sent to our servers.
 */
export interface WpConnection {
  siteUrl: string;
  username: string;
  appPassword: string;
  /** Content types discovered from `/wp/v2/types` + `/wp/v2/taxonomies` at connect, carrying each
   *  type's item rest_base and its hierarchical-taxonomy rest_base. Drives routing, the type pickers,
   *  and silo→category mirroring — all data-driven, no hardcoded CPT/taxonomy slugs. */
  contentTypes?: ContentTypeInfo[];
}

/**
 * The whole workspace for one site's Silo, persisted as a single JSON blob via a StoragePort.
 * `bump version` on any breaking shape change so migrations can key off it.
 */
export interface SiloWorkspace {
  version: number;
  profile: SiteProfile;
  /** Stored locally alongside the workspace. Optional so a workspace can exist before connecting. */
  connection?: WpConnection;
  nodes: SiloNode[];
  contents: ContentItem[];
  /** Extra edges beyond the parent backbone (internal / external links). V2. */
  edges: Edge[];
  /** The managed keyword vocabulary — first-class so a keyword can be PLANNED before any content covers
   *  it, and so local + cloud keywords merge into one incrementally-growing list. Reconciled on load /
   *  import to always cover every term used in content/category SEO. See lib/model/keywords.ts. */
  keywords: KeywordEntity[];
  /** Same-site links whose target answered 4xx/5xx when last imported. Recorded at import time
   *  because it needs a live HTTP probe, which the pure health analysis can't do. Absent on
   *  workspaces imported before this existed — treated as "not checked", never as "none broken". */
  brokenLinks?: BrokenLink[];
  /** The site's SEO limits as its PufferGo plugin published them at the last import; absent = Silo's defaults.
   *  Kept in the workspace so health checks in a later session (another CLI run, a reopened vault) use them. */
  seoLimits?: SeoLimits;
}

/** One internal link found in content whose target does not exist. */
export interface BrokenLink {
  /** ContentItem id of the page containing the link. */
  from: string;
  /** href exactly as authored (what the user has to find and fix). */
  href: string;
  /** Resolved absolute URL that was probed. */
  url: string;
  anchor: string;
  placement?: LinkPlacement;
  /** HTTP status the probe got back (404, 500, …). */
  status: number;
}

/** Current workspace schema version. Bump on any breaking shape change; see migrate.ts. */
export const SILO_WORKSPACE_VERSION = 3;

/**
 * Top-level persisted blob: one Silo workspace PER SITE, keyed by canonical domain. This is the join
 * point with the 建站 tab — a site built there shows up here under the same domain key. `activeDomain`
 * is the currently-open site. Placeholder key `__local__` holds a not-yet-connected local workspace.
 */
export interface SiloStore {
  storeVersion: number;
  sites: Record<string, SiloWorkspace>;
  activeDomain: string;
  /** Domains the user explicitly removed from the picker. Kept so a site discovered from the 建站 tab
   *  (setupTasks) stays hidden after deletion instead of reappearing. */
  hiddenDomains?: string[];
}

/** Current store schema version. */
export const SILO_STORE_VERSION = 1;

/** Placeholder domain key for a workspace that has no site URL yet. */
export const LOCAL_SITE_KEY = '__local__';
