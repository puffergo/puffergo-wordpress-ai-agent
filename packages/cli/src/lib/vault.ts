/**
 * Vault <-> model bridge, CLI HALF: Node `fs` I/O only. The FORMAT/logic (frontmatter render/parse,
 * what counts as an edit) lives in `@puffergo/silo-core`'s `lib/vault/frontmatter.ts` — shared
 * verbatim with the Obsidian plugin (`pages/obsidian/src/vault/*`, which does the same job over
 * `app.vault` instead of `node:fs`) so the two hosts can never drift on what a note file means.
 *
 * See docs/silo/vault-contract.md for the human-facing contract.
 */

import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import type { ContentItem, SiloWorkspace } from '@puffergo/silo-core';
import {
  contentDirSegments,
  contentFileBaseName,
  contentFileFallbackName,
  renderFrontmatter,
  splitFrontmatter,
  siloIdOf,
  parseFrontmatterEdits,
} from '@puffergo/silo-core';

export {
  slugify,
  parseFrontmatterEdits,
  wikilinkTarget,
  splitFrontmatter,
  siloIdOf,
  applyFrontmatterEdits,
  renderFrontmatter,
  type FrontmatterEdits,
} from '@puffergo/silo-core';

/** The folder a content lives in, as an absolute fs path under `dir`. */
export function contentDir(dir: string, ws: SiloWorkspace, content: ContentItem): string {
  return join(dir, ...contentDirSegments(ws, content));
}

/** The md file path for a content (folder + slug/id). */
export function contentFilePath(dir: string, ws: SiloWorkspace, content: ContentItem): string {
  return join(contentDir(dir, ws, content), `${contentFileBaseName(content)}.md`);
}

/** Write (or refresh) a content's md file. Preserves any existing body the agent already wrote AND any
 *  `purpose` the user has since edited (falls back to the plan-provided purpose on first creation). */
export async function writeContentFile(
  dir: string,
  ws: SiloWorkspace,
  content: ContentItem,
  internalLinks: string[],
  externalLinks: string[],
  purpose?: string,
  /** This content's note wherever it currently lives (found by `silo.id`). Its FILENAME is kept — only
   *  the folder follows the model — so a title edit or a hand-renamed note never gets renamed/duplicated. */
  knownPath?: string,
): Promise<string> {
  let p = knownPath ? join(contentDir(dir, ws, content), basename(knownPath)) : contentFilePath(dir, ws, content);
  if (!knownPath && existsSync(p) && siloIdOf(splitFrontmatter(await readFile(p, 'utf8')).fm) !== content.id) {
    // Title-named path already taken by a different note: fall back to slug/id rather than overwrite it.
    p = join(contentDir(dir, ws, content), `${contentFileFallbackName(content)}.md`);
  }
  if (knownPath && knownPath !== p) {
    await mkdir(dirname(p), { recursive: true });
    await rename(knownPath, p);
  }
  let body = '\n';
  let existingPurpose: string | undefined;
  if (existsSync(p)) {
    const split = splitFrontmatter(await readFile(p, 'utf8'));
    body = split.body || body;
    existingPurpose = parseFrontmatterEdits(split.fm)?.purpose;
  }
  const finalPurpose = existingPurpose || purpose || '';
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, renderFrontmatter(ws, content, internalLinks, externalLinks, finalPurpose) + body, 'utf8');
  return p;
}

/**
 * Scaffold (or refresh) one md file per content in the workspace. Frontmatter is rewritten from the
 * model; any body the agent already wrote is preserved. Used by both `plan` (fresh projection) and
 * `pull` (so WP-sourced content shows up as editable markdown, not just in workspace.json).
 * Returns the number of files written.
 */
export async function scaffoldVault(dir: string, ws: SiloWorkspace, purposes?: Map<string, string>): Promise<number> {
  const existing = await scanVault(dir);
  let files = 0;
  for (const c of ws.contents) {
    const outbound = ws.edges.filter(e => e.from === c.id);
    const internalWikilinks = outbound
      .filter(e => e.type === 'internal-link')
      .map(e => ws.contents.find(x => x.id === e.to))
      .filter((x): x is ContentItem => !!x)
      .map(x => `[[${x.slug ?? x.id}]]`);
    const external = outbound.filter(e => e.type === 'external-link').map(e => e.to);
    await writeContentFile(dir, ws, c, internalWikilinks, external, purposes?.get(c.id), existing.get(c.id)?.path);
    files++;
  }
  return files;
}

/** Replace only the BODY of a note file, keeping its frontmatter block byte-for-byte. Used after the
 *  asset pass rewrites local image refs to hosted URLs, so the vault note points at the uploaded image too. */
export async function updateNoteBody(path: string, newBody: string): Promise<void> {
  const { fm } = splitFrontmatter(await readFile(path, 'utf8'));
  await writeFile(path, `---\n${fm}\n---\n${newBody}`, 'utf8');
}

/** Walk the vault for *.md, mapping Silo content id -> { path, fm, body }. Skips .silo/ internals. */
export async function scanVault(dir: string): Promise<Map<string, { path: string; fm: string; body: string }>> {
  const out = new Map<string, { path: string; fm: string; body: string }>();
  async function walk(d: string): Promise<void> {
    for (const ent of await readdir(d, { withFileTypes: true })) {
      if (ent.name.startsWith('.')) continue;
      const full = join(d, ent.name);
      if (ent.isDirectory()) await walk(full);
      else if (ent.isFile() && ent.name.endsWith('.md')) {
        const { fm, body } = splitFrontmatter(await readFile(full, 'utf8'));
        const id = siloIdOf(fm);
        if (id) out.set(id, { path: full, fm, body });
      }
    }
  }
  if (existsSync(dir)) await walk(dir);
  return out;
}
