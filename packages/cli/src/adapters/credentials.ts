/**
 * Credential resolution for the CLI — the WP Application Password lives OUTSIDE the vault so it is never
 * synced/published with the notes and never shared. Default home is the branded `~/.puffergo/` dir.
 *
 * Store format (`~/.puffergo/credentials.json`), keyed by site URL so one machine serves many sites:
 *   { "sites": { "https://example.com": { "username": "admin", "appPassword": "xxxx …" } } }
 *
 * Resolution: an explicit path from `--config <path>` / `PUFFERGO_CONFIG` is authoritative (never falls
 * back to the global store on a miss, so a typo can't push with unexpected credentials); otherwise the
 * global store is used. A site is matched by normalized URL, and — so the pages/products channel can
 * resolve the vault's default site from `state.json`'s domain key — also by `siteKey`. The password is
 * only ever read here and handed to WpClient/AgentClient; it is never printed.
 */

import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { siteKey } from '@puffergo/silo-core';

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

/** The credential store in effect: `PUFFERGO_CONFIG` when set (so one run — or a test — can be pointed at
 *  its own store), else the global `~/.puffergo/credentials.json`. */
const storePath = (): string => process.env.PUFFERGO_CONFIG || GLOBAL_CREDENTIALS;

const isSite = (v: unknown): v is SiteCred =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as SiteCred).username === 'string' &&
  typeof (v as SiteCred).appPassword === 'string';

/** Parse a credentials file into the keyed form. Accepts both the multi-site `{sites:{}}` shape and the
 *  single-site `{siteUrl,username,appPassword}` shape. Returns null if unreadable/empty. */
async function readStore(path: string): Promise<CredStore | null> {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    if (raw.sites && typeof raw.sites === 'object') {
      const sites: Record<string, SiteCred> = {};
      for (const [url, v] of Object.entries(raw.sites as Record<string, unknown>)) if (isSite(v)) sites[url] = v;
      return { sites };
    }
    if (typeof raw.siteUrl === 'string' && isSite(raw)) {
      return { sites: { [raw.siteUrl]: { username: raw.username as string, appPassword: raw.appPassword as string } } };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve credentials for `siteUrl` (a full URL, or a bare domain key from `state.json`). `explicitPath`
 * comes from --config/PUFFERGO_CONFIG and is authoritative. When a store has exactly one site and
 * `siteUrl` isn't given, that single entry is used (convenience for single-site setups). Returns null
 * when nothing usable is found.
 */
export async function resolveCredential(
  siteUrl: string | undefined,
  explicitPath?: string,
): Promise<SiloConfig | null> {
  const store = await readStore(explicitPath ?? storePath());
  if (!store) return null;
  const urls = Object.keys(store.sites);
  const byNorm = new Map(urls.map(u => [normUrl(u), u]));
  // Known site: require an exact (normalized) URL match first, then a domain-key match (so a bare
  // `example.com` resolves `https://example.com`) — never silently use a DIFFERENT site's credentials.
  // Unknown site only: allow the single-site convenience pick.
  const pick = siteUrl
    ? (byNorm.get(normUrl(siteUrl)) ?? urls.find(u => siteKey(u) === siteKey(siteUrl)))
    : urls.length === 1
      ? urls[0]
      : undefined;
  if (!pick) return null;
  return { siteUrl: pick, ...store.sites[pick] };
}

/** List every site URL known to the credential store in effect — used to report `code:"no_site"` with
 *  the sites the user IS logged into, so the AI can ask "which one?" instead of guessing. */
export async function listCredentialSites(): Promise<string[]> {
  const store = await readStore(storePath());
  return store ? Object.keys(store.sites) : [];
}

/** Write/merge a site's credentials into the credential store in effect. */
export async function upsertCredential(cfg: SiloConfig, path: string = storePath()): Promise<void> {
  const existing = (await readStore(path)) ?? { sites: {} };
  existing.sites[cfg.siteUrl] = { username: cfg.username, appPassword: cfg.appPassword };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(existing, null, 2), { encoding: 'utf8', mode: 0o600 });
  await chmod(path, 0o600).catch(() => undefined); // mode only applies on create; tighten an older file too
}
