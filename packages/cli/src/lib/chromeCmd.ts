/**
 * `puffergo chrome …` — the header/footer nav menus as structured data an AI can read and edit.
 *
 * "Chrome" is the site-wide frame: the header menu and the footer menu. Both are plain WordPress
 * nav menus, so this is item-level surgery (add/rename/move — deleting is a wp-admin trip, on
 * purpose), never template or color work.
 *
 * The shape mirrors `profile` and `products categories`: read first (`get`), show the user what
 * WOULD happen (`plan` — a dry run the plugin performs without writing), then `apply`. Every write
 * response carries `previous` (the menu as it was), the wp-admin deep link, and the Polylang
 * status — under a multilingual site, editing the source menu leaves the translated copies stale,
 * and the agent must say so out loud instead of claiming the whole site was updated.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AgentClient, AgentHttpError } from './agentClient';
import { ABILITIES_MISSING } from './siteSchema';
import { client, errorOutput, CodedError, type CmdCtx, type Out } from './siteCmd';

export const CHROME_USAGE =
  'puffergo chrome <get | plan <ops.json> | apply <ops.json>> [--target <header|footer>] [--dir <workdir>] [--site <url>]';

const TARGETS = ['header', 'footer'] as const;
type Target = (typeof TARGETS)[number];

export interface ChromeOpResult {
  op: string;
  kind?: string;
  reason?: string;
  message?: string;
  [k: string]: unknown;
}

export interface ChromeResult {
  dry?: boolean;
  target?: string;
  menuId?: number;
  planned?: ChromeOpResult[] | null;
  applied?: ChromeOpResult[] | null;
  skipped?: ChromeOpResult[];
  previous?: unknown[];
  menu?: Record<string, unknown> | null;
  editUrl?: string;
  polylang?: { active?: boolean; sourceMenuId?: number; stale?: boolean; [k: string]: unknown };
  header?: Record<string, unknown>;
  footer?: Record<string, unknown>;
  limits?: Record<string, unknown>;
}

/** An old plugin has no `*-chrome` abilities → the same "update the plugin" answer as everywhere else. */
function chromeError(e: unknown): Out | null {
  if (e instanceof AgentHttpError) {
    const code = (e.body as { code?: string } | undefined)?.code;
    if (code && ABILITIES_MISSING.has(code)) {
      return {
        ok: false,
        code: 'update_plugin',
        fix: 'user',
        message:
          "This site's PufferGo plugin is too old to read or edit the header/footer menus. In wp-admin, update the PufferGo plugin to the latest version, then try again.",
      };
    }
  }
  return null;
}

/**
 * Read an ops file: `{"target":"header","ops":[…]}`. A file with only `ops` is fine when the
 * command line says `--target`. A bare top-level array is accepted as the ops list itself.
 */
async function readOpsFile(
  file: string | undefined,
  verb: string,
  ctx: CmdCtx,
): Promise<{ target: Target; ops: unknown[] }> {
  if (!file) throw new CodedError('usage', `用法：puffergo chrome ${verb} <ops.json>`);
  let raw: string;
  try {
    raw = await readFile(resolve(file), 'utf8');
  } catch {
    throw new CodedError('file_not_found', `未找到 ops 文件：${file}`, 'ai');
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new CodedError('invalid_json', `ops 文件不是合法 JSON：${e instanceof Error ? e.message : String(e)}`);
  }

  let target = '';
  let ops: unknown;
  if (Array.isArray(json)) {
    ops = json;
  } else if (json && typeof json === 'object') {
    const o = json as { target?: unknown; ops?: unknown };
    target = typeof o.target === 'string' ? o.target : '';
    ops = o.ops;
  } else {
    throw new CodedError('invalid_json', 'ops 文件顶层必须是 {"target":…,"ops":[…]} 或一个 ops 数组。');
  }
  const flagTarget = ctx.flags.get('target') ?? '';
  if (!target && flagTarget) target = flagTarget;
  if (!target) {
    throw new CodedError('invalid_json', 'ops 文件缺 "target"（header|footer），也可以用 --target 指定。');
  }
  if (!TARGETS.includes(target as Target)) {
    throw new CodedError('invalid_json', `target 只能是 ${TARGETS.join(' | ')}，收到 "${target}"。`);
  }
  if (!Array.isArray(ops) || ops.length === 0) {
    throw new CodedError('invalid_json', '"ops" 必须是一个非空数组。');
  }
  return { target: target as Target, ops };
}

/** The stale-copy sentence every multilingual response has to carry into the user's face. */
function polylangNote(res: ChromeResult): string | undefined {
  const p = res.polylang;
  if (p?.active && p?.stale) {
    return 'The source menu was changed, but the translated copies (other languages) still show the OLD menu and nothing refreshes them automatically. Tell the user: the other languages need one re-translate pass in the Translation Center before they match.';
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// get — both menus, with ids to match on and the wp-admin link
// ---------------------------------------------------------------------------

export async function cmdChromeGet(ctx: CmdCtx): Promise<Out> {
  let c: AgentClient;
  try {
    c = await client(ctx);
  } catch (e) {
    return errorOutput(e);
  }
  try {
    const res = await c.getChrome<ChromeResult>();
    return { ok: true, site: c.siteUrl, ...res } as Out;
  } catch (e) {
    return chromeError(e) ?? errorOutput(e);
  }
}

// ---------------------------------------------------------------------------
// plan — the dry run: what each op would do, nothing written
// ---------------------------------------------------------------------------

export async function cmdChromePlan(ctx: CmdCtx): Promise<Out> {
  let parsed: { target: Target; ops: unknown[] };
  try {
    parsed = await readOpsFile(ctx.positional[0], 'plan', ctx);
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
    const res = await c.planChrome<ChromeResult>(parsed.target, parsed.ops);
    const skipped = res.skipped ?? [];
    const out: Out = {
      ok: true,
      dry: true,
      site: c.siteUrl,
      target: res.target,
      menuId: res.menuId,
      planned: res.planned ?? [],
      skipped,
      editUrl: res.editUrl,
      polylang: res.polylang,
    };
    if (skipped.length) {
      // A skip is never a guess the plugin made — it is an op the agent must fix (bad match,
      // unknown slug…) or drop on purpose. Fail loudly so it gets read before apply.
      return {
        ...out,
        ok: false,
        code: 'chrome_skipped',
        fix: 'ai',
        message: `${skipped.length} of ${parsed.ops.length} op(s) would be skipped — read the reasons, fix the ops file (or drop them on purpose), and plan again before apply.`,
      } as Out;
    }
    return out;
  } catch (e) {
    return chromeError(e) ?? errorOutput(e);
  }
}

// ---------------------------------------------------------------------------
// apply — write it; the response carries `previous` so a wrong batch is undoable
// ---------------------------------------------------------------------------

export async function cmdChromeApply(ctx: CmdCtx): Promise<Out> {
  let parsed: { target: Target; ops: unknown[] };
  try {
    parsed = await readOpsFile(ctx.positional[0], 'apply', ctx);
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
    const res = await c.applyChrome<ChromeResult>(parsed.target, parsed.ops);
    const skipped = res.skipped ?? [];
    const applied = res.applied ?? [];
    const note = polylangNote(res);
    return {
      ok: true,
      site: c.siteUrl,
      target: res.target,
      menuId: res.menuId,
      applied,
      skipped,
      menu: res.menu,
      previous: res.previous,
      editUrl: res.editUrl,
      polylang: res.polylang,
      ...(note ? { polylangNote: note } : {}),
      ...(skipped.length
        ? {
            skippedNote: `${skipped.length} op(s) were skipped with reasons — report them to the user, do not present this as a clean success.`,
          }
        : {}),
    } as Out;
  } catch (e) {
    return chromeError(e) ?? errorOutput(e);
  }
}
