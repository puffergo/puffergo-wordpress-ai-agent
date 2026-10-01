/**
 * body-codec — the GLUE LAYER that translates a content's body between the vault/authoring form
 * (Markdown with Obsidian `[[wikilink]]` references) and the WordPress form. Platform-agnostic and
 * pure: the extension, the Obsidian plugin, the CLI and the web host all push/pull bodies through the
 * SAME codec, so link/asset handling stays identical everywhere.
 *
 * The WordPress side is MARKDOWN too — the PufferGo plugin owns the one Markdown→blocks compiler (see
 * `class-puffergo-prose-codec.php`) and hands prose back as Markdown on `get-blocks?full`. So this codec
 * never produces or parses HTML: it only resolves `[[wikilink]]`s to real links on the way up and back
 * on the way down. Both directions are pure string passes over Markdown.
 *
 *   • PUSH (up):   resolveWikilinks — rewrite each `[[target]]` to a real `[text](permalink)` Markdown
 *                  link (root-relative, so the body never hard-codes the domain). A target with no
 *                  permalink yet degrades to its plain text and is reported in `unresolved`.
 *   • PULL (down): restoreWikilinks — rewrite each internal `[text](url)` back to `[[note name|text]]`.
 *                  What counts as "internal" is the caller's job (import's canonicalized/id-fallback
 *                  matching), passed in as `resolveInternalLink`.
 *
 * ASSET handling (images) is centralized here too so it behaves identically on every platform: a local
 * image reference (`![alt](path)` or Obsidian `![[path]]`) is uploaded to WP media and rewritten to the
 * returned URL on push. The upload itself is platform-specific (read a file / a blob / a File) so it is
 * injected as an `AssetUploader` port; the extract/rewrite/orchestration around it is pure and lives here.
 */

import type { SiloWorkspace } from '../model/types';
import { buildNoteLinkIndex, formatWikilink } from '../vault/note-links';

/** Resolves internal-link references both ways. Built once from a workspace and reused for a whole
 *  push/pull run. */
export interface LinkResolver {
  /** A content's live WP permalink for a wikilink target (note name, slug or id — see note-links.ts),
   *  or undefined if the target is unknown or has no permalink yet (never pushed). */
  permalinkFor(target: string): string | undefined;
  /** The wikilink target (note name) for a WP permalink (inverse), or undefined if the URL isn't ours. */
  targetForUrl(url: string): string | undefined;
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

/** Derive a LinkResolver from the workspace. `noteNames` (content id → note file name) comes from the
 *  host's vault scan; without it, names default to what the notes are created as. */
export function buildLinkResolver(ws: SiloWorkspace, noteNames?: ReadonlyMap<string, string>): LinkResolver {
  const index = buildNoteLinkIndex(ws, noteNames);
  const wpLinkById = new Map<string, string>();
  const idByUrl = new Map<string, string>();
  for (const c of ws.contents) {
    if (c.wpLink) {
      wpLinkById.set(c.id, c.wpLink);
      idByUrl.set(c.wpLink, c.id);
    }
  }
  return {
    permalinkFor: target => {
      const id = index.idFor(target);
      return id ? wpLinkById.get(id) : undefined;
    },
    targetForUrl: url => {
      const id = idByUrl.get(url);
      return id ? index.nameFor(id) : undefined;
    },
  };
}

// `[[target]]` or `[[target|alias]]` (optionally `[[target#heading|alias]]`). Target: note name, slug or id.
const WIKILINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;

/**
 * PUSH transform: resolve every `[[target]]` in a Markdown body to a real Markdown link
 * `[text](permalink)`, so the plugin's compiler receives a proper link it turns into a core `<a>` block.
 * The body STAYS Markdown — the plugin owns the one Markdown→blocks compilation. Targets not yet pushed
 * can't be linked this run: they degrade to their plain anchor text and are reported in `unresolved`
 * (the caller re-pushes after the target exists; the vault Markdown keeps the `[[target]]`, so the next
 * push links it). Returns the input trimmed; '' for an empty body (→ shell push, never overwrites the
 * WP body). Pure.
 */
export function resolveWikilinks(md: string, resolver: LinkResolver): { md: string; unresolved: string[] } {
  const trimmed = md.trim();
  if (!trimmed) return { md: '', unresolved: [] };

  const unresolved: string[] = [];
  const resolved = trimmed.replace(WIKILINK_RE, (_m, rawTarget: string, alias?: string) => {
    const target = rawTarget.trim();
    const text = (alias ?? target).trim();
    const permalink = resolver.permalinkFor(target);
    if (!permalink) {
      unresolved.push(target);
      return text; // can't link yet — emit plain text, keep the wikilink in the source for next time
    }
    // Emit a root-relative href (no domain) so the body survives a domain change / env migration.
    return `[${text}](${rootRelativePermalink(permalink)})`;
  });

  return { md: resolved, unresolved };
}

// A Markdown inline link `[text](href "optional title")` — but NOT an image `![alt](path)` (lookbehind).
// Group 1 = text, 2 = href, 3 = trailing.
const MD_LINK_RE = /(?<!!)\[([^\]]*)\]\(\s*([^)\s]+)((?:\s+"[^"]*")?\s*\))/g;

/**
 * PULL transform: rewrite every INTERNAL `[text](url)` in a Markdown body (as the plugin's prose codec
 * hands it back) into a `[[note name]]` / `[[note name|text]]` wikilink, so the note round-trips through
 * a push exactly like one authored by hand. `resolveInternalLink` returns the target note's file name for
 * a URL this import considers internal (external links, and internal ones the caller couldn't resolve,
 * are left as plain `[text](url)`). Pure string pass — no HTML parsing. Empty input → ''.
 */
export function restoreWikilinks(md: string, resolveInternalLink: (url: string) => string | undefined): string {
  const trimmed = md.trim();
  if (!trimmed) return '';
  return trimmed.replace(MD_LINK_RE, (whole, text: string, href: string) => {
    const name = resolveInternalLink(href);
    // An internal link becomes a wikilink (formatWikilink omits the alias when text === name);
    // anything else stays the plain Markdown link it was.
    return name ? formatWikilink(name, text) : whole;
  });
}
