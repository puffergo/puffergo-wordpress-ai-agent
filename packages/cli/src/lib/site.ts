/**
 * Site resolution for every `puffergo` command that isn't `login` (spec section 7):
 *   --site <url> flag → <workdir>/.puffergo/config.json → the only site in credentials → error.
 * Also the small `.puffergo/config.json` reader/writer `login` uses to remember a workdir's site.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveCredential, listCredentialSites, type ResolvedCredential } from '../adapters/credentials';

export interface WorkdirConfig {
  siteUrl: string;
  /** Off by default: live products and existing categories are left alone. Turned on only with the customer's words. */
  editLive?: { on: true; customerSaid: string; at: string };
}

function configPath(dir: string): string {
  return join(dir, '.puffergo', 'config.json');
}

export async function readWorkdirConfig(dir: string): Promise<WorkdirConfig | null> {
  const path = configPath(dir);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    if (typeof raw.siteUrl !== 'string') return null;
    return raw.editLive
      ? { siteUrl: raw.siteUrl, editLive: raw.editLive as WorkdirConfig['editLive'] }
      : { siteUrl: raw.siteUrl };
  } catch {
    return null;
  }
}

/** Logging in to a different site drops the edit-live switch; it belongs to the site it was turned on for. */
export async function writeWorkdirConfig(dir: string, cfg: WorkdirConfig): Promise<void> {
  const prev = await readWorkdirConfig(dir);
  if (!('editLive' in cfg) && prev?.editLive && prev.siteUrl === cfg.siteUrl) cfg = { ...cfg, editLive: prev.editLive };
  const path = configPath(dir);
  await mkdir(join(dir, '.puffergo'), { recursive: true });
  await writeFile(path, JSON.stringify(cfg, null, 2), 'utf8');
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

/** Resolve the credential for the site this command should act on, per the order in the spec. */
export async function resolveSite(dir: string, siteFlag: string | undefined): Promise<ResolvedCredential> {
  let siteUrl = siteFlag;
  if (!siteUrl) {
    const cfg = await readWorkdirConfig(dir);
    siteUrl = cfg?.siteUrl;
  }
  if (siteUrl) {
    const cred = await resolveCredential(dir, siteUrl);
    if (!cred) throw new NotLoggedInError(siteUrl);
    return cred;
  }
  // No explicit/remembered site: fall back to "the only site in credentials".
  const cred = await resolveCredential(dir, undefined);
  if (cred) return cred;
  const sites = await listCredentialSites();
  throw new NoSiteError(sites);
}

/** Whether this work folder may change live products and existing categories on `siteUrl`. */
export async function editLiveAllowed(dir: string, siteUrl: string): Promise<boolean> {
  const cfg = await readWorkdirConfig(dir);
  return !!cfg?.editLive?.on && cfg.siteUrl === siteUrl;
}
