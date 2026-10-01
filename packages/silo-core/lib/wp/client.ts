/**
 * WpClient — the ONE WordPress client of silo-core, framework-agnostic over a NetworkPort (so the same
 * class runs in the extension's service worker, in Obsidian's requestUrl and in node).
 *
 * Two surfaces, one client:
 *   • The PufferGo plugin's ABILITIES (`/wp-abilities/v1/abilities/puffergo/*`) own everything that
 *     WRITES content: create-post / update-body / update-seo / publish-post, and the reads that mirror
 *     a post (get-blocks with full=true hands back the whole body as the Markdown/HTML/config it was
 *     written from). The plugin compiles body Markdown into core WordPress blocks — the one compiler,
 *     in one place — so this client never turns Markdown into HTML itself.
 *   • Plain `/wp/v2` stays for what the abilities deliberately don't cover: the media library, taxonomy
 *     term reads/creates, content-type discovery, rendered-HTML previews and public link probes.
 *
 * SEO title/description/keywords for POSTS travel inside the abilities (update-seo → the plugin's
 * provider abstraction over Rank Math/Yoast). Category ARCHIVE (term) SEO still goes through the
 * plugin's own `/puffergo/v1/seo-meta` route — abilities address posts only.
 *
 * Auth is Basic (an Application Password) on every request, mirroring the extension's
 * `WordPressApiClient` but decoupled from `fetch` so it also runs inside Obsidian.
 */

import type { HttpRequest, NetworkPort } from '../ports/network';
import { WpHttpError } from '../ports/network';
import type { ContentItem, ContentTypeInfo, PostType, Seo, WpConnection } from '../model/types';
import { focusKeywords } from '../model/selectors';
import type { SeoLimits } from '../model/seo-limits';

/** A term name as WP's REST returns it (HTML-escaped: `A &amp; B`) → plain text. */
const decodeTermName = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');

/**
 * Fallback rest_base for the two WP-core types, used only before discovery has run (e.g. content
 * created offline). Every other type resolves via discovered `WpConnection.contentTypes`, and an
 * unknown type falls back to its own slug — so nothing plugin-specific is hardcoded here.
 */
const DEFAULT_POST_TYPE_ROUTE: Record<string, string> = {
  post: 'posts',
  page: 'pages',
};

/** The importer's field set for a content item (the type's own taxonomy field is appended per call).
 *  `modified_gmt` powers timezone-immune conflict detection. */
const CONTENT_FIELDS = [
  'id',
  'link',
  'slug',
  'status',
  'modified',
  'modified_gmt',
  'title',
  'content',
  'meta',
  'yoast_head_json',
];

/** Raw WP post as pulled during import — only the fields the Silo importer reads. */
export interface WpRawPost {
  id: number;
  link: string;
  slug: string;
  modified: string;
  /** UTC modified time — preferred for conflict detection (timezone/DST-immune). */
  modified_gmt?: string;
  /** WP's own post status (draft/publish/…). Captured on import into ContentItem.wpStatus. */
  status?: string;
  /** Omitted by WP when the type lacks `title`/`editor` support, even if requested in `_fields`. */
  title?: { rendered: string };
  content?: { rendered: string };
  categories?: number[];
  tags?: number[];
  /** Term ids in this post's OWN hierarchical taxonomy (post→categories, product→product_cat, …),
   *  normalized by listContentType so the importer needn't know the per-type field name. */
  termIds?: number[];
  /** Registered meta — carries rank_math_* only when the site exposes it via show_in_rest. */
  meta?: Record<string, unknown>;
  /** Yoast SEO's REST payload, present on every post when Yoast is active — a provider-agnostic way to
   *  read the effective SEO title/description without any of our plugins. (Focus keyword is not here.) */
  yoast_head_json?: { title?: string; description?: string } | null;
}

/** One hierarchical taxonomy term, as needed to mirror a WP category tree into Silo nodes. */
export interface WpTerm {
  id: number;
  name: string;
  slug: string;
  /** Parent term id (0 = top level). */
  parent: number;
  /** Front-end archive permalink (present on single-term fetch) — used for the "compare on WP" link. */
  link?: string;
}

/** One post's SEO meta as returned by the PufferGo `/seo-meta` read route. */
export interface SeoMetaItem {
  id: number;
  title: string;
  description: string;
  /** Comma-joined focus keywords (1 core + long-tails), matching the plugin's storage. */
  focusKeyword: string;
}

// ---------------------------------------------------------------------------
// The abilities surface (puffergo/* through core's /wp-abilities/v1 REST route)
// ---------------------------------------------------------------------------

/** One body block as the abilities take and give it: prose Markdown, a static Tailwind section's HTML,
 *  a config component's data, or a native editor block kept as read. */
export type AbilityBlock =
  | { type: 'prose'; markdown: string }
  | { type: 'static'; html: string; scopeId?: string }
  | { type: 'config'; component: string; data: Record<string, unknown> }
  | { type: 'native'; raw: string }
  | { type: 'image'; image: Record<string, unknown> }
  | { type: 'video'; url?: string; mediaId?: number };

/** One block as `get-blocks` describes it. With `full: true` a prose block also carries its whole
 *  `markdown`, a static block its whole `html`, a config block its `component`+`data` and a native
 *  block its `raw` — one read of a post's complete body. */
export interface DescribedBlock {
  path: string;
  name?: string;
  kind: 'prose' | 'static' | 'config' | 'native' | 'image' | 'video';
  scopeId?: string;
  /** The first 160 characters of the block's text — always present, full or not. */
  text?: string;
  markdown?: string;
  html?: string;
  component?: string;
  data?: Record<string, unknown>;
  raw?: string;
  innerBlocks?: DescribedBlock[];
}

/** A post's SEO state as the abilities report it (read) and accept it (write). */
export interface AbilitySeo {
  slug: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  focusKeyword: string | null;
  keywords: string[];
  featuredImage: { id: number; url: string } | null;
  score: number | null;
  /** The active SEO plugin ('rank-math' | 'yoast'), or null when the site has none. */
  plugin: string | null;
  limits?: SeoLimits;
  /** Advice, never errors: what's missing or out of range (missing_seo, keyword_missing, too_long…). */
  checks?: Array<{ code: string; where?: string; message?: string }>;
}

/** What every ability that touches one post returns: the post's identity + the concurrency token the
 *  next write must carry. `permalink` is the canonical address even for a draft (no preview nonce —
 *  safe to store and to resolve internal links against); `link` is what a human can open right now. */
export interface AbilityPost {
  id: number;
  type: string;
  title: string;
  slug?: string;
  status: string;
  aiCreated?: boolean;
  baseModified: string;
  link: string;
  permalink: string;
  editUrl?: string;
  /** Category slugs it is filed under; absent for a type filed nowhere (a page). */
  categories?: string[] | null;
  /** Count of body blocks (create-post / update-body results). */
  blocks?: number;
  seo?: AbilitySeo;
}

/** The full get-blocks read of one post (`blocks` widened from the count create/update return). */
export interface AbilityBlocks extends Omit<AbilityPost, 'blocks'> {
  blocks: DescribedBlock[];
  /** Set when the post was NOT made of blocks we own (a classic-editor or page-builder post). */
  editor?: string;
  editorNote?: string;
}

/** One content type as `list-post-types` reports it, with its whole category tree (ids AND slugs, so a
 *  ledger that stores term ids can push the slugs the abilities want without another round-trip). */
export interface AbilityPostType {
  type: string;
  label: string;
  singular?: string;
  canCreate: boolean;
  layout: 'fullWidth' | 'inTemplate';
  taxonomy: {
    slug: string;
    label: string;
    restBase: string;
    categories: Array<{ id: number; name: string; slug: string; parent: string }>;
  } | null;
}

/** The SEO fields a create-post / update-seo call may carry (all optional; the plugin reports what's
 *  missing as advice in `seo.checks` instead of refusing). */
export interface AbilitySeoInput {
  slug?: string;
  seoTitle?: string;
  seoDescription?: string;
  /** Core keyword first… */
  focusKeyword?: string;
  /** …then the long-tail ones. */
  keywords?: string[];
  featuredImage?: number;
  /** Category SLUGS the post is filed under (the ability refuses a slug the site doesn't have). */
  categories?: string[];
}

/** Abilities that core serves over GET (their `annotations.readonly`); everything else is a POST. */
const READONLY_ABILITIES = new Set(['list-post-types', 'find-posts', 'get-blocks']);

export class WpClient {
  private readonly base: string;
  private readonly abilityBase: string;
  private readonly authHeader: string;
  /** type slug → discovered info (rest_base + hierarchical taxonomy rest_base). */
  private readonly typeInfo: Map<string, ContentTypeInfo>;
  /** `${taxonomy}:${termId}` → slug, so a ledger of term ids can push the slugs abilities want
   *  without re-fetching a term per item. Per-client: one client lives for one push/import run. */
  private readonly termSlugCache = new Map<string, string>();

  constructor(
    private readonly net: NetworkPort,
    conn: WpConnection,
  ) {
    const site = conn.siteUrl.replace(/\/$/, '');
    this.base = `${site}/wp-json`;
    this.abilityBase = `${this.base}/wp-abilities/v1/abilities/puffergo`;
    // btoa exists in the extension service worker and in Obsidian's Electron renderer.
    this.authHeader = `Basic ${btoa(`${conn.username}:${conn.appPassword}`)}`;
    this.typeInfo = new Map((conn.contentTypes ?? []).map(t => [t.type, t]));
  }

  /** Resolve the REST base for a post type: discovered info wins; else the WP-core default for
   *  post/page; else the type slug itself (a reasonable guess for a not-yet-discovered CPT). */
  private routeFor(postType: PostType): string {
    return this.typeInfo.get(postType)?.restBase ?? DEFAULT_POST_TYPE_ROUTE[postType] ?? postType;
  }

  /** Human-readable label for a type (from discovery), falling back to the slug. Used to name the
   *  type-root node (博客/产品/解决方案…) when building the taxonomy backbone on import. */
  typeLabel(postType: PostType): string {
    return this.typeInfo.get(postType)?.label || postType;
  }

  /** REST base of the type's hierarchical taxonomy (the category-equivalent), or undefined if none. */
  taxRestBaseFor(postType: PostType): string | undefined {
    return this.typeInfo.get(postType)?.taxonomyRestBase;
  }

  private async call<T>(req: Omit<HttpRequest, 'headers'> & { headers?: Record<string, string> }): Promise<T> {
    const res = await this.net.request({
      ...req,
      url: `${this.base}${req.url}`,
      headers: { 'Content-Type': 'application/json', Authorization: this.authHeader, ...req.headers },
    });
    const body = res.json as (T & { code?: string; message?: string }) | undefined;
    if (res.status < 200 || res.status >= 300) {
      throw new WpHttpError(res.status, body?.code ?? 'wp_error', body?.message ?? `HTTP ${res.status}`, body);
    }
    return body as T;
  }

  // -------------------------------------------------------------------------
  // Abilities: the plugin's content surface (WordPress ≥ 6.9 + the PufferGo plugin)
  // -------------------------------------------------------------------------

  /**
   * Run one `puffergo/<name>` ability through core's `/wp-abilities/v1` REST route. Readonly abilities
   * go over GET with each input field as `input[field]=value` (core reads the raw query param, no JSON
   * decoding); writes go over POST with `{input}` as the JSON body. A non-2xx becomes a `WpHttpError`
   * carrying the plugin's own `{code, message, data:{status, fix, errors, baseModified}}`, so callers
   * can branch on `code` ('conflict', 'no_seo_plugin', 'prose_unsupported', …) and `isAuthError` keeps
   * working exactly as on the /wp/v2 surface.
   */
  async runAbility<T>(name: string, input: object = {}): Promise<T> {
    let req: Omit<HttpRequest, 'headers'>;
    if (READONLY_ABILITIES.has(name)) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(input)) {
        if (v !== undefined && v !== '' && v !== false) q.set(`input[${k}]`, String(v));
      }
      const qs = q.toString();
      req = { method: 'GET', url: `/wp-abilities/v1/abilities/puffergo/${name}/run${qs ? `?${qs}` : ''}` };
    } else {
      req = { method: 'POST', url: `/wp-abilities/v1/abilities/puffergo/${name}/run`, body: { input } };
    }
    const res = await this.call<T>(req);
    // `call` only rejects on a non-2xx, so a 200 with no body (proxy, misrouted route, a plugin build
    // that answers nothing) would otherwise pass as a successful write. Callers read `id` /
    // `baseModified` off it and persist them — an empty body would silently wipe the item's identity.
    if (res == null)
      throw new WpHttpError(200, 'empty_response', `ability ${name} returned an empty response`, undefined);
    return res;
  }

  /** The site's editable content types with each one's full category tree (id/name/slug/parent). */
  listPostTypes(): Promise<{ items: AbilityPostType[] }> {
    return this.runAbility('list-post-types');
  }

  /** Find posts by type/status/search/url, newest-modified first, 50 a page. */
  findPosts(
    params: {
      type?: string;
      status?: string;
      search?: string;
      url?: string;
      page?: number;
    } = {},
  ): Promise<{ items: AbilityPost[]; total: number; pages: number }> {
    return this.runAbility('find-posts', params);
  }

  /** One post's blocks + SEO + concurrency token. `full: true` makes every block carry its whole
   *  content (prose → `markdown`, static → `html`, …) — one read of the complete body. */
  getBlocks(id: number, opts: { path?: string; full?: boolean } = {}): Promise<AbilityBlocks> {
    return this.runAbility('get-blocks', {
      id,
      ...(opts.path ? { path: opts.path } : {}),
      ...(opts.full ? { full: true } : {}),
    });
  }

  /** Create a draft. `blocks` may be empty — a body-less shell a later `updateBody` fills in. SEO
   *  fields are optional; what's missing comes back as advice in `seo.checks`. */
  createPost(
    input: { type: string; title: string; excerpt?: string; blocks?: AbilityBlock[] } & AbilitySeoInput,
  ): Promise<AbilityPost> {
    return this.runAbility('create-post', input);
  }

  /** Replace the post's WHOLE body with these blocks; title/slug/SEO/categories untouched. Refused
   *  when the post changed since `baseModified` (409 'conflict') or isn't block content (400). */
  updateBody(input: { id: number; baseModified: string; blocks: AbilityBlock[] }): Promise<AbilityPost> {
    return this.runAbility('update-body', input);
  }

  /** Change title/slug/SEO/categories/featured image. Same 409 'conflict' guard; a published post's
   *  slug (and, where permalinks carry it, its category) is locked ('slug_locked' / 'category_locked'). */
  updateSeo(input: { id: number; baseModified: string; title?: string } & AbilitySeoInput): Promise<AbilityPost> {
    return this.runAbility('update-seo', input);
  }

  /** Publish a draft (not products). Same guards as the other writes. */
  publishPost(input: { id: number; baseModified: string }): Promise<AbilityPost> {
    return this.runAbility('publish-post', input);
  }

  /** A term's slug by id (cached per client) — the bridge from the ledger's term ids to the slugs the
   *  abilities' `categories` field wants. Null when the term no longer exists on the site. */
  async termSlug(taxRestBase: string, termId: number): Promise<string | null> {
    const key = `${taxRestBase}:${termId}`;
    const hit = this.termSlugCache.get(key);
    if (hit !== undefined) return hit || null;
    const term = await this.fetchTerm(taxRestBase, termId);
    this.termSlugCache.set(key, term?.slug ?? '');
    return term?.slug ?? null;
  }

  /**
   * Discover the site's public content types and each one's hierarchical taxonomy, from `/wp/v2/types`
   * + `/wp/v2/taxonomies`. Fully data-driven: works for WP core, WooCommerce, PufferGo CPTs, or any
   * plugin's types with zero hardcoded slugs. WP-internal types (attachments, blocks, templates, …)
   * are filtered out. Types with no REST base are skipped.
   */
  async discoverContentTypes(): Promise<ContentTypeInfo[]> {
    const [typesRaw, taxesRaw] = await Promise.all([
      this.call<Record<string, { slug?: string; name?: string; rest_base?: string; taxonomies?: string[] }>>({
        method: 'GET',
        url: '/wp/v2/types',
      }),
      this.call<Record<string, { rest_base?: string; hierarchical?: boolean }>>({
        method: 'GET',
        url: '/wp/v2/taxonomies',
      }),
    ]);
    // Defensive: a malformed/empty response must not throw — degrade to no discovery instead.
    const types = typesRaw && typeof typesRaw === 'object' ? typesRaw : {};
    const taxes = taxesRaw && typeof taxesRaw === 'object' ? taxesRaw : {};
    const BLOCK = new Set([
      'attachment',
      'nav_menu_item',
      'wp_block',
      'wp_template',
      'wp_template_part',
      'wp_navigation',
      'wp_font_family',
      'wp_font_face',
      'wp_global_styles',
      'oembed_cache',
      'user_request',
      'custom_css',
      'customize_changeset',
    ]);
    // A hierarchical taxonomy whose slug looks like a "category" (vs e.g. WooCommerce's hierarchical
    // `product_brand`) is the silo's category-equivalent. Prefer it; else fall back to the first
    // hierarchical taxonomy (covers e.g. puffergo_testimonial_industry, which is the only one).
    const CAT_LIKE = /(^category$|_cat$|_category$|categories$)/i;
    const out: ContentTypeInfo[] = [];
    for (const [slug, t] of Object.entries(types)) {
      if (!t.rest_base || BLOCK.has(slug)) continue;
      const hier = (t.taxonomies ?? [])
        .map(s => (taxes[s]?.hierarchical && taxes[s]?.rest_base ? { slug: s, restBase: taxes[s].rest_base! } : null))
        .filter((x): x is { slug: string; restBase: string } => x != null);
      const taxonomyRestBase = (hier.find(x => CAT_LIKE.test(x.slug)) ?? hier[0])?.restBase;
      // WP's REST type list exposes no `viewable`/`public` flag, so we can't ask "is this user-facing
      // content?" directly. The robust signal: real content types are organized by a hierarchical
      // taxonomy (post→category, product→product_cat, docs→docs_category, …), while builder/utility
      // CPTs (kadence_*, woo_email, kb_icon, rm_content_editor, …) have none. Keep post/page always
      // (WP core content, page has no taxonomy), plus any type that has a hierarchical taxonomy.
      if (slug !== 'post' && slug !== 'page' && !taxonomyRestBase) continue;
      out.push({ type: slug, restBase: t.rest_base, label: t.name || slug, taxonomyRestBase });
    }
    return out;
  }

  /**
   * Upload a binary asset to the WP media library (POST /wp/v2/media) and return its id + public URL.
   * The body is raw bytes; the NetworkPort adapter must pass a Uint8Array through untouched (not JSON).
   * `Content-Disposition` names the file so WP keeps the extension/slug.
   */
  async uploadMedia(bytes: Uint8Array, filename: string, mimeType: string): Promise<{ id: number; url: string }> {
    const res = await this.call<{ id: number; source_url: string }>({
      method: 'POST',
      url: '/wp/v2/media',
      headers: { 'Content-Type': mimeType, 'Content-Disposition': `attachment; filename="${filename}"` },
      body: bytes,
    });
    return { id: res.id, url: res.source_url };
  }

  /**
   * Make sure a WordPress.org plugin is installed and active (needs `activate_plugins` +
   * `install_plugins`). Goes through the host's NetworkPort like every other call here, so it works in
   * hosts where a plain browser fetch would be blocked by CORS (Obsidian).
   */
  async ensurePluginActive(slug: string): Promise<{ action: 'already_active' | 'activated' | 'installed' }> {
    const plugins = await this.call<Array<{ plugin?: string; textdomain?: string; status?: string }>>({
      method: 'GET',
      url: '/wp/v2/plugins?_fields=plugin,textdomain,status',
    });
    // Match on textdomain (usual case) or the plugin file's folder (`puffergo/...`).
    const existing = plugins.find(
      p => p.textdomain === slug || p.plugin === slug || (p.plugin ?? '').startsWith(`${slug}/`),
    );
    if (existing?.plugin) {
      if (existing.status === 'active') return { action: 'already_active' };
      // The plugin id carries a slash (folder/file): encode each segment, keep the separator.
      const id = existing.plugin.split('/').map(encodeURIComponent).join('/');
      await this.call({ method: 'POST', url: `/wp/v2/plugins/${id}`, body: { status: 'active' } });
      return { action: 'activated' };
    }
    await this.call({ method: 'POST', url: '/wp/v2/plugins', body: { slug, status: 'active' } });
    return { action: 'installed' };
  }

  /** True if the Application Password authenticates. Uses GET /wp/v2/users/me. */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.call({ method: 'GET', url: '/wp/v2/users/me?_fields=id' });
      return true;
    } catch {
      return false;
    }
  }

  /** Fetch ONE content item's importer fields (for single-item refresh from the cloud). Returns null
   *  when the post is gone (404). Normalizes the per-type taxonomy field into `termIds` like the list. */
  async fetchContentItem(postType: PostType, id: number): Promise<WpRawPost | null> {
    const route = this.routeFor(postType);
    const tax = this.taxRestBaseFor(postType);
    const fields = [...CONTENT_FIELDS];
    if (tax) fields.push(tax);
    const res = await this.net.request({
      method: 'GET',
      url: `${this.base}/wp/v2/${route}/${id}?_fields=${fields.join(',')}`,
      headers: { 'Content-Type': 'application/json', Authorization: this.authHeader },
    });
    if (res.status === 404) return null;
    if (res.status < 200 || res.status >= 300) {
      const body = res.json as { code?: string; message?: string } | undefined;
      throw new WpHttpError(res.status, body?.code ?? 'wp_error', body?.message ?? `HTTP ${res.status}`, body);
    }
    const row = res.json as (WpRawPost & Record<string, unknown>) | undefined;
    if (!row) return null;
    const raw = tax ? row[tax] : undefined;
    const termIds = Array.isArray(raw) ? raw.filter((n): n is number => typeof n === 'number') : [];
    return { ...row, termIds };
  }

  /**
   * Fetch a single post's RENDERED body HTML on demand — for PREVIEW only. The extension never stores
   * bodies; this pulls the current WP content when the user opens a preview, to be held in memory and
   * discarded. Returns '' when the post has no content.
   */
  async fetchRendered(postType: PostType, id: number): Promise<string> {
    const res = await this.call<{ content?: { rendered?: string } }>({
      method: 'GET',
      url: `/wp/v2/${this.routeFor(postType)}/${id}?_fields=content`,
    });
    return res.content?.rendered ?? '';
  }

  /**
   * Fetch the FULL themed front-end page HTML at a permalink — for PREVIEW only. Unlike `fetchRendered`
   * (just the post body), this returns the whole `<html>` document including header/footer and the
   * theme's `<link>` stylesheets, so a srcdoc iframe preview looks like the real site. Sent WITHOUT the
   * Basic-auth header (it's a public page), so it only works for published content; drafts have no
   * public permalink — callers should fall back to `fetchRendered`. Returns '' on a non-2xx.
   */
  async fetchRenderedPage(link: string): Promise<string> {
    const res = await this.net.request({ method: 'GET', url: link });
    if (res.status < 200 || res.status >= 300) return '';
    return res.text ?? '';
  }

  /**
   * HTTP status of a front-end URL, for telling a genuinely broken internal link (404) apart from one
   * that merely points at content this import didn't pull. Unauthenticated on purpose — we want what a
   * crawler would see, not what an admin can reach. Returns 0 when the request itself failed (offline,
   * DNS, CORS), which callers must treat as "unknown", never as broken.
   */
  async probeUrlStatus(url: string): Promise<number> {
    try {
      const res = await this.net.request({ method: 'GET', url });
      return res.status;
    } catch {
      return 0;
    }
  }

  /**
   * Write a taxonomy TERM's archive-page SEO (title / description / focus keywords) through the
   * PufferGo plugin's own route — abilities address posts only, so a category archive keeps this path.
   * Post SEO travels inside `updateSeo` (the ability) instead. Blank fields are left out; nothing is
   * sent when all are blank. Requires the PufferGo plugin; a site without it (or without any SEO
   * plugin) fails with the site's own error — there is no second write path.
   */
  async writeTermSeo(termId: number, seo: Seo): Promise<void> {
    const title = seo.title.trim();
    const description = seo.description.trim();
    const keywords = focusKeywords(seo);
    if (!title && !description && !keywords.length) return;

    await this.call({
      method: 'POST',
      url: '/puffergo/v1/seo-meta',
      body: {
        objectType: 'term',
        id: termId,
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(keywords.length ? { keywords } : {}),
      },
    });
  }

  /** The SEO limits the site's PufferGo plugin publishes, or null without the plugin. */
  async fetchSeoLimits(): Promise<SeoLimits | null> {
    const res = await this.net.request({
      method: 'GET',
      url: `${this.base}/puffergo/v1/seo-limits`,
      headers: { 'Content-Type': 'application/json', Authorization: this.authHeader },
    });
    const body = res.json as { limits?: SeoLimits } | undefined;
    return res.status >= 200 && res.status < 300 && body?.limits ? body.limits : null;
  }

  /**
   * Pull existing content of one abstract type from WordPress, one page at a time. Returns the raw
   * posts plus the total page count (from the `X-WP-TotalPages` header) so the caller can loop.
   * Reads the minimal field set the importer needs (notably `content.rendered`, which carries the
   * links we parse back out). `status=any` so drafts already in WP are included.
   */
  async listContentType(
    postType: PostType,
    page = 1,
    perPage = 50,
  ): Promise<{ posts: WpRawPost[]; totalPages: number }> {
    const route = this.routeFor(postType);
    // The type's own taxonomy terms live under a field named after its rest_base (e.g. 'product_cat'),
    // not the fixed 'categories'. Request it dynamically so we can build the per-type backbone.
    const tax = this.taxRestBaseFor(postType);
    const fieldList = [...CONTENT_FIELDS];
    if (tax) fieldList.push(tax);
    const res = await this.net.request({
      method: 'GET',
      url: `${this.base}/wp/v2/${route}?status=any&per_page=${perPage}&page=${page}&_fields=${fieldList.join(',')}`,
      headers: { 'Content-Type': 'application/json', Authorization: this.authHeader },
    });
    if (res.status < 200 || res.status >= 300) {
      const body = res.json as { code?: string; message?: string } | undefined;
      throw new WpHttpError(res.status, body?.code ?? 'wp_error', body?.message ?? `HTTP ${res.status}`, body);
    }
    const totalPages = Number(res.headers?.['x-wp-totalpages'] ?? res.headers?.['X-WP-TotalPages'] ?? 1) || 1;
    const rows = (res.json as Array<WpRawPost & Record<string, unknown>>) ?? [];
    // Normalize the per-type taxonomy field into `termIds`, so the importer stays taxonomy-agnostic.
    const posts = rows.map(row => {
      const raw = tax ? row[tax] : undefined;
      const termIds = Array.isArray(raw) ? raw.filter((n): n is number => typeof n === 'number') : [];
      return { ...row, termIds } as WpRawPost;
    });
    return { posts, totalPages };
  }

  /**
   * Batch-read SEO meta (title / description / focusKeyword) for the given post ids via the PufferGo
   * plugin's read-only route `/puffergo/v1/seo-meta`. This is the ONLY way to read Rank Math meta back
   * (core `/wp/v2` never exposes it). Returns `null` when the route isn't there — i.e. the PufferGo
   * plugin isn't installed/active — so the caller can degrade gracefully and prompt installation.
   * Probed lazily each import (never cached), so installing the plugin later "just works" next import.
   */
  async fetchSeoMeta(ids: number[]): Promise<{ provider: string; items: SeoMetaItem[]; limits?: SeoLimits } | null> {
    if (!ids.length) return { provider: 'none', items: [] };
    const include = Array.from(new Set(ids)).join(',');
    const res = await this.net.request({
      method: 'GET',
      url: `${this.base}/puffergo/v1/seo-meta?include=${include}`,
      headers: { 'Content-Type': 'application/json', Authorization: this.authHeader },
    });
    // 404 / rest_no_route → plugin absent. Distinguish from a real auth/permission error.
    if (res.status === 404) return null;
    const body = res.json as { code?: string; provider?: string; items?: SeoMetaItem[] } | undefined;
    if (body?.code === 'rest_no_route') return null;
    if (res.status < 200 || res.status >= 300) {
      throw new WpHttpError(
        res.status,
        body?.code ?? 'wp_error',
        (body as { message?: string })?.message ?? `HTTP ${res.status}`,
        body,
      );
    }
    return { provider: body?.provider ?? 'none', items: body?.items ?? [] };
  }

  /** Pull ALL content of one abstract type, following pagination. */
  async listAllContentType(postType: PostType, perPage = 50): Promise<WpRawPost[]> {
    const first = await this.listContentType(postType, 1, perPage);
    const all = [...first.posts];
    for (let page = 2; page <= first.totalPages; page++) {
      const next = await this.listContentType(postType, page, perPage);
      all.push(...next.posts);
    }
    return all;
  }

  /**
   * Resolve a keyword-hierarchy path to terms in ANY hierarchical taxonomy, creating missing terms
   * (with the correct parent) so the keyword tree mirrors the taxonomy tree. Returns the leaf
   * `{id, slug}` — both, because the ledger stores ids while the abilities' `categories` field takes
   * slugs. `taxRestBase` is the taxonomy's REST base ('categories', 'product_cat', …).
   */
  async ensureTermPath(
    taxRestBase: string,
    terms: string[],
    startParent = 0,
  ): Promise<{ id: number; slug: string } | null> {
    let parent = startParent;
    let leaf: { id: number; slug: string } | null = null;
    for (const term of terms) {
      const name = term.trim();
      if (!name) continue;
      // `search` is a substring match, so a page of 100 can be full of near-misses. Paging until an
      // exact name turns up (or the pages run out) is what keeps a deep taxonomy from silently FORKING:
      // a missed match would create a second term of the same name, whose slug becomes `name-2`, and the
      // post would be filed under that empty twin instead of the real category.
      const want = name.toLowerCase();
      let match: { id: number; slug: string } | undefined;
      for (let page = 1; ; page++) {
        let rows: Array<{ id: number; name: string; slug: string }>;
        try {
          rows = await this.call<Array<{ id: number; name: string; slug: string }>>({
            method: 'GET',
            url: `/wp/v2/${taxRestBase}?per_page=100&page=${page}&parent=${parent}&search=${encodeURIComponent(name)}&_fields=id,name,slug`,
          });
        } catch (e) {
          // WP answers 400 past the last page (rest_post_invalid_page_number) — the end-of-pages signal,
          // and what an empty taxonomy answers on page 1. Anything else is a real failure.
          if (e instanceof WpHttpError && e.status === 400) break;
          throw e;
        }
        // Only an exact name is the same category: "SEO" must not match "SEO 技巧" (case-insensitive;
        // WP returns names HTML-escaped).
        const hit = rows.find(t => decodeTermName(t.name).trim().toLowerCase() === want);
        if (hit) {
          match = { id: hit.id, slug: hit.slug };
          break;
        }
        if (rows.length < 100) break;
      }
      if (match) {
        leaf = match;
      } else {
        const created = await this.call<{ id: number; slug: string }>({
          method: 'POST',
          url: `/wp/v2/${taxRestBase}`,
          body: { name, parent },
        });
        leaf = { id: created.id, slug: created.slug };
      }
      this.termSlugCache.set(`${taxRestBase}:${leaf.id}`, leaf.slug);
      parent = leaf.id;
    }
    return leaf;
  }

  /** Fetch ONE taxonomy term (name/slug/parent + front-end archive `link`) for a single-category
   *  refresh. Returns null when the term no longer exists on WP (404). */
  async fetchTerm(taxRestBase: string, id: number): Promise<WpTerm | null> {
    const res = await this.net.request({
      method: 'GET',
      url: `${this.base}/wp/v2/${taxRestBase}/${id}?_fields=id,name,slug,parent,link`,
      headers: { 'Content-Type': 'application/json', Authorization: this.authHeader },
    });
    if (res.status === 404) return null;
    if (res.status < 200 || res.status >= 300) {
      const body = res.json as { code?: string; message?: string } | undefined;
      throw new WpHttpError(res.status, body?.code ?? 'wp_error', body?.message ?? `HTTP ${res.status}`, body);
    }
    return (res.json as WpTerm) ?? null;
  }

  /**
   * Pull ALL terms of a hierarchical taxonomy (id/name/slug/parent), following pagination — the raw
   * material for mirroring a WP category tree into Silo nodes on import. Empty taxonomies return [].
   */
  async listAllTerms(taxRestBase: string, perPage = 100): Promise<WpTerm[]> {
    const out: WpTerm[] = [];
    for (let page = 1; ; page++) {
      const res = await this.net.request({
        method: 'GET',
        // `link` is the term's front-end archive URL — needed to resolve menu/body links that point at
        // a category archive rather than a post. Without it those links can't be matched to anything.
        url: `${this.base}/wp/v2/${taxRestBase}?per_page=${perPage}&page=${page}&_fields=id,name,slug,parent,link`,
        headers: { 'Content-Type': 'application/json', Authorization: this.authHeader },
      });
      // WP answers 400 past the last page (rest_post_invalid_page_number) — the normal end-of-pages
      // signal, and also what an empty taxonomy answers on page 1. Anything else on page ONE is a real
      // failure: 401/403 means revoked or wrong credentials, and swallowing it would import the whole
      // site with an EMPTY category tree while reporting success (and `isAuthError` would never fire).
      if (res.status < 200 || res.status >= 300) {
        if (page === 1 && (res.status === 401 || res.status === 403)) {
          const body = res.json as { code?: string; message?: string } | undefined;
          throw new WpHttpError(res.status, body?.code ?? 'wp_error', body?.message ?? `HTTP ${res.status}`, body);
        }
        break;
      }
      const rows = (res.json as WpTerm[]) ?? [];
      out.push(...rows);
      const totalPages = Number(res.headers?.['x-wp-totalpages'] ?? res.headers?.['X-WP-TotalPages'] ?? 1) || 1;
      if (page >= totalPages || rows.length === 0) break;
    }
    return out;
  }
}
