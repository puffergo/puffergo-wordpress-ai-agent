/**
 * Site resolution for every `puffergo` command that isn't `login`:
 *   --site <url> flag → the folder's active site (.puffergo/state.json) → the only site in credentials
 *   → error listing the sites the user IS logged into.
 * The active-site pointer is shared with the silo channel (adapters/fileStore.ts), so one `--site` (or
 * one `login`) points BOTH channels at the same site, per site — the old workdir-level config.json could
 * only remember ONE site, which is how a folder ever drifted onto the wrong one.
 *
 * Per-site switches (edit-live) live in `.puffergo/sites/<domain>/config.json` — they belong to the site
 * they were turned on for and can no longer be dropped by logging into a different one.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { siteKey, siteConfigPath } from '@puffergo/silo-core';
import { resolveCredential, listCredentialSites, type SiloConfig } from '../adapters/credentials';
import { readActiveDomain, writeActiveDomain } from '../adapters/fileStore';

export interface SiteConfig {
  /** Off by default: live products and existing categories are left alone. Turned on only with the customer's words. */
  editLive?: { on: true; customerSaid: string; at: string };
}

export async function readSiteConfig(dir: string, siteUrl: string): Promise<SiteConfig> {
  const p = join(dir, siteConfigPath(siteKey(siteUrl)));
  if (!existsSync(p)) return {};
  try {
    const raw = JSON.parse(await readFile(p, 'utf8')) as SiteConfig;
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

export async function writeSiteConfig(dir: string, siteUrl: string, cfg: SiteConfig): Promise<void> {
  const p = join(dir, siteConfigPath(siteKey(siteUrl)));
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(cfg, null, 2), 'utf8');
}

export class NoSiteError extends Error {
  code = 'no_site' as const;
  constructor(public sites: string[]) {
    super('no_site');
  }
}
export class NotLoggedInError extends Error {
  code = 'not_logged_in' as const;
  constructor(public siteUrl: string) {
    super('not_logged_in');
  }
}

/** Resolve the credential for the site this command should act on, per the order in the module doc. */
export async function resolveSite(dir: string, siteFlag: string | undefined): Promise<ResolvedSite> {
  if (siteFlag) {
    const cred = await resolveCredential(siteFlag);
    if (!cred) throw new NotLoggedInError(siteFlag);
    // An explicit --site for a logged-in site becomes this folder's active site, as `login` would.
    await writeActiveDomain(dir, cred.siteUrl);
    return { config: cred };
  }
  const active = await readActiveDomain(dir);
  if (active) {
    const cred = await resolveCredential(active);
    if (!cred) throw new NotLoggedInError(active);
    return { config: cred };
  }
  // No explicit/remembered site: fall back to "the only site in credentials".
  const cred = await resolveCredential(undefined);
  if (cred) return { config: cred };
  throw new NoSiteError(await listCredentialSites());
}

export interface ResolvedSite {
  config: SiloConfig;
}

/** Whether this work folder may change live products and existing categories on `siteUrl`. */
export async function editLiveAllowed(dir: string, siteUrl: string): Promise<boolean> {
  return !!(await readSiteConfig(dir, siteUrl)).editLive?.on;
}
