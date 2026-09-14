/**
 * body-codec — the GLUE LAYER that translates a content's body between the vault/authoring form
 * (Markdown with Obsidian `[[wikilink]]` references) and the WordPress form (HTML with real `<a href>`
 * permalinks). Platform-agnostic and pure: the extension, the Obsidian plugin, the CLI and the web host
 * all push/pull bodies through the SAME codec, so link/asset handling stays identical everywhere.
 *
 * Two directions:
 *   • PUSH (up):  markdownToWpHtml — resolve `[[slug]]` to the target's live permalink, then Markdown→HTML.
 *   • PULL (down): wpHtmlToMarkdown — HTML→Markdown (via turndown), rewriting any `<a href>` the caller's
 *     resolver recognizes as an internal link back into `[[slug]]`. Which links are "internal" (import's
 *     own canonicalized/id-fallback-aware matching, not just a raw string match) is the caller's job —
 *     see `import-content.ts`'s own resolver built around `resolveInternalTarget`.
 *
 * ASSET handling (images) is centralized here too so it behaves identically on every platform: a local
 * image reference (`![alt](path)` or Obsidian `![[path]]`) is uploaded to WP media and rewritten to the
 * returned URL on push. The upload itself is platform-specific (read a file / a blob / a File) so it is
 * injected as an `AssetUploader` port; the extract/rewrite/orchestration around it is pure and lives here.
 */

import { marked } from 'marked';
import TurndownService from 'turndown';
import type { SiloWorkspace } from '../model/types';

const norm = (s: string): string => s.trim().toLowerCase();

/** Resolves internal-link references both ways. Built once from a workspace and reused for a whole
 *  push/pull run. slug↔permalink is the stable pair we round-trip on. */
export interface LinkResolver {
  /** A content's live WP permalink for its slug, or undefined if it has none yet (never pushed). */
  permalinkForSlug(slug: string): string | undefined;
  /** The vault slug for a WP permalink (inverse), or undefined if the URL isn't one of ours. */
  slugForUrl(url: string): string | undefined;
}

/**
 * Per-host uploader that turns a LOCAL asset reference (as written in the markdown) into a hosted URL.
 * The host implements the platform bit (read the file/blob + POST to WP media); the glue layer owns the
 * extract → upload → rewrite orchestration. Return null to leave a reference untouched (not found /
 * unsupported). Should be idempotent per ref (cache) so one image isn't uploaded twice in a run.
 */
export interface AssetUploader {
  upload(ref: string): Promise<string | null>;
}

/** A reference is "local" (needs uploading) unless it's already an absolute/protocol-relative URL or a data: URI. */
export const isLocalAssetRef = (ref: string): boolean =>
  !/^(https?:)?\/\//i.test(ref.trim()) && !/^data:/i.test(ref.trim());

// Standard markdown image: ![alt](path "optional title"). Groups: 1=`![`+alt+`](`, 2=path, 3=trailing.
const MD_IMAGE_RE = /(!\[[^\]]*\]\(\s*)([^)\s]+)((?:\s+"[^"]*")?\s*\))/g;
// Obsidian embed: ![[path#heading|alias]]. Group 1 = path.
const EMBED_IMAGE_RE = /!\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;

/** All DISTINCT local image references in a markdown body, in first-seen order. Pure. */
export function extractLocalImageRefs(md: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (ref: string): void => {
    const r = ref.trim();
    if (r && isLocalAssetRef(r) && !seen.has(r)) {
      seen.add(r);
      out.push(r);
    }
  };
  for (const m of md.matchAll(MD_IMAGE_RE)) add(m[2]);
  for (const m of md.matchAll(EMBED_IMAGE_RE)) add(m[1]);
  return out;
}

/** Rewrite each local image reference to its hosted URL (from `map`). Obsidian embeds become standard
 *  markdown images. References not in the map are left as-is. Pure. */
export function rewriteImageRefs(md: string, map: Map<string, string>): string {
  const mapped = (ref: string): string | undefined => map.get(ref.trim());
  return md
    .replace(MD_IMAGE_RE, (whole, pre: string, path: string, post: string) => {
      const url = mapped(path);
      return url ? `${pre}${url}${post}` : whole;
    })
    .replace(EMBED_IMAGE_RE, (whole, path: string) => {
      const url = mapped(path);
      return url ? `![](${url})` : whole;
    });
}

/**
 * Push-side asset pass: upload every local image via the injected uploader and rewrite the body to the
 * hosted URLs. Uploader is called once per distinct ref. Returns the rewritten markdown + how many refs
 * resolved to a hosted URL. No-op (and no uploader calls) when the body has no local images.
 */
export async function resolveBodyAssets(
  md: string,
  uploader: AssetUploader,
): Promise<{ md: string; uploaded: number }> {
  const refs = extractLocalImageRefs(md);
  if (!refs.length) return { md, uploaded: 0 };
  const map = new Map<string, string>();
  for (const ref of refs) {
    const url = await uploader.upload(ref);
    if (url) map.set(ref, url);
  }
  return { md: rewriteImageRefs(md, map), uploaded: map.size };
}

/**
 * Reduce an absolute permalink to a ROOT-RELATIVE path (`/foo/`, or `/?p=42` on plain permalinks).
 * Internal links are emitted this way so the body never hard-codes the domain — changing the site's
 * domain (or migrating envs) needs zero rewrites of in-content links. Falls back to the input if unparseable.
 */
export function rootRelativePermalink(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search + u.hash;
  } catch {
    return url;
  }
}

/** Derive a LinkResolver from the workspace (slug ↔ wpLink for every content that has both). */
export function buildLinkResolver(ws: SiloWorkspace): LinkResolver {
  const permalinkBySlug = new Map<string, string>();
  const slugByUrl = new Map<string, string>();
  for (const c of ws.contents) {
    if (c.slug && c.wpLink) {
      permalinkBySlug.set(norm(c.slug), c.wpLink);
      slugByUrl.set(c.wpLink, c.slug);
    }
  }
  return {
    permalinkForSlug: slug => permalinkBySlug.get(norm(slug)),
    slugForUrl: url => slugByUrl.get(url),
  };
}

// `[[target]]` or `[[target|alias]]` (optionally `[[target#heading|alias]]`). Target is a content slug.
const WIKILINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;

/**
 * PUSH transform: Markdown body (vault form) → WordPress HTML.
 * Each `[[slug]]` is rewritten to a real Markdown link `[text](permalink)` when the target has a
 * permalink, so WP receives a proper `<a href>`. Targets not yet pushed can't be linked this run — they
 * degrade to their plain anchor text and are reported in `unresolved` (the caller can re-push after the
 * target exists; the vault Markdown keeps the `[[slug]]`, so the next push links it). Returns '' for an
 * empty body (→ shell push, never overwrites the WP body).
 */
export function markdownToWpHtml(md: string, resolver: LinkResolver): { html: string; unresolved: string[] } {
  const trimmed = md.trim();
  if (!trimmed) return { html: '', unresolved: [] };

  const unresolved: string[] = [];
  const withLinks = trimmed.replace(WIKILINK_RE, (_m, rawTarget: string, alias?: string) => {
    const target = rawTarget.trim();
    const text = (alias ?? target).trim();
    const permalink = resolver.permalinkForSlug(target);
    if (!permalink) {
      unresolved.push(target);
      return text; // can't link yet — emit plain text, keep the wikilink in the source for next time
    }
    // Emit a root-relative href (no domain) so the body survives a domain change / env migration.
    return `[${text}](${rootRelativePermalink(permalink)})`;
  });

  const html = marked.parse(withLinks, { async: false }) as string;
  return { html, unresolved };
}

// One shared instance — turndown has no per-call state, and construction (registering GFM-ish defaults)
// isn't free. `bulletListMarker`/`headingStyle` match this codebase's own Markdown style (see the
// `renderFrontmatter` templates in `lib/vault/frontmatter.ts`) so a pull→edit→push round-trip doesn't
// visually reformat content the user never touched.
const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
// Turndown has no default rule for these, so it falls through to its generic "unwrap and keep the
// CONTENT" behavior — fine for a real wrapper `<div>`, actively wrong for `<script>`/`<style>`, whose
// content is raw JS/CSS, not text meant to be read. Verified against a live turndown instance: without
// this, `<style>.a{color:red}</style>` and `<script>alert(1)</script>` land in the Markdown body
// verbatim as plain text. `.remove()` drops the element (and its content) entirely.
turndown.remove(['script', 'style', 'noscript', 'template']);

/**
 * PULL transform: WordPress HTML (as returned by `content.rendered`) → vault Markdown.
 * Any `<a href>` `resolveInternalLink` recognizes is rewritten to `[[slug]]` (or `[[slug|anchor text]]`
 * when the link text differs from the slug) instead of a plain Markdown link, so the note round-trips
 * through a push exactly like one authored by hand. `resolveInternalLink` returning undefined (an
 * external link, or an internal one the caller couldn't resolve) leaves the link as plain `[text](url)`.
 */
export function wpHtmlToMarkdown(html: string, resolveInternalLink: (url: string) => string | undefined): string {
  const trimmed = html.trim();
  if (!trimmed) return '';

  // Rewrite internal hrefs to a private `wikilink:` scheme BEFORE handing off to turndown, so its own
  // link rule never sees a real URL for them — turndown has no href-rewrite hook, only a post-conversion
  // string is available to us, and doing it as a string replace on the OUTPUT risks corrupting anchor
  // text that legitimately contains parentheses. Doing it on the INPUT keeps turndown's own escaping of
  // the anchor text correct, and the marker is trivial to peel back off afterward.
  const withMarkedLinks = trimmed.replace(/(<a\s[^>]*href=["'])([^"']+)(["'][^>]*>)/gi, (whole, pre, href, post) => {
    const slug = resolveInternalLink(href);
    return slug ? `${pre}wikilink:${encodeURIComponent(slug)}${post}` : whole;
  });

  const md = turndown.turndown(withMarkedLinks);
  return md.replace(/\[([^\]]*)\]\(wikilink:([^)]+)\)/g, (_m, text: string, encodedSlug: string) => {
    const slug = decodeURIComponent(encodedSlug);
    return text && text !== slug ? `[[${slug}|${text}]]` : `[[${slug}]]`;
  });
}
