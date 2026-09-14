/**
 * Credential resolution for the CLI — the WP Application Password lives OUTSIDE the vault so it is never
 * synced/published with the notes and never shared. Default home is the branded `~/.puffergo/` dir.
 *
 * Store format (`~/.puffergo/credentials.json`), keyed by site URL so one machine serves many sites:
 *   { "sites": { "https://example.com": { "username": "admin", "appPassword": "xxxx …" } } }
 *
 * Resolution order (first hit wins):
 *   1. an explicit path from `--config <path>` or `PUFFERGO_CONFIG`
 *   2. the global store `~/.puffergo/credentials.json`
 *   3. legacy `<vault>/silo.config.json` (older layout) — used with a deprecation warning
 *
 * A legacy single-site file `{ siteUrl, username, appPassword }` is also accepted anywhere and folded
 * into the keyed form. The password is only ever read here and handed to WpClient — never printed.
 */

import { readFile, writeFile, mkdir, rm, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

/** Normalize a site URL for matching (trim, drop trailing slashes) so http://x and http://x/ are equal. */
const normUrl = (u: string): string => u.trim().replace(/\/+$/, '');

export interface SiloConfig {
  siteUrl: string;
  username: string;
  appPassword: string;
}

interface SiteCred {
  username: string;
  appPassword: string;
}
interface CredStore {
  sites: Record<string, SiteCred>;
}

/** The branded, out-of-vault home for PufferGo CLI credentials. */
export const PUFFERGO_DIR = join(homedir(), '.puffergo');
export const GLOBAL_CREDENTIALS = join(PUFFERGO_DIR, 'credentials.json');
const LEGACY_VAULT_CONFIG = 'silo.config.json';

const isSite = (v: unknown): v is SiteCred =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as SiteCred).username === 'string' &&
  typeof (v as SiteCred).appPassword === 'string';

/** Parse a credentials file into the keyed form. Accepts both the multi-site `{sites:{}}` shape and the
 *  legacy single-site `{siteUrl,username,appPassword}` shape. Returns null if unreadable/empty. */
async function readStore(path: string): Promise<CredStore | null> {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    if (raw.sites && typeof raw.sites === 'object') {
      const sites: Record<string, SiteCred> = {};
      for (const [url, v] of Object.entries(raw.sites as Record<string, unknown>)) if (isSite(v)) sites[url] = v;
      return { sites };
    }
    // legacy single-site
    if (typeof raw.siteUrl === 'string' && isSite(raw)) {
      return { sites: { [raw.siteUrl]: { username: raw.username as string, appPassword: raw.appPassword as string } } };
    }
    return null;
  } catch {
    return null;
  }
}

export interface ResolvedCredential {
  config: SiloConfig;
  /** Where it came from — so the caller can nudge migration off the legacy in-vault location. */
  source: 'explicit' | 'global' | 'legacy-vault';
}

/**
 * Resolve credentials for `siteUrl` (the vault's site). `explicitPath` comes from --config/PUFFERGO_CONFIG.
 * When a store has exactly one site and `siteUrl` isn't found, that single entry is used (convenience for
 * single-site setups). Returns null when nothing usable is found.
 */
export async function resolveCredential(
  vaultDir: string,
  siteUrl: string | undefined,
  explicitPath?: string,
): Promise<ResolvedCredential | null> {
  // An explicit --config/PUFFERGO_CONFIG is AUTHORITATIVE: never silently fall back to the global/legacy
  // store on a typo or a miss (that would push with unexpected credentials).
  const candidates: { path: string; source: ResolvedCredential['source'] }[] = explicitPath
    ? [{ path: explicitPath, source: 'explicit' }]
    : [
        { path: GLOBAL_CREDENTIALS, source: 'global' },
        { path: join(vaultDir, LEGACY_VAULT_CONFIG), source: 'legacy-vault' },
      ];

  for (const { path, source } of candidates) {
    const store = await readStore(path);
    if (!store) continue;
    const urls = Object.keys(store.sites);
    const byNorm = new Map(urls.map(u => [normUrl(u), u]));
    // Known site (vault has a profile url): require an EXACT (normalized) match — never silently use a
    // DIFFERENT site's credentials. Unknown site only: allow the single-site convenience pick.
    const pick = siteUrl ? byNorm.get(normUrl(siteUrl)) : urls.length === 1 ? urls[0] : undefined;
    if (!pick) continue;
    return { config: { siteUrl: pick, ...store.sites[pick] }, source };
  }
  return null;
}

/** List every site URL known to the global credential store — used to report `code:"no_site"` with
 *  the sites the user IS logged into, so the AI can ask "which one?" instead of guessing. */
export async function listCredentialSites(storePath: string = GLOBAL_CREDENTIALS): Promise<string[]> {
  const store = await readStore(storePath);
  return store ? Object.keys(store.sites) : [];
}

/** Write/merge a site's credentials into a credential store (default: the global ~/.puffergo/ one). */
export async function upsertCredential(cfg: SiloConfig, storePath: string = GLOBAL_CREDENTIALS): Promise<void> {
  const existing = (await readStore(storePath)) ?? { sites: {} };
  existing.sites[cfg.siteUrl] = { username: cfg.username, appPassword: cfg.appPassword };
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(existing, null, 2), { encoding: 'utf8', mode: 0o600 });
  await chmod(storePath, 0o600).catch(() => undefined); // mode only applies on create; tighten an older file too
}

/** Move a legacy in-vault silo.config.json into a credential store (default global; honor an explicit
 *  target so `--config` isolates the operation) and delete the vault copy. Returns the site url migrated,
 *  or null if there was nothing to migrate. */
export async function migrateLegacyConfig(
  vaultDir: string,
  targetPath: string = GLOBAL_CREDENTIALS,
): Promise<string | null> {
  const legacyPath = join(vaultDir, LEGACY_VAULT_CONFIG);
  const store = await readStore(legacyPath);
  const url = store && Object.keys(store.sites)[0];
  if (!store || !url) return null;
  await upsertCredential({ siteUrl: url, ...store.sites[url] }, targetPath);
  await rm(legacyPath);
  return url;
}
