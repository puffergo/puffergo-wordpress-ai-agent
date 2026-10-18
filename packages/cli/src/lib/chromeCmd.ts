/**
 * `puffergo chrome …` — the header/footer nav menus as a declarative tree file, exactly the way
 * `products categories` works: get exports the tree, the agent edits the file (title, link,
 * description, target, nesting, order — all just fields), check dry-runs the diff, push writes it.
 *
 * "Chrome" is the site-wide frame: the header menu and the footer menu. Both are plain WordPress
 * nav menus, so this is item-level editing — never template or color work.
 *
 * Guarantees (the category-sync ones, mirrored by the plugin):
 *  - matched by `id`; a node without an id is created,
 *  - items the tree does not mention are left alone — NOTHING IS EVER DELETED (deleting is a
 *    wp-admin trip; every response carries editUrl),
 *  - a push that changed anything carries `previous` (the menu before) and the Polylang status —
 *    under a multilingual site, editing the source menu leaves the translated copies stale, and
 *    the agent must say so out loud instead of claiming the whole site was updated.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { AgentClient, AgentHttpError } from './agentClient';
import { ABILITIES_MISSING } from './siteSchema';
import { client, errorOutput, CodedError, type CmdCtx, type Out } from './siteCmd';

export const CHROME_USAGE =
  'puffergo chrome <get [--target <header|footer>] [--out <menu.json>]|check <menu.json>|push <menu.json>> [--target <header|footer>] [--site <url>]';

const TARGETS = ['header', 'footer'] as const;
type Target = (typeof TARGETS)[number];

export interface ChromeChange {
  op: string;
  node?: string;
  id?: number;
  title?: string;
  changed?: string[];
  [k: string]: unknown;
}

export interface ChromeResult {
  dry?: boolean;
  target?: string;
  menuId?: number;
  changes?: ChromeChange[];
  kept?: number;
  skipped?: ChromeChange[];
  leftAlone?: { id: number; title: string; url: string }[];
  leftAloneNote?: string;
  warnings?: string[];
  previous?: unknown[];
  menu?: Record<string, unknown> | null;
  editUrl?: string;
  polylang?: { active?: boolean; sourceMenuId?: number; stale?: boolean; [k: string]: unknown };
  header?: Record<string, unknown>;
  footer?: Record<string, unknown>;
  limits?: Record<string, unknown>;
}

/** The file `get --out` writes and `check`/`push` read: exactly the ability input. */
interface MenuFile {
  target: Target;
  menu: unknown[];
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
 * Read a menu file: `{"target":"header","menu":[…]}` — the shape `chrome get --out` writes.
 * A file with only `menu` is fine when the command line says `--target`. A bare top-level array
 * is accepted as the tree itself (target then required via --target or the flag).
 */
async function readMenuFile(file: string | undefined, verb: string, ctx: CmdCtx): Promise<MenuFile> {
  if (!file) throw new CodedError('usage', `用法：puffergo chrome ${verb} <menu.json>`);
  let raw: string;
  try {
    raw = await readFile(resolve(file), 'utf8');
  } catch {
    throw new CodedError('file_not_found', `未找到 menu 文件：${file}`, 'ai');
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new CodedError('invalid_json', `menu 文件不是合法 JSON：${e instanceof Error ? e.message : String(e)}`);
  }

  let target = '';
  let menu: unknown;
  if (Array.isArray(json)) {
    menu = json;
  } else if (json && typeof json === 'object') {
    const o = json as { target?: unknown; menu?: unknown; ops?: unknown };
    if (o.ops !== undefined)
      throw new CodedError(
        'invalid_json',
        '这份文件是旧的 ops 格式。菜单现在按树文件编辑：`chrome get --out menu.json` 导出，改文件（title/link/description/target/children/顺序），再 `chrome check` / `chrome push`。',
      );
    target = typeof o.target === 'string' ? o.target : '';
    menu = o.menu;
  } else {
    throw new CodedError('invalid_json', 'menu 文件顶层必须是 {"target":…,"menu":[…]} 或一个树节点数组。');
  }
  const flagTarget = ctx.flags.get('target') ?? '';
  if (flagTarget) target = flagTarget; // the command line wins over the file
  if (!target) throw new CodedError('invalid_json', 'menu 文件缺 "target"（header|footer），也可以用 --target 指定。');
  if (!TARGETS.includes(target as Target))
    throw new CodedError('invalid_json', `target 只能是 ${TARGETS.join(' | ')}，收到 "${target}"。`);
  if (!Array.isArray(menu))
    throw new CodedError('invalid_json', '"menu" 必须是一个树节点数组（可以为空数组，但字段得在）。');
  return { target: target as Target, menu };
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
// get — both menus; with --out, writes the editable tree file to disk
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
    const target = ctx.flags.get('target') ?? '';
    if (target && !TARGETS.includes(target as Target))
      return {
        ok: false,
        code: 'invalid_json',
        message: `--target 只能是 ${TARGETS.join(' | ')}，收到 "${target}"。`,
      } as Out;

    const outPath = ctx.flags.get('out');
    if (outPath) {
      // The file `check`/`push` read back: exactly the ability input, ready to edit.
      const t = (target || 'header') as Target;
      const payload = res[t] as { menu?: unknown[]; menuId?: number; editUrl?: string } | undefined;
      if (!payload || !Array.isArray(payload.menu))
        return {
          ok: false,
          code: 'update_plugin',
          fix: 'user',
          message: "This site's plugin returned no editable menu tree — update the PufferGo plugin.",
        } as Out;
      await writeFile(resolve(outPath), JSON.stringify({ target: t, menu: payload.menu }, null, 2) + '\n', 'utf8');
      return {
        ok: true,
        site: c.siteUrl,
        target: t,
        file: resolve(outPath),
        menuId: payload.menuId,
        items: payload.menu.length,
        note: `Menu tree written to ${outPath}. Edit the file (title / link / description / target / children / array order), then \`chrome check ${outPath}\` and \`chrome push ${outPath}\`. Nothing is ever deleted: items you remove from the file stay on the site (leftAlone) — deleting is a wp-admin action.`,
        editUrl: payload.editUrl,
        polylang: res.polylang,
      } as Out;
    }

    // No --out: print the whole read-only view (both menus), filtered to --target when given.
    const view: Out = { ok: true, site: c.siteUrl, ...res } as Out;
    if (target) {
      delete (view as Record<string, unknown>).header;
      delete (view as Record<string, unknown>).footer;
      (view as Record<string, unknown>)[target] = (res as Record<string, unknown>)[target];
    }
    return view;
  } catch (e) {
    return chromeError(e) ?? errorOutput(e);
  }
}

// ---------------------------------------------------------------------------
// check — the dry run: the create/update/keep diff, nothing written
// ---------------------------------------------------------------------------

export async function cmdChromeCheck(ctx: CmdCtx): Promise<Out> {
  let parsed: MenuFile;
  try {
    parsed = await readMenuFile(ctx.positional[0], 'check', ctx);
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
    const res = await c.planChrome<ChromeResult>(parsed.target, parsed.menu);
    const skipped = res.skipped ?? [];
    const out: Out = {
      ok: true,
      dry: true,
      site: c.siteUrl,
      target: res.target,
      menuId: res.menuId,
      changes: res.changes ?? [],
      kept: res.kept ?? 0,
      skipped,
      leftAlone: res.leftAlone ?? [],
      warnings: res.warnings ?? [],
      editUrl: res.editUrl,
      polylang: res.polylang,
    };
    if (skipped.length) {
      // A skip is never a guess the plugin made — it is a node the agent must fix (stale id,
      // unknown slug, link-type…) or drop on purpose. Fail loudly so it gets read before push.
      return {
        ...out,
        ok: false,
        code: 'chrome_skipped',
        fix: 'ai',
        message: `${skipped.length} node(s) would be skipped — read the reasons, fix the menu file (or drop them on purpose), and check again before push.`,
      } as Out;
    }
    return out;
  } catch (e) {
    return chromeError(e) ?? errorOutput(e);
  }
}

// ---------------------------------------------------------------------------
// push — write it; the response carries `previous` so a wrong push is undoable
// ---------------------------------------------------------------------------

export async function cmdChromePush(ctx: CmdCtx): Promise<Out> {
  let parsed: MenuFile;
  try {
    parsed = await readMenuFile(ctx.positional[0], 'push', ctx);
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
    const res = await c.applyChrome<ChromeResult>(parsed.target, parsed.menu);
    const skipped = res.skipped ?? [];
    const changes = res.changes ?? [];
    const note = polylangNote(res);

    // The menu as it was, next to the file being pushed — the undo, same convention as `profile set`.
    let previousFile: string | undefined;
    if (res.previous) {
      previousFile = resolve(dirname(ctx.positional[0]!), `${stripJson(ctx.positional[0]!)}.previous.json`);
      await writeFile(previousFile, JSON.stringify(res.previous, null, 2) + '\n', 'utf8');
    }

    return {
      ok: true,
      site: c.siteUrl,
      target: res.target,
      menuId: res.menuId,
      changes,
      kept: res.kept ?? 0,
      skipped,
      leftAlone: res.leftAlone ?? [],
      warnings: res.warnings ?? [],
      menu: res.menu,
      ...(previousFile ? { previous: previousFile } : {}),
      editUrl: res.editUrl,
      polylang: res.polylang,
      ...(note ? { polylangNote: note } : {}),
      ...(skipped.length
        ? {
            skippedNote: `${skipped.length} node(s) were skipped with reasons — report them to the user, do not present this as a clean success.`,
          }
        : {}),
    } as Out;
  } catch (e) {
    return chromeError(e) ?? errorOutput(e);
  }
}

function stripJson(file: string): string {
  return file.replace(/\.json$/i, '');
}
