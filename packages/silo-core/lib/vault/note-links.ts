/**
 * Which note a `[[wikilink]]` points at — the ONE rule every host (CLI, Obsidian, import) shares.
 *
 * Obsidian resolves a click on `[[x]]` by FILE NAME only; frontmatter `aliases` feed autocomplete but
 * never resolve a click (clicking an alias-only target silently creates an empty note named `x`). Notes
 * are named by title (see `contentFileBaseName`), so links are written as `[[<note file name>|text]]`.
 *
 * Reading stays lenient: a target may be the note's file name, its slug (links written before this
 * rule), or its content id — so existing vaults keep pushing correctly while they're migrated.
 */

import type { SiloWorkspace } from '../model/types';
import { contentFileBaseName } from './frontmatter';

const norm = (s: string): string => s.trim().toLowerCase();

export interface NoteLinkIndex {
  /** The content id a wikilink target (note name, slug or id) refers to, or undefined. */
  idFor(target: string): string | undefined;
  /** The name to write inside `[[…]]` for a content: its note's actual file name when known. */
  nameFor(id: string): string | undefined;
}

/** A note path (vault-relative or absolute, `/` or `\`) → its file name without `.md`. */
export function noteNameFromPath(path: string): string {
  return (path.split(/[\\/]/).pop() ?? path).replace(/\.md$/i, '');
}

/** Content id → note file name, from any host scan that knows each note's path. */
export function noteNamesFromScan(scanned: ReadonlyMap<string, { path?: string }>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, s] of scanned) if (s.path) out.set(id, noteNameFromPath(s.path));
  return out;
}

/**
 * @param noteNames content id → the note's real file name. Contents without an entry (no note yet) use
 *   the name their note WILL be created with (`contentFileBaseName`).
 */
export function buildNoteLinkIndex(ws: SiloWorkspace, noteNames?: ReadonlyMap<string, string>): NoteLinkIndex {
  const nameById = new Map<string, string>();
  for (const c of ws.contents) nameById.set(c.id, noteNames?.get(c.id) ?? contentFileBaseName(c));

  // Priority when two contents claim the same key: note name > slug > id.
  const byName = new Map<string, string>();
  const bySlug = new Map<string, string>();
  const byId = new Map<string, string>();
  for (const c of ws.contents) {
    const name = nameById.get(c.id);
    if (name && !byName.has(norm(name))) byName.set(norm(name), c.id);
    if (c.slug && !bySlug.has(norm(c.slug))) bySlug.set(norm(c.slug), c.id);
    byId.set(norm(c.id), c.id);
  }
  return {
    idFor: target => {
      const k = norm(target);
      return byName.get(k) ?? bySlug.get(k) ?? byId.get(k);
    },
    nameFor: id => nameById.get(id),
  };
}

/** `[[name]]`, or `[[name|text]]` when the visible text differs from the name. */
export function formatWikilink(name: string, text?: string): string {
  return text && text !== name ? `[[${name}|${text}]]` : `[[${name}]]`;
}
