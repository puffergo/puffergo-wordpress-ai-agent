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
}

function configPath(dir: string): string {
  return join(dir, '.puffergo', 'config.json');
}

export async function readWorkdirConfig(dir: string): Promise<WorkdirConfig | null> {
  const path = configPath(dir);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    return typeof raw.siteUrl === 'string' ? { siteUrl: raw.siteUrl } : null;
  } catch {
    return null;
  }
}

export async function writeWorkdirConfig(dir: string, cfg: WorkdirConfig): Promise<void> {
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
