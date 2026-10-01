/**
 * Local filesystem persistence for the CLI host — the silo台账 (workspace) half.
 *
 * The workspace lives under a "vault dir" (defaults to cwd), so an AI agent working in a folder just
 * runs `silo <cmd>` there. Credentials do NOT live here — they are read from the out-of-vault PufferGo
 * store (see adapters/credentials.ts) so the App Password never syncs/publishes with the notes.
 *
 * ONE layout, shared with the Obsidian plugin and defined once in `@puffergo/silo-core`'s store/layout
 * (so the two hosts can never drift on where a file belongs):
 *
 *   .puffergo/state.json                  ← which site is active (`{ activeSiteUrl }`)
 *   .puffergo/sites/<domain>/workspace.json ← one folder per connected site
 *
 * `<domain>` is `siteKey(siteUrl)` — already file-name-safe on every platform. There is no legacy
 * single-site layout any more: a vault is migrated to this shape once (see scripts/migrate-vault.mjs)
 * and `silo init` writes it directly.
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { siteKey, SITES_DIR, STATE_PATH, workspacePath, type SiloWorkspace } from '@puffergo/silo-core';

const parse = async <T>(p: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(p, 'utf8')) as T;
  } catch {
    return null;
  }
};

/** Site domains present in the vault (one folder per site under `.puffergo/sites/`), or []. */
export async function listSites(dir: string): Promise<string[]> {
  const d = join(dir, SITES_DIR);
  if (!existsSync(d)) return [];
  try {
    const ents = await readdir(d, { withFileTypes: true });
    return ents.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}

/** The active site's domain key from `.puffergo/state.json` (null when never set). Same field name as
 *  `SiloStore.activeDomain`, so both hosts read/write one shape. */
export async function readActiveDomain(dir: string): Promise<string | null> {
  const state = await parse<{ activeDomain?: string }>(join(dir, STATE_PATH));
  return typeof state?.activeDomain === 'string' && state.activeDomain ? state.activeDomain : null;
}

/** Remember which site this folder is pointed at (by site URL; stored as its domain key). */
export async function writeActiveDomain(dir: string, siteUrl: string): Promise<void> {
  const p = join(dir, STATE_PATH);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify({ activeDomain: siteKey(siteUrl) }, null, 2), 'utf8');
}

/**
 * Which site a vault should act on: an explicit `--site` wins, then `state.json`'s active site, then the
 * only site when there is just one. Returns null when several sites exist and nothing picks between them
 * — the caller asks rather than guessing, since guessing would push one site's content to another site's
 * WordPress.
 */
export async function resolveSite(dir: string, wanted?: string): Promise<string | null> {
  const keys = await listSites(dir);
  if (!keys.length) return null;
  if (wanted) {
    const key = siteKey(wanted);
    return keys.includes(key) ? key : null;
  }
  const active = await readActiveDomain(dir);
  if (active && keys.includes(active)) return active;
  return keys.length === 1 ? keys[0]! : null;
}

/**
 * Read the vault's workspace for one site. `site` picks one in a multi-site vault (matched through
 * `siteKey`, so "https://example.com/" and "example.com" both work). Returns null when there is no
 * workspace at all AND when a multi-site vault needs a choice — callers distinguish the two with
 * `listSites`/`resolveSite` to give the right message.
 */
export async function readWorkspace(dir: string, site?: string): Promise<SiloWorkspace | null> {
  const key = await resolveSite(dir, site);
  return key ? parse<SiloWorkspace>(join(dir, workspacePath(key))) : null;
}

/**
 * Write the workspace back into its site folder (`.puffergo/sites/<domain>/workspace.json`), and refresh
 * `state.json` so Obsidian reopens on the site the CLI just worked on. The domain comes from the
 * workspace's own site URL.
 */
export async function writeWorkspace(dir: string, ws: SiloWorkspace): Promise<void> {
  const url = ws.connection?.siteUrl ?? ws.profile?.url ?? '';
  const key = siteKey(url);
  const p = join(dir, workspacePath(key));
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(ws, null, 2), 'utf8');
  if (url) await writeActiveDomain(dir, url);
}
