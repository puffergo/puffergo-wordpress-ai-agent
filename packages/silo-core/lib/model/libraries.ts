/**
 * libraries — the keyword / internal-link / external-link "libraries" as DERIVED VIEWS over the
 * workspace. There is no separate stored table: the single source of truth stays `nodes + contents +
 * edges`. These selectors just aggregate that truth into the three shapes the UI curates and analyses:
 *   - keyword library   → hierarchical (the Silo node tree), each term with its usage count
 *   - internal-link lib → flat: every content as a link target, with inbound/outbound counts
 *   - external-link lib → flat + de-duplicated by URL, with the contents that reference it
 * Keywords are a tree (SEO backbone); links are a graph, so they're flat. See types.ts `Edge`.
 */

import type { KeywordSource, KeywordTier, SearchIntent, Seo, SiloWorkspace } from './types';
import { normalizeTerm } from './keywords';

/** One entry of the keyword library — a MANAGED keyword (`ws.keywords`) joined with how it is actually
 *  used across the site's SEO fields. Core/long-tail is a per-page ROLE (not a property of the word),
 *  so it's surfaced here as a distribution (asCore / asLongTail), and `cannibalized` flags the SEO
 *  anti-pattern of two+ pages competing for the SAME core keyword. A planned word with no usage is a
 *  content GAP (`usage === 0`). Category node NAMES are structure, never keywords. */
export interface KeywordLibEntry {
  /** KeywordEntity id — stable across renames; the row key + edit/delete target. */
  id: string;
  /** The keyword text, in its managed display casing. */
  term: string;
  /** Provenance: hand-planned locally, pulled from the cloud, or both. */
  source: KeywordSource;
  intent?: SearchIntent;
  /** Planning hint of the word's nature (head/long-tail) — carried through so the editor can prefill it. */
  plannedTier?: KeywordTier;
  note?: string;
  /** Total items (content + category archive SEO) targeting this keyword. 0 = a planned gap. */
  usage: number;
  /** How many pages target it as a CORE keyword. */
  asCore: number;
  /** How many pages target it as a LONG-TAIL keyword. */
  asLongTail: number;
  /** SEO cannibalization: 2+ pages claim this as their CORE keyword (an anti-pattern to fix). */
  cannibalized: boolean;
  /** Content ids that target this keyword (core or long-tail) — for jump-to / coverage. */
  coveringContentIds: string[];
}

/** Keyword library: the MANAGED vocabulary joined with real per-page usage. Every managed keyword shows
 *  (including planned words with `usage === 0` — the gaps), each with its core/long-tail distribution,
 *  cannibalization flag, provenance, and covering content. Sorted: cannibalized first, then by usage
 *  desc, then term. Category node names are NOT keywords; only SEO fields count as usage. */
export function keywordLibrary(ws: SiloWorkspace): KeywordLibEntry[] {
  const core = new Map<string, number>();
  const long = new Map<string, number>();
  const covering = new Map<string, string[]>();
  const bump = (m: Map<string, number>, key: string) => m.set(key, (m.get(key) ?? 0) + 1);
  const collectRoles = (seo: Seo, contentId?: string) => {
    for (const k of seo.coreKeywords) {
      const key = normalizeTerm(k);
      if (!key) continue;
      bump(core, key);
      if (contentId) covering.set(key, [...(covering.get(key) ?? []), contentId]);
    }
    for (const k of seo.longTailKeywords) {
      const key = normalizeTerm(k);
      if (!key) continue;
      bump(long, key);
      if (contentId) covering.set(key, [...(covering.get(key) ?? []), contentId]);
    }
  };
  for (const c of ws.contents) collectRoles(c.seo, c.id);
  for (const n of ws.nodes) if (!n.system && n.seo) collectRoles(n.seo); // category archive-SEO usage

  return ws.keywords
    .map(k => {
      const key = normalizeTerm(k.term);
      const asCore = core.get(key) ?? 0;
      const asLongTail = long.get(key) ?? 0;
      return {
        id: k.id,
        term: k.term,
        source: k.source,
        intent: k.intent,
        plannedTier: k.plannedTier,
        note: k.note,
        asCore,
        asLongTail,
        usage: asCore + asLongTail,
        cannibalized: asCore >= 2,
        coveringContentIds: Array.from(new Set(covering.get(key) ?? [])),
      };
    })
    .sort(
      (a, b) => Number(b.cannibalized) - Number(a.cannibalized) || b.usage - a.usage || a.term.localeCompare(b.term),
    );
}

/** One entry of the flat internal-link library (every content is a potential target). */
export interface InternalLinkEntry {
  contentId: string;
  title: string;
  /** Number of other contents linking TO this one (internal inbound). A hub has many; 0 = orphan. */
  inbound: number;
  /** Number of internal links FROM this content out to others. */
  outbound: number;
}

/** Flat internal-link library with inbound/outbound counts — the god's-eye view of the link graph. */
export function internalLinkLibrary(ws: SiloWorkspace): InternalLinkEntry[] {
  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();
  for (const e of ws.edges) {
    if (e.type !== 'internal-link') continue;
    outbound.set(e.from, (outbound.get(e.from) ?? 0) + 1);
    inbound.set(e.to, (inbound.get(e.to) ?? 0) + 1);
  }
  return ws.contents.map(c => ({
    contentId: c.id,
    title: c.title,
    inbound: inbound.get(c.id) ?? 0,
    outbound: outbound.get(c.id) ?? 0,
  }));
}

/** One de-duplicated external target, with every content that links out to it. */
export interface ExternalLinkEntry {
  url: string;
  host: string;
  /** Contents that link to this URL, with the anchor text each used. */
  refs: { contentId: string; title: string; anchor?: string; dofollow?: boolean }[];
  /** Share of references that are dofollow (0–1) — quick read on link-equity passed out. */
  dofollowRatio: number;
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/** Flat, de-duplicated external-link library: one entry per outbound URL with its referencing pages. */
export function externalLinkLibrary(ws: SiloWorkspace): ExternalLinkEntry[] {
  const titleOf = new Map(ws.contents.map(c => [c.id, c.title]));
  const byUrl = new Map<string, ExternalLinkEntry>();
  for (const e of ws.edges) {
    if (e.type !== 'external-link') continue;
    const entry =
      byUrl.get(e.to) ?? ({ url: e.to, host: hostOf(e.to), refs: [], dofollowRatio: 0 } satisfies ExternalLinkEntry);
    entry.refs.push({
      contentId: e.from,
      title: titleOf.get(e.from) ?? e.from,
      anchor: e.anchor,
      dofollow: e.dofollow,
    });
    byUrl.set(e.to, entry);
  }
  for (const entry of byUrl.values()) {
    const df = entry.refs.filter(r => r.dofollow !== false).length;
    entry.dofollowRatio = entry.refs.length ? df / entry.refs.length : 0;
  }
  return [...byUrl.values()].sort((a, b) => b.refs.length - a.refs.length);
}
