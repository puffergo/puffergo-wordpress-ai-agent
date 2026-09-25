/**
 * Local filesystem persistence for the CLI host.
 *
 * The workspace lives under a "vault dir" (defaults to cwd), so an AI agent working in a folder just
 * runs `silo <cmd>` there. Credentials do NOT live here — they are read from the out-of-vault PufferGo
 * store (see adapters/credentials.ts) so the App Password never syncs/publishes with the notes.
 *
 * TWO LAYOUTS, one vault. Both are real and both must keep working, because the same folder is shared
 * with the Obsidian plugin:
 *
 *   .silo/workspace.json            — single site. What `silo init` has always written.
 *   .silo/sites/<domain>.json       — one file per connected site, with `.silo/state.json` naming the
 *   .silo/state.json                  active one. What the Obsidian plugin writes.
 *
 * The plugin MIGRATES the first into the second the first time it opens a vault, deleting
 * `workspace.json` as it goes (pages/obsidian/src/vault/fileStore.ts). Before this module understood
 * the per-site layout, that left the CLI reporting `no_workspace` on a vault that was perfectly
 * intact — and the Skill's error table then tells the agent to run `silo init`, which drops an EMPTY
 * workspace next to the customer's real one and invites a from-scratch re-plan of a site that was
 * already planned and pushed. Hence: read either layout, and write back the one the vault is already
 * using, never converting a vault from under the other host.
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { siteKey, type SiloWorkspace } from '@puffergo/silo-core';

const SILO_DIR = '.silo';
const WORKSPACE_FILE = join(SILO_DIR, 'workspace.json');
const SITES_DIR = join(SILO_DIR, 'sites');
const STATE_FILE = join(SILO_DIR, 'state.json');

/** The legacy single-site path. Still the one `silo init` creates in a fresh vault. */
export const workspacePath = (dir: string): string => join(dir, WORKSPACE_FILE);

const sitePath = (dir: string, key: string): string => join(dir, SITES_DIR, `${key}.json`);

const parse = async <T>(p: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(p, 'utf8')) as T;
  } catch {
    return null;
  }
};

/** Site keys present in the per-site layout, or [] when the vault doesn't use it. */
export async function listSites(dir: string): Promise<string[]> {
  const d = join(dir, SITES_DIR);
  if (!existsSync(d)) return [];
  try {
    return (await readdir(d)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -'.json'.length));
  } catch {
    return [];
  }
}

/**
 * Which site a per-site vault is currently on: an explicit `--site` wins, then `state.json`'s
 * `activeDomain` (what the user last had open in Obsidian), then the only site when there is just one.
 * Returns null when several sites exist and nothing picks between them — the caller asks rather than
 * guessing, since guessing would push one site's content to another site's WordPress.
 */
export async function resolveSite(dir: string, wanted?: string): Promise<string | null> {
  const keys = await listSites(dir);
  if (!keys.length) return null;
  if (wanted) {
    const key = siteKey(wanted);
    return keys.includes(key) ? key : null;
  }
  const state = await parse<{ activeDomain?: string }>(join(dir, STATE_FILE));
  if (state?.activeDomain && keys.includes(state.activeDomain)) return state.activeDomain;
  return keys.length === 1 ? keys[0]! : null;
}

/** True when this vault uses the per-site layout (the Obsidian plugin's). */
export const usesSitesLayout = async (dir: string): Promise<boolean> => (await listSites(dir)).length > 0;

/**
 * Read the vault's workspace, from whichever layout it uses. `site` picks one in a multi-site vault
 * (matched through `siteKey`, so "https://example.com/" and "example.com" both work).
 *
 * Returns null when there is no workspace at all AND when a multi-site vault needs a choice — callers
 * distinguish the two with `listSites`/`resolveSite` to give the right message.
 */
export async function readWorkspace(dir: string, site?: string): Promise<SiloWorkspace | null> {
  const key = await resolveSite(dir, site);
  if (key) return parse<SiloWorkspace>(sitePath(dir, key));
  // A vault that uses the per-site layout but couldn't resolve one must NOT fall through to the legacy
  // file: a stale workspace.json left beside sites/ would silently shadow the real, active site.
  if (await usesSitesLayout(dir)) return null;
  const p = workspacePath(dir);
  return existsSync(p) ? parse<SiloWorkspace>(p) : null;
}

/**
 * Write the workspace back into the layout the vault already uses — per-site if `sites/` exists (also
 * refreshing `state.json`, so Obsidian reopens on the site the CLI just worked on), legacy otherwise.
 * Never converts a vault between layouts: that is the plugin's migration to perform, and doing it from
 * here would make the other host's copy vanish exactly the way this module's header describes.
 */
export async function writeWorkspace(dir: string, ws: SiloWorkspace): Promise<void> {
  if (await usesSitesLayout(dir)) {
    const key = siteKey(ws.connection?.siteUrl ?? ws.profile?.url);
    const p = sitePath(dir, key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, JSON.stringify(ws, null, 2), 'utf8');
    await writeFile(join(dir, STATE_FILE), JSON.stringify({ activeDomain: key }, null, 2), 'utf8');
    return;
  }
  const p = workspacePath(dir);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(ws, null, 2), 'utf8');
}
