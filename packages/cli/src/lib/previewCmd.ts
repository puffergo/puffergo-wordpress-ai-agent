/**
 * `silo view` — render the vault's silo as a real page the customer can look at.
 *
 * Why a file + the user's own browser, rather than the agent's built-in one: the graph is drawn on a
 * canvas by @antv/g6, asynchronously. An agent that opens a page and screenshots it tends to capture
 * the frame BEFORE the canvas has painted (verified: a screenshot of a canvas test page came back with
 * the canvas blank while the rest of the DOM had rendered). A real browser window has no such race, and
 * it's the only way the customer can actually pan/zoom/click the thing. So: write a self-contained HTML
 * file to a temp dir, then hand it to the OS.
 *
 * The page is READ-ONLY by construction. A `file://` page cannot write back to the vault, and the
 * WordPress Application Password deliberately never leaves this CLI (`~/.puffergo/credentials.json`),
 * so it is never inlined here. Editing and pushing stay CLI commands.
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { SiloWorkspace } from '@puffergo/silo-core';

/**
 * Where `silo view` writes the page: a temp dir, NOT the vault. The page is a 2MB regenerable artifact
 * — inside the vault it would ride along with Obsidian Sync/Publish and Git for no benefit. The name is
 * derived from the vault path so each vault keeps one stable file (re-running overwrites it rather than
 * piling up) and two vaults with the same folder name don't collide.
 */
export const previewPath = (dir: string): string => {
  const abs = resolve(dir);
  const hash = createHash('sha1').update(abs).digest('hex').slice(0, 8);
  const safe =
    basename(abs)
      .replace(/[^\w.-]+/g, '-')
      .slice(0, 40) || 'vault';
  return join(tmpdir(), 'puffergo-silo-preview', `${safe}-${hash}.html`);
};

/**
 * Locate the built preview bundle. Shipped INSIDE each Skill next to `puffergo.mjs` (the bundler copies
 * it there), so the common case is "same directory as this script". Falls back to the monorepo's build
 * output so `pnpm silo view` works in development without bundling first.
 */
function bundleDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    here,
    join(here, 'preview'),
    // dev: running from packages/silo-cli/src/lib via tsx
    resolve(here, '..', '..', '..', '..', 'dist', 'silo-preview'),
  ];
  return candidates.find(d => existsSync(join(d, 'preview.js'))) ?? null;
}

/**
 * Embed a value in a `<script>` as JSON. `JSON.stringify` alone is NOT safe here: a `</script>` inside
 * any string (a title, a meta description, an external link) would close the tag early and break the
 * page, and U+2028/U+2029 are literal line terminators in JS source but legal inside JSON strings.
 */
function inlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function renderPreviewHtml(ws: SiloWorkspace, sourceLabel: string, js: string, css: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(ws.profile?.name || 'Silo')} · Silo 预览</title>
<style>${css}</style>
</head>
<body style="margin:0">
<div id="app-container"></div>
<script>window.__SILO_PREVIEW__=${inlineJson({ workspace: ws, sourceLabel })};</script>
<script>${js}</script>
</body>
</html>
`;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Hand the file to the OS's default browser. Best-effort: a headless/CI box has no browser, and that
 *  must not fail the command — the file is written either way and the path is printed. */
function openInBrowser(file: string): boolean {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    const child = spawn(cmd, [file], {
      stdio: 'ignore',
      detached: true,
      ...(process.platform === 'win32' ? { shell: true } : {}),
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export interface ViewResult {
  file: string;
  opened: boolean;
}

/** Write the preview page for this workspace (temp dir by default, `outPath` to keep a copy elsewhere)
 *  and open it. Throws a plain Error the caller maps to a `{ok:false, code}` payload. */
export async function writePreview(
  ws: SiloWorkspace,
  dir: string,
  noOpen: boolean,
  outPath?: string,
): Promise<ViewResult> {
  const bundle = bundleDir();
  if (!bundle) {
    throw new Error('preview_bundle_missing');
  }
  const [js, css] = await Promise.all([
    readFile(join(bundle, 'preview.js'), 'utf8'),
    readFile(join(bundle, 'preview.css'), 'utf8').catch(() => ''),
  ]);
  const file = outPath ? resolve(outPath) : previewPath(dir);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, renderPreviewHtml(ws, basename(resolve(dir)) || dir, js, css), 'utf8');
  return { file, opened: noOpen ? false : openInBrowser(file) };
}
