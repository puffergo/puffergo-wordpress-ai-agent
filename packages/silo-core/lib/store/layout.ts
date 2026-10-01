/**
 * The on-disk layout of a PufferGo work folder / vault — the SINGLE source of truth for where every
 * local state file lives. Both hosts (silo-cli over `node:fs`, the Obsidian plugin over `app.vault`)
 * build their paths from these functions, so the two can never drift on where a workspace, a sync
 * fingerprint or an upload cache belongs — the same reason the frontmatter FORMAT lives in silo-core
 * while each host does its own I/O.
 *
 * Everything here returns a VAULT-RELATIVE path with forward slashes. The CLI joins it onto its work
 * dir with `node:path.join` (which normalizes separators per-platform); Obsidian uses it verbatim (its
 * Vault API is always vault-relative, forward-slash).
 *
 * One folder per site, so a folder pointed at several sites never mixes their state:
 *
 *   .puffergo/
 *     state.json                      ← which site is active (`{ activeDomain }`)
 *     sites/<domain>/
 *       workspace.json                ← the silo台账 (nodes / contents / keywords / edges)
 *       synced.json                   ← per-note sha256 fingerprints (what push/pull last saw)
 *       config.json                   ← per-site switches (edit-live…)
 *       uploads.json  post-bases.json  created.json  samples.json   ← the pages/products caches
 *       pages/<wpPostId>/…            ← block work files, kept under their site so ids can't collide
 *
 * `<domain>` is `siteKey(siteUrl)` — already file-name-safe on every platform (see model/migrate.ts).
 * Credentials are NEVER here: they live out-of-vault in `~/.puffergo/credentials.json` (see each host's
 * credentials adapter) so they can't sync/publish with the notes.
 */

/** The branded work-folder state dir (was split across `.silo/` + `.puffergo/`; now one name). */
export const PUFFERGO_STATE_DIR = '.puffergo';

/** Per-site folders live under here. */
export const SITES_DIR = `${PUFFERGO_STATE_DIR}/sites`;

/** Which site the folder is currently on: `{ activeDomain: string }`. A cross-site choice, so it sits
 *  at the root, not inside a site folder. */
export const STATE_PATH = `${PUFFERGO_STATE_DIR}/state.json`;

/** A site's own folder. */
export const siteDir = (domain: string): string => `${SITES_DIR}/${domain}`;

/** The silo台账 (SiloWorkspace) for one site. */
export const workspacePath = (domain: string): string => `${siteDir(domain)}/workspace.json`;

/** Per-note sync fingerprints for one site (was vault-level `.silo/synced.json` — a cross-site bug). */
export const syncedPath = (domain: string): string => `${siteDir(domain)}/synced.json`;

/** Per-site switches (edit-live…). */
export const siteConfigPath = (domain: string): string => `${siteDir(domain)}/config.json`;

/** A pages/products cache file for one site (`uploads.json`, `post-bases.json`, `created.json`,
 *  `samples.json`). Per-site now, so the cache is a plain object instead of a `{siteUrl: …}` dict. */
export const siteStatePath = (domain: string, file: string): string => `${siteDir(domain)}/${file}`;

/** Block work files for one post, under its site (so two sites' post id 42 can't share a folder). */
export const pagesDir = (domain: string, wpPostId: number | string): string =>
  `${siteDir(domain)}/pages/${wpPostId}`;
