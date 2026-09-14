/**
 * parse-links — extract link relationships out of an existing WordPress post's rendered HTML.
 *
 * This is the INVERSE of authoring: when we pull existing WP content into the Silo tool, we don't
 * decide where links go — the content already has them. We read the finished HTML back and recover
 * the *relationships* (the same category of structured data as keywords): which `<a href>`s point
 * inside the same site (internal links) and which point to other domains (external links), plus the
 * anchor text and rel=nofollow. The god's-eye view is then a picture of the site as it ACTUALLY is,
 * not just what was planned. We never inject links into content — parsing only reads.
 */

import type { LinkPlacement } from '../model/types';

/** One link recovered from content HTML, before it is resolved to a ContentItem. */
export interface RawLink {
  /** Absolute or relative href exactly as it appeared. */
  href: string;
  /** Normalised absolute URL (relative hrefs resolved against the post's own URL), or null if unparseable. */
  url: string | null;
  /** Anchor text, whitespace-collapsed. */
  anchor: string;
  /** false when the link carries rel="nofollow". */
  dofollow: boolean;
  /** Page region the link sits in. Only meaningful when a FULL themed page was parsed. */
  placement: LinkPlacement;
}

export interface ParsedLinks {
  internal: RawLink[];
  external: RawLink[];
}

/** Host of a URL, lowercased, `www.` stripped — for same-site comparison. Null if unparseable. */
export const canonicalHost = (url: string, base?: string): string | null => {
  try {
    return new URL(url, base).host.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
};

/**
 * True for WordPress's ugly fallback permalink (`?page_id=N` / `?p=N`), which is what a post gets while
 * it has no real pretty permalink yet (draft / pending / private / trashed). Its pathname is EMPTY, so
 * any path-based canonicalisation collapses it onto the same key as the site root — callers must keep
 * these out of URL→id maps and match them by post id instead.
 */
export const isFallbackPermalink = (url: string, base?: string): boolean => {
  try {
    const u = new URL(url, base);
    // The empty path is the whole point — it is what makes these collide with the site root. Requiring
    // it also keeps a `?p=2` pagination param on a REAL path (`/blog/?p=2`) from being misread as one.
    if (u.pathname.replace(/\/+$/, '') !== '') return false;
    return u.searchParams.has('page_id') || u.searchParams.has('p');
  } catch {
    return false;
  }
};

const NOFOLLOW = /\bnofollow\b/i;

/**
 * Blank out anything that is not rendered markup, so `<a>`-looking text inside it can't be mistaken
 * for a link. Inline scripts routinely build markup out of strings (`'<a href="' + url + '">'`), and
 * a full themed page carries far more of them than a `content.rendered` fragment does — one real
 * site produced three phantom "links" named `waUrl`, `'tel:' + …` and `'mailto:' + …`.
 *
 * The content is replaced with spaces rather than removed so every byte offset stays valid — region
 * attribution indexes into this same string.
 */
const NON_MARKUP_RE = /<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const maskNonMarkup = (html: string): string =>
  html.replace(NON_MARKUP_RE, m => {
    const open = m.indexOf('>') + 1;
    const close = m.lastIndexOf('</');
    return m.slice(0, open) + ' '.repeat(close - open) + m.slice(close);
  });

/**
 * Byte ranges of the template regions in a full themed page, so each anchor can be attributed to the
 * region it falls inside. Driven purely by semantic landmarks (`<header>`, `<nav>`, `<footer>`) plus
 * the WP-standard `#masthead` / `#colophon` ids that themes without landmarks still tend to use.
 *
 * Deliberately structural rather than clever: a theme that uses none of these yields no ranges, every
 * link comes back as 'body', and the graph looks exactly as it does today. Under-detection degrades
 * to current behavior; over-detection would silently mislabel real body links, which is worse.
 */
const REGION_RE =
  /<(header|nav|footer)\b[^>]*>|<\/(header|nav|footer)\s*>|<(?:div|section)\b[^>]*\bid\s*=\s*["'](masthead|colophon|site-header|site-footer)["'][^>]*>/gi;

interface Region {
  start: number;
  end: number;
  placement: LinkPlacement;
}

/**
 * Find template regions by scanning tag boundaries. Nested same-name tags are handled with a depth
 * counter so an inner `<nav>` inside `<header>` doesn't close the outer one early. The id-based
 * fallback has no reliable end tag, so it claims everything up to the next region of any kind (or
 * end of document) — good enough to catch a masthead's links, and it can only ever pull links INTO
 * the template layer, never push template links into the body.
 */
function templateRegions(html: string): Region[] {
  const regions: Region[] = [];
  const open: { name: string; start: number; placement: LinkPlacement; depth: number }[] = [];

  for (const m of html.matchAll(REGION_RE)) {
    const [tag, openName, closeName, idName] = m;
    const at = m.index ?? 0;
    if (openName) {
      const name = openName.toLowerCase();
      const top = open[open.length - 1];
      // Already inside a region of the same tag → just track depth, don't start a second one.
      if (top && top.name === name) {
        top.depth++;
        continue;
      }
      // A <nav> nested inside a <header> is still the header's; keep the outermost region only.
      if (open.length) continue;
      open.push({ name, start: at, placement: name === 'footer' ? 'footer' : 'nav', depth: 1 });
    } else if (closeName) {
      const name = closeName.toLowerCase();
      const top = open[open.length - 1];
      if (!top || top.name !== name) continue;
      if (--top.depth > 0) continue;
      open.pop();
      regions.push({ start: top.start, end: at + tag.length, placement: top.placement });
    } else if (idName && !open.length) {
      const id = idName.toLowerCase();
      regions.push({
        start: at,
        // Closed later by the next region's start; provisionally runs to end of document.
        end: html.length,
        placement: id === 'colophon' || id === 'site-footer' ? 'footer' : 'nav',
      });
    }
  }
  // Unterminated regions (malformed markup) run to end of document — same rule as the id fallback.
  for (const o of open) regions.push({ start: o.start, end: html.length, placement: o.placement });

  // Clip each open-ended region at the next region's start so a masthead doesn't swallow the page.
  regions.sort((a, b) => a.start - b.start);
  for (let i = 0; i < regions.length - 1; i++) {
    if (regions[i].end > regions[i + 1].start) regions[i].end = Math.min(regions[i].end, regions[i + 1].start);
  }
  return regions;
}

const placementAt = (regions: Region[], at: number): LinkPlacement =>
  regions.find(r => at >= r.start && at < r.end)?.placement ?? 'body';

// Match <a ...>...</a>. Attribute order is not guaranteed in rendered WP HTML, so we grab the whole
// opening tag and pull href/rel/anchor out of it individually. `[^>]*` is safe here because valid
// HTML attribute values containing `>` would be entity-encoded in rendered output.
const ANCHOR_RE = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
const attr = (tag: string, name: string): string | undefined =>
  tag
    .match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'))
    ?.slice(2)
    .find(v => v !== undefined);

const stripTags = (s: string): string =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Parse all `<a>` links out of rendered post HTML and split them into internal (same site as
 * `siteUrl`) vs external. `postUrl` (the post's own permalink) is used as the base to resolve
 * relative and root-relative hrefs. Anchors to the page itself (`#…`), `mailto:`/`tel:` and empty
 * hrefs are skipped — they are not link relationships.
 */
export function parseLinks(rawHtml: string, siteUrl: string, postUrl?: string): ParsedLinks {
  const siteHost = canonicalHost(siteUrl);
  const base = postUrl || siteUrl;
  const internal: RawLink[] = [];
  const external: RawLink[] = [];
  const html = maskNonMarkup(rawHtml);
  // Only a full themed page has template regions; a `content.rendered` fragment yields none, so every
  // link there lands on 'body' — which is exactly right, it IS the body.
  const regions = templateRegions(html);

  for (const m of html.matchAll(ANCHOR_RE)) {
    const [, tag, inner] = m;
    const href = (attr(tag, 'href') ?? '').trim();
    if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) continue;

    const host = canonicalHost(href, base);
    let url: string | null = null;
    try {
      url = new URL(href, base).toString();
    } catch {
      url = null;
    }
    const link: RawLink = {
      href,
      url,
      anchor: stripTags(inner),
      dofollow: !NOFOLLOW.test(attr(tag, 'rel') ?? ''),
      placement: placementAt(regions, m.index ?? 0),
    };
    if (host && siteHost && host === siteHost) internal.push(link);
    else external.push(link);
  }

  return { internal, external };
}
