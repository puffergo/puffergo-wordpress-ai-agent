/**
 * WpClient — framework-agnostic WordPress REST client over a NetworkPort. Encodes the wiring we
 * VERIFIED against a real Rank Math site, notably that Rank Math SEO fields must be
 * written via `POST /rankmath/v1/updateMeta` and are silently dropped if passed in the `/wp/v2` meta
 * object. See reference: WP REST 写 SEO 正确姿势.
 *
 * Mirrors the auth approach of the extension's existing `WordPressApiClient` (Basic auth from an
 * Application Password) but decoupled from `fetch` so it also runs inside Obsidian.
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

export interface PushResult {
  /** WP post id (new or existing). */
  id: number;
  /** WP `modified_gmt` (UTC) after the write — captured for conflict detection (timezone-immune). */
  modifiedGmt: string;
  /** WP's own post status after the write (draft/publish/…). */
  status?: string;
  /** WP permalink after the write — surfaced so a synced note can link straight to the post. */
  link?: string;
}

/** Options for {@link WpClient.upsertPost}. All optional — omitting `content` pushes a body-less shell
 *  (create) or a metadata-only update that PRESERVES whatever body already lives on WP. */
export interface UpsertPostOptions {
  /** Rendered HTML body. OMIT it in the extension (bodies live in WP/Obsidian, never here); a future
   *  Obsidian host passes the note's HTML here to author the body through the same primitive. */
  content?: string;
  /** Resolved hierarchical taxonomy term ids to assign (the silo path). */
  termIds?: number[];
  /** REST base of the taxonomy `termIds` belong to (e.g. 'categories', 'product_cat'); it is the WP
   *  request field name for term assignment. Required for `termIds` to be applied. */
  taxonomyRestBase?: string;
  /** Parent page id (page type only) — maps the Silo hierarchy onto WP's page tree. */
  parentId?: number;
}

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

export class WpClient {
  private readonly base: string;
  private readonly authHeader: string;
  /** type slug → discovered info (rest_base + hierarchical taxonomy rest_base). */
  private readonly typeInfo: Map<string, ContentTypeInfo>;

  constructor(
    private readonly net: NetworkPort,
    conn: WpConnection,
  ) {
    this.base = `${conn.siteUrl.replace(/\/$/, '')}/wp-json`;
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

  /** Live WP `modified_gmt` (UTC) + `status` for a post — the pre-push signal used both for conflict
   *  detection (modifiedGmt compared for inequality against the value captured at last sync) and for
   *  warning before overwriting an already-published post. `modifiedGmt` falls back to `modified` on the
   *  rare site that omits it. */
  async fetchRemoteState(postType: PostType, id: number): Promise<{ modifiedGmt: string | null; status?: string }> {
    const route = this.routeFor(postType);
    const res = await this.call<{ modified?: string; modified_gmt?: string; status?: string }>({
      method: 'GET',
      url: `/wp/v2/${route}/${id}?_fields=modified,modified_gmt,status`,
    });
    return { modifiedGmt: res.modified_gmt ?? res.modified ?? null, status: res.status };
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
   * Create or update a post/page, pushing title/slug/hierarchy (and SEO is written separately). When
   * `item.wpPostId` is set it updates in place; otherwise it CREATES a new draft.
   *
   * Body policy: `content` is only sent when explicitly provided. The extension always omits it, so a
   * create yields an EMPTY draft shell (body authored later in Obsidian/WP) and an update NEVER touches
   * the body already on WP. `status:'draft'` is only set on CREATE — an update must not silently revert
   * a live post back to draft. Returns id + modified + status.
   */
  async upsertPost(item: ContentItem, opts: UpsertPostOptions = {}): Promise<PushResult> {
    const route = this.routeFor(item.postType);
    const payload: Record<string, unknown> = { title: item.title };
    if (opts.content !== undefined) payload.content = opts.content;
    if (item.slug) payload.slug = item.slug;
    if (!item.wpPostId) payload.status = 'draft'; // CREATE only — never flip an existing post's status
    // Assign the silo path onto the type's hierarchical taxonomy (field name = its rest_base:
    // 'categories' for post, 'product_cat' for WooCommerce, 'puffergo_product_cat' for PufferGo, …).
    if (opts.taxonomyRestBase && opts.termIds && opts.termIds.length) payload[opts.taxonomyRestBase] = opts.termIds;
    if (opts.parentId) payload.parent = opts.parentId; // page hierarchy (unused today — pages pushed flat)

    const path = item.wpPostId ? `/wp/v2/${route}/${item.wpPostId}` : `/wp/v2/${route}`;
    const res = await this.call<{
      id: number;
      modified: string;
      modified_gmt?: string;
      status?: string;
      link?: string;
    }>({
      method: 'POST',
      url: path,
      body: payload,
    });
    return { id: res.id, modifiedGmt: res.modified_gmt ?? res.modified, status: res.status, link: res.link };
  }

  /** A post's stored body (`content.raw`, block markup included), '' when it has none. */
  async fetchRawContent(postType: PostType, id: number): Promise<string> {
    const res = await this.call<{ content?: { raw?: string } }>({
      method: 'GET',
      url: `/wp/v2/${this.routeFor(postType)}/${id}?context=edit&_fields=content`,
    });
    return res.content?.raw ?? '';
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
   * Write a post's (or a term archive's) SEO title, description and focus keywords. Blank fields are left
   * out; nothing is sent when all are blank. `objectType` is 'post' for any post/page/CPT entry and 'term'
   * for a taxonomy term's archive page.
   *
   * Goes through the PufferGo plugin (`POST /puffergo/v1/seo-meta`), which writes whichever SEO plugin the
   * site runs (Rank Math, Yoast). A site without the PufferGo plugin falls back to Rank Math's own
   * `POST /rankmath/v1/updateMeta` — the only route that persists Rank Math meta there.
   */
  async writeSeo(objectId: number, seo: Seo, objectType: 'post' | 'term' = 'post'): Promise<void> {
    const title = seo.title.trim();
    const description = seo.description.trim();
    const keywords = focusKeywords(seo);
    if (!title && !description && !keywords.length) return;

    const res = await this.net.request({
      method: 'POST',
      url: `${this.base}/puffergo/v1/seo-meta`,
      headers: { 'Content-Type': 'application/json', Authorization: this.authHeader },
      body: {
        objectType,
        id: objectId,
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(keywords.length ? { keywords } : {}),
      },
    });
    const body = res.json as { code?: string; message?: string } | undefined;
    if (res.status === 404 && body?.code === 'rest_no_route') {
      await this.writeRankMathMeta(objectId, { title, description, keywords: keywords.join(', ') }, objectType);
      return;
    }
    if (res.status < 200 || res.status >= 300) {
      throw new WpHttpError(res.status, body?.code ?? 'wp_error', body?.message ?? `HTTP ${res.status}`, body);
    }
  }

  /** Rank Math's own route, for sites without the PufferGo plugin. */
  private async writeRankMathMeta(
    objectId: number,
    seo: { title: string; description: string; keywords: string },
    objectType: 'post' | 'term',
  ): Promise<void> {
    const meta: Record<string, string> = {};
    if (seo.title) meta.rank_math_title = seo.title;
    if (seo.description) meta.rank_math_description = seo.description;
    if (seo.keywords) meta.rank_math_focus_keyword = seo.keywords;
    await this.call({
      method: 'POST',
      url: '/rankmath/v1/updateMeta',
      body: { objectID: objectId, objectType, meta },
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
   * Resolve a keyword-hierarchy path to term ids in ANY hierarchical taxonomy, creating missing terms
   * (with the correct parent) so the keyword tree mirrors the taxonomy tree. Returns the leaf term id
   * list suitable for assignment. `taxRestBase` is the taxonomy's REST base ('categories',
   * 'product_cat', 'puffergo_product_cat', …), so this works for post categories AND any CPT taxonomy.
   */
  async ensureTermPath(taxRestBase: string, terms: string[], startParent = 0): Promise<number[]> {
    let parent = startParent;
    let leafId = 0;
    for (const term of terms) {
      const name = term.trim();
      if (!name) continue;
      const existing = await this.call<Array<{ id: number; name: string }>>({
        method: 'GET',
        url: `/wp/v2/${taxRestBase}?per_page=100&parent=${parent}&search=${encodeURIComponent(name)}&_fields=id,name`,
      });
      // `search` is a substring match: "SEO" also returns "SEO 技巧". Only an exact name (case-insensitive,
      // WP returns names HTML-escaped) is the same category; anything else would file the post wrongly.
      const want = name.toLowerCase();
      const match = existing.find(t => decodeTermName(t.name).trim().toLowerCase() === want);
      if (match) {
        leafId = match.id;
      } else {
        const created = await this.call<{ id: number }>({
          method: 'POST',
          url: `/wp/v2/${taxRestBase}`,
          body: { name, parent },
        });
        leafId = created.id;
      }
      parent = leafId;
    }
    return leafId ? [leafId] : [];
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
      // A taxonomy with zero terms answers 400 (rest_post_invalid_page_number) past the last page; treat
      // any non-2xx as "no more terms" rather than aborting the whole import.
      if (res.status < 200 || res.status >= 300) break;
      const rows = (res.json as WpTerm[]) ?? [];
      out.push(...rows);
      const totalPages = Number(res.headers?.['x-wp-totalpages'] ?? res.headers?.['X-WP-TotalPages'] ?? 1) || 1;
      if (page >= totalPages || rows.length === 0) break;
    }
    return out;
  }
}
