/**
 * `puffergo profile …` — the site profile (brand, audience, trust data, keywords) as something an AI can
 * read before it writes, and write without a human copying text between windows.
 *
 * The profile is the one source every generated page, product and post is written from, so `get` is the
 * first thing to run before authoring anything for a site: it says what the site sells, who it sells to,
 * what it is proud of, and which of those are still blank.
 *
 * Everything that has to be enforced — products<=3, keywords<=30, the tone and channel whitelists — is
 * enforced by the plugin, not here: `check` is the same sanitizing pass `set` runs, just without writing.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { AgentClient, AgentHttpError } from './agentClient';
import { ABILITIES_MISSING } from './siteSchema';
import { client, errorOutput, CodedError, type CmdCtx, type Out } from './siteCmd';

export const PROFILE_USAGE =
  'puffergo profile <get|check <file.json>|set <file.json> [--replace] [--backup <file>]> [--dir <workdir>] [--site <url>]';

export interface ProfileCompleteness {
  filled: number;
  total: number;
  percent: number;
  missing: string[];
}

export interface ProfileWarning {
  field: string;
  kind: string;
  message: string;
}

export interface SiteProfileResult {
  profile?: Record<string, unknown>;
  limits?: Record<string, unknown>;
  completeness?: ProfileCompleteness;
  warnings?: ProfileWarning[];
  previous?: Record<string, unknown>;
  mode?: string;
  updatedAt?: string | null;
  written?: boolean;
}

/**
 * An old plugin simply has no `*-site-profile` abilities; core answers `rest_ability_not_found`. That is
 * not something the AI can fix in the file it is holding, so it becomes the same "update the plugin"
 * answer every other missing ability gives.
 */
function profileError(e: unknown): Out | null {
  if (e instanceof AgentHttpError) {
    const code = (e.body as { code?: string } | undefined)?.code;
    if (code && ABILITIES_MISSING.has(code)) {
      return {
        ok: false,
        code: 'update_plugin',
        fix: 'user',
        message:
          "This site's PufferGo plugin is too old to read or write the site profile. In wp-admin, update the PufferGo plugin to the latest version, then try again.",
      };
    }
  }
  return null;
}

/** Read a profile file, telling the agent apart "not there" from "not JSON" from "not an object". */
async function readProfileFile(file: string | undefined, verb: string): Promise<Record<string, unknown>> {
  if (!file) throw new CodedError('usage', `用法：puffergo profile ${verb} <file.json>`);
  let raw: string;
  try {
    raw = await readFile(resolve(file), 'utf8');
  } catch {
    throw new CodedError('file_not_found', `未找到 profile 文件：${file}`, 'ai');
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new CodedError('invalid_json', `profile 文件不是合法 JSON：${e instanceof Error ? e.message : String(e)}`);
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new CodedError('invalid_json', 'profile 文件顶层必须是一个对象（站点画像 JSON）。');
  }
  // A file holding `{"profile": {...}}` (what `get` prints, or what the ability takes) is accepted as-is.
  const inner = (json as { profile?: unknown }).profile;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return json as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// get — read the site's profile back, with what is still missing
// ---------------------------------------------------------------------------

export async function cmdProfileGet(ctx: CmdCtx): Promise<Out> {
  let c: AgentClient;
  try {
    c = await client(ctx);
  } catch (e) {
    return errorOutput(e);
  }
  try {
    const res = await c.getSiteProfile<SiteProfileResult>();
    return { ok: true, ...res } as Out;
  } catch (e) {
    return profileError(e) ?? errorOutput(e);
  }
}

// ---------------------------------------------------------------------------
// check — the same sanitizing pass `set` runs, without writing
// ---------------------------------------------------------------------------

export async function cmdProfileCheck(ctx: CmdCtx): Promise<Out> {
  let profile: Record<string, unknown>;
  try {
    profile = await readProfileFile(ctx.positional[0], 'check');
  } catch (e) {
    return errorOutput(e);
  }
  let c: AgentClient;
  try {
    c = await client(ctx);
  } catch (e) {
    return errorOutput(e);
  }
  try {
    const res = await c.validateSiteProfile<SiteProfileResult>(profile);
    const warnings = res.warnings ?? [];
    if (warnings.length) {
      return {
        ok: false,
        code: 'profile_warnings',
        fix: 'ai',
        message: `The profile would be saved, but ${warnings.length} thing(s) would be cut or changed — read them, fix the file, and run \`puffergo profile check\` again before \`set\`.`,
        warnings,
        profile: res.profile,
        completeness: res.completeness,
      };
    }
    return { ok: true, valid: true, profile: res.profile, completeness: res.completeness, warnings: [] } as Out;
  } catch (e) {
    return profileError(e) ?? errorOutput(e);
  }
}

// ---------------------------------------------------------------------------
// set — write it: merged into what is there by default, whole with --replace
// ---------------------------------------------------------------------------

export async function cmdProfileSet(ctx: CmdCtx): Promise<Out> {
  let profile: Record<string, unknown>;
  try {
    profile = await readProfileFile(ctx.positional[0], 'set');
  } catch (e) {
    return errorOutput(e);
  }
  const replace = ctx.flags.get('replace') === 'true' || ctx.flags.get('replace') === '';
  let c: AgentClient;
  try {
    c = await client(ctx);
  } catch (e) {
    return errorOutput(e);
  }
  try {
    const res = await c.updateSiteProfile<SiteProfileResult>(profile, replace ? 'replace' : 'merge');

    // The profile as it was: `set` overwrote it, so keeping it on disk is what makes a merge that went
    // the wrong way undoable — send it back with --replace.
    const backup =
      ctx.flags.get('backup') ?? resolve(dirname(ctx.positional[0]!), `${stripJson(ctx.positional[0]!)}.previous.json`);
    if (res.previous) {
      await writeFile(backup, JSON.stringify({ profile: res.previous }, null, 2) + '\n', 'utf8');
    }

    return {
      ok: true,
      mode: res.mode ?? 'merge',
      site: c.siteUrl,
      completeness: res.completeness,
      warnings: res.warnings ?? [],
      previous: backup,
      note: 'Merged into the existing profile — blocks the file does not mention were left as they were. To undo, run `puffergo profile set <file> --replace` with the previous-profile file below.',
    } as Out;
  } catch (e) {
    return profileError(e) ?? errorOutput(e);
  }
}

function stripJson(file: string): string {
  return file.replace(/\.json$/i, '');
}
