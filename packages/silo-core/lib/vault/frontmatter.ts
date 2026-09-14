/**
 * Vault ⇄ model bridge — the PURE half. One ContentItem is one markdown file whose frontmatter is
 * OWNED by Silo and whose body is written by a human or an AI agent. See docs/silo/vault-contract.md
 * for the human-facing contract.
 *
 * Framework-agnostic on purpose (no `node:fs`, no chrome, no obsidian): every host that reads/writes
 * vault files — `silo-cli` (Node fs) and the Obsidian plugin (`app.vault`) today — does its own I/O and
 * calls through these same functions, so the file FORMAT and the "what counts as an edit" logic can
 * never drift between hosts. Originally lived only in silo-cli's `lib/vault.ts`; moved here once the
 * Obsidian plugin needed the identical logic (see pages/obsidian/src/vault/*).
 */

import { parse as parseYaml } from 'yaml';
import type { ContentItem, SiloWorkspace } from '../model/types';
import { getNodePath } from '../model/selectors';
import { updateContent, setContentLinks } from '../model/mutations';

/** Filesystem-safe slug from a term/title. */
export const slugify = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';

/** The folder a content lives in = its node path (pillar/cluster) as slugified segments — pure path
 *  PIECES, not joined: each host joins with its own path semantics (Node `path.join`, an Obsidian vault
 *  path's `/`-separated string). */
export function contentDirSegments(ws: SiloWorkspace, content: ContentItem): string[] {
  return getNodePath(ws, content.siloNodeId).map(n => slugify(n.term));
}

// Characters Obsidian refuses in a note name (plus the OS-level `/` `\`), mapped to full-width look-alikes
// so a title stays readable instead of being mangled into dashes.
const FILENAME_CHAR_MAP: Record<string, string> = {
  '\\': '＼',
  '/': '／',
  ':': '：',
  '*': '＊',
  '?': '？',
  '"': '＂',
  '<': '＜',
  '>': '＞',
  '|': '｜',
  '#': '＃',
  '^': '＾',
  '[': '［',
  ']': '］',
};
const decodeEntities = (s: string): string =>
  s
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

/** A human-readable note name from a title ('' when the title has nothing usable). */
export function titleToFileName(title: string): string {
  return decodeEntities(title ?? '')
    .replace(/[\\/:*?"<>|#^[\]]/g, ch => FILENAME_CHAR_MAP[ch] ?? '-')
    .replace(/[\x00-\x1f\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 120)
    .trim();
}

/** Basename used when the title one is unusable or already taken by a different note: slug, else id. */
export function contentFileFallbackName(content: ContentItem): string {
  return content.slug ? slugify(content.slug) : content.id;
}

/** File basename (no directory, no `.md`) for a NEW note: its title, so the vault reads like a table of
 *  contents; falls back to slug/id when there's no title. Only applies at creation — hosts locate an
 *  existing note by `silo.id` and keep whatever name it already has (a title edit never renames a file,
 *  and pre-existing slug-named notes are left alone). Wikilinks keep working via the `aliases: [slug]`
 *  that renderFrontmatter emits. */
export function contentFileBaseName(content: ContentItem): string {
  return titleToFileName(content.title) || contentFileFallbackName(content);
}

const esc = (s: string): string => String(s ?? '').replace(/"/g, '\\"');
const yamlList = (items: string[]): string =>
  items.length ? '\n' + items.map(i => `  - "${esc(i)}"`).join('\n') : ' []';

/**
 * Serialize a content's frontmatter. The user-editable content/SEO fields are FLAT native types so
 * Obsidian's Properties panel can edit them (it supports Text/List/… but NOT nested objects — nested
 * props are read-only there). The system-owned `silo:`/`wp:` blocks are kept NESTED on purpose: Obsidian
 * renders them read-only, which protects the ids/permalink from accidental edits. Body is appended verbatim.
 */
export function renderFrontmatter(
  ws: SiloWorkspace,
  content: ContentItem,
  internalLinks: string[],
  externalLinks: string[],
  purpose = '',
): string {
  const nodePath = getNodePath(ws, content.siloNodeId)
    .map(n => n.term)
    .join(' / ');
  const s = content.seo;
  return [
    '---',
    'silo:', // system-owned, read-only in Obsidian (nested)
    `  id: ${content.id}`,
    `  node: "${esc(nodePath)}"`,
    `  postType: ${content.postType}`,
    `title: "${esc(content.title)}"`,
    content.slug ? `slug: ${slugify(content.slug)}` : 'slug:',
    // Lets Obsidian resolve `[[slug]]` / `[[slug|text]]` even though the file is named after the title.
    ...(content.slug ? ['aliases:', `  - "${esc(slugify(content.slug))}"`] : []),
    `purpose: "${esc(purpose)}"`, // 这篇的目的（对齐 Step3），可编辑，不推送到 WP
    `seoTitle: "${esc(s.title)}"`,
    `seoDescription: "${esc(s.description)}"`,
    `coreKeywords:${yamlList(s.coreKeywords)}`,
    `longTailKeywords:${yamlList(s.longTailKeywords)}`,
    `internalLinks:${yamlList(internalLinks)}`,
    `externalLinks:${yamlList(externalLinks)}`,
    `status: ${content.wpStatus ?? 'draft'}`,
    'wp:', // system-owned, read-only in Obsidian (nested)
    `  postId: ${content.wpPostId ?? 'null'}`,
    `  link: ${content.wpLink ? `"${esc(content.wpLink)}"` : 'null'}`,
    '---',
    '',
  ].join('\n');
}

/** The user-editable fields we read BACK out of a note's frontmatter (the authoritative source for
 *  content/SEO once a note exists — edits made in the vault flow to WP). `silo:`/`wp:` are never read
 *  back — see the module doc comment. */
export interface FrontmatterEdits {
  title?: string;
  slug?: string;
  purpose?: string;
  seoTitle?: string;
  seoDescription?: string;
  coreKeywords?: string[];
  longTailKeywords?: string[];
  internalLinks?: string[]; // items may be "[[slug]]" or bare "slug"
  externalLinks?: string[];
}

/** Parse the editable frontmatter fields from a raw frontmatter block. Returns null if the YAML is
 *  malformed (caller then keeps the model value rather than wiping it). Robust to Obsidian's own
 *  re-serialization since it's a real YAML parse. */
export function parseFrontmatterEdits(fm: string): FrontmatterEdits | null {
  let doc: unknown;
  try {
    doc = parseYaml(fm);
  } catch {
    return null;
  }
  if (!doc || typeof doc !== 'object') return null;
  const d = doc as Record<string, unknown>;
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : v == null ? undefined : String(v));
  const list = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : undefined;
  return {
    title: str(d.title),
    slug: str(d.slug),
    purpose: str(d.purpose),
    seoTitle: str(d.seoTitle),
    seoDescription: str(d.seoDescription),
    coreKeywords: list(d.coreKeywords),
    longTailKeywords: list(d.longTailKeywords),
    internalLinks: list(d.internalLinks),
    externalLinks: list(d.externalLinks),
  };
}

/** Strip an Obsidian `[[wikilink]]` (and any `#heading`/`|alias`) down to the bare target slug. */
export function wikilinkTarget(raw: string): string {
  return raw
    .replace(/^\[\[|\]\]$/g, '')
    .split(/[#|]/)[0]
    .trim();
}

/** Split a raw md file into its frontmatter block (raw text) and body. */
export function splitFrontmatter(raw: string): { fm: string; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: '', body: raw };
  return { fm: m[1], body: m[2] };
}

/** Extract the Silo content id from a frontmatter block (the only 2-space `id:` under `silo:`). */
export function siloIdOf(fm: string): string | null {
  const m = fm.match(/\n {2}id:\s*(c_\w+)/) ?? fm.match(/^ {2}id:\s*(c_\w+)/);
  return m ? m[1] : null;
}

const norm = (s: string): string => s.trim().toLowerCase();

/**
 * Read user edits from every note's frontmatter back into the workspace model, so what the user tuned
 * in the vault (SEO, keywords, title/slug, links) is what gets pushed. Called right before a push. Only
 * the flat editable fields are honored; `silo:`/`wp:` are ignored. A file whose YAML fails to parse is
 * skipped (its model values are kept, never wiped). Internal `[[slug]]` links resolve to sibling
 * content ids. Returns the updated workspace + how many notes contributed an edit.
 */
export function applyFrontmatterEdits(
  ws: SiloWorkspace,
  scanned: Map<string, { fm: string }>,
): { ws: SiloWorkspace; changed: number } {
  const slugToId = new Map<string, string>();
  for (const c of ws.contents) if (c.slug) slugToId.set(norm(c.slug), c.id);
  let next = ws;
  let changed = 0;
  for (const c of ws.contents) {
    const scan = scanned.get(c.id);
    if (!scan) continue;
    const e = parseFrontmatterEdits(scan.fm);
    if (!e) continue;
    let touched = false;

    // Scalar content/SEO fields — apply only when present AND actually different (avoid churn).
    const seo = { ...c.seo };
    if (e.seoTitle !== undefined && e.seoTitle !== seo.title) ((seo.title = e.seoTitle), (touched = true));
    if (e.seoDescription !== undefined && e.seoDescription !== seo.description)
      ((seo.description = e.seoDescription), (touched = true));
    const eqList = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
    if (e.coreKeywords && !eqList(e.coreKeywords, seo.coreKeywords))
      ((seo.coreKeywords = e.coreKeywords), (touched = true));
    if (e.longTailKeywords && !eqList(e.longTailKeywords, seo.longTailKeywords))
      ((seo.longTailKeywords = e.longTailKeywords), (touched = true));

    const patch: Partial<ContentItem> = {};
    if (touched) patch.seo = seo;
    if (e.title !== undefined && e.title !== c.title) ((patch.title = e.title), (touched = true));
    if (e.slug !== undefined && norm(e.slug) !== norm(c.slug ?? '')) ((patch.slug = e.slug), (touched = true));
    if (Object.keys(patch).length) next = updateContent(next, c.id, patch);

    // Links: resolve desired sets and rewrite only when they differ from the current edges.
    if (e.internalLinks || e.externalLinks) {
      const desiredInternal = (e.internalLinks ?? [])
        .map(raw => slugToId.get(norm(wikilinkTarget(raw))))
        .filter((x): x is string => !!x);
      const desiredExternal = e.externalLinks ?? [];
      const curInternal = next.edges.filter(g => g.from === c.id && g.type === 'internal-link').map(g => g.to);
      const curExternal = next.edges.filter(g => g.from === c.id && g.type === 'external-link').map(g => g.to);
      if (!eqList(desiredInternal, curInternal) || !eqList(desiredExternal, curExternal)) {
        next = setContentLinks(next, c.id, desiredInternal, desiredExternal);
        touched = true;
      }
    }
    if (touched) changed++;
  }
  return { ws: next, changed };
}
