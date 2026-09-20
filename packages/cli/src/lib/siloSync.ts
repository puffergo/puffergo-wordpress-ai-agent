/**
 * Which notes `silo push` sends and which bodies `silo pull` may overwrite. A note is "changed" when its file
 * differs from how it was right after its last push or pull (a hash kept in `.silo/synced.json`), so a push
 * never touches posts nobody edited here, and a pull never overwrites edits not pushed yet.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { SiloWorkspace } from '@puffergo/silo-core';

export type Scan = Map<string, { path: string; fm: string; body: string }>;
/** Content id → hash of its note as last pushed or pulled. */
export type Synced = Record<string, string>;

const syncedPath = (dir: string) => join(dir, '.silo', 'synced.json');

export async function readSynced(dir: string): Promise<Synced> {
  const p = syncedPath(dir);
  return existsSync(p) ? (JSON.parse(await readFile(p, 'utf8')) as Synced) : {};
}

export async function writeSynced(dir: string, synced: Synced): Promise<void> {
  await mkdir(join(dir, '.silo'), { recursive: true });
  await writeFile(syncedPath(dir), JSON.stringify(synced, null, 2) + '\n', 'utf8');
}

export function noteHash(note: { fm: string; body: string }): string {
  return createHash('sha256').update(`${note.fm}\n---\n${note.body}`).digest('hex');
}

/** Edited here since its last push or pull. A note with no record counts as edited only if it has a body. */
export function isEdited(id: string, scan: Scan, synced: Synced): boolean {
  const note = scan.get(id);
  if (!note) return false;
  return synced[id] ? noteHash(note) !== synced[id] : !!note.body.trim();
}

/** What a plain `silo push` sends: never pushed yet, or edited since the last sync. */
export function changedIds(ws: SiloWorkspace, scan: Scan, synced: Synced): string[] {
  return ws.contents.filter(c => c.wpPostId == null || isEdited(c.id, scan, synced)).map(c => c.id);
}

/**
 * The content ids the given names point at: a note path or file name, a slug, a silo id, a WP post id or
 * link. Unmatched names come back in `unknown`.
 */
export function matchTargets(
  targets: string[],
  ws: SiloWorkspace,
  scan: Scan,
  dir: string,
): { ids: string[]; unknown: string[] } {
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const t of targets) {
    const name = t.replace(/\.md$/i, '');
    const c = ws.contents.find(c => {
      const note = scan.get(c.id);
      return (
        c.id === t ||
        c.slug === t ||
        String(c.wpPostId) === t ||
        (c.wpLink && c.wpLink.replace(/\/$/, '') === t.replace(/\/$/, '')) ||
        (note && (resolve(dir, t) === note.path || basename(note.path, '.md') === name))
      );
    });
    if (c) ids.push(c.id);
    else unknown.push(t);
  }
  return { ids, unknown };
}

/**
 * The records after a run that rewrote notes: the ones it synced take their new hash; the ones that were
 * unchanged before it keep being unchanged (the run only refreshed their frontmatter).
 */
export function recordSynced(synced: Synced, before: Scan, after: Scan, syncedIds: Iterable<string>): Synced {
  const out: Synced = { ...synced };
  const done = new Set(syncedIds);
  for (const [id, note] of after) {
    const was = before.get(id);
    if (done.has(id) || (was && synced[id] && noteHash(was) === synced[id])) out[id] = noteHash(note);
  }
  return out;
}
