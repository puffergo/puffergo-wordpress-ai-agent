/**
 * `puffergo login <siteUrl>` — WordPress's one-click Application Password flow, shaped for AI tools.
 *
 * AI tools run shell commands with a timeout (Claude Code: 2 min by default), but a person may take
 * longer to approve in the browser. So the command returns immediately: it spawns a DETACHED child
 * (`__login-wait`) that owns the one-shot 127.0.0.1 callback server for up to 10 minutes, waits for the
 * child to report the authorize URL, opens the browser, prints `{ok:true,pending:true,authorizeUrl}` and
 * exits. The child writes the credentials into ~/.puffergo/credentials.json when WordPress redirects
 * back, then exits. The AI confirms with `puffergo products schema`.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { upsertCredential } from '../adapters/credentials';
import { writeWorkdirConfig } from './site';

const WAIT_MS = 10 * 60 * 1000;

const RESULT_PAGE = (ok: boolean): string => `<!doctype html><html><head><meta charset="utf-8"><title>PufferGo</title>
<style>html{font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1f2430;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f6f7fb}
div{text-align:center}</style></head><body><div>${
  ok ? '✅ 已授权，可以回到 AI 工具继续了。' : '❌ 没有拿到授权。可以回到 AI 工具重新运行登录。'
}<br><small style="color:#888">这个页面可以关闭了。</small></div></body></html>`;

/** `example.com` → `https://example.com`; keeps an explicit scheme; drops trailing slashes and paths
 *  like `/wp-admin`. */
export function normalizeSiteUrl(input: string): string {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  const u = new URL(s);
  const path = u.pathname.replace(/\/(wp-admin|wp-login\.php).*$/, '').replace(/\/+$/, '');
  return `${u.protocol}//${u.host}${path}`;
}

export function openBrowser(url: string): void {
  if (process.env.PUFFERGO_NO_BROWSER) return;
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
        : ['xdg-open', [url]];
  try {
    spawn(cmd, args as string[], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    /* the URL is printed too — the AI can hand it to the user */
  }
}

export async function cmdLogin(dir: string, siteArg: string | undefined): Promise<unknown> {
  if (!siteArg) return { ok: false, code: 'error', message: 'usage: puffergo login <siteUrl>' };
  let siteUrl: string;
  try {
    siteUrl = normalizeSiteUrl(siteArg);
  } catch {
    return { ok: false, code: 'error', message: `Not a valid site URL: ${siteArg}` };
  }

  const handshakeDir = await mkdtemp(join(tmpdir(), 'puffergo-login-'));
  const handshake = join(handshakeDir, 'authorize-url');
  // Re-run this same script (bundle, or tsx entry with its loader flags) as the detached waiter.
  const child = spawn(
    process.execPath,
    [...process.execArgv, process.argv[1]!, '__login-wait', siteUrl, handshake, dir],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();

  // Wait (≤10 s) for the child to report the authorize URL.
  let authorizeUrl = '';
  for (let i = 0; i < 100 && !authorizeUrl; i++) {
    await new Promise(r => setTimeout(r, 100));
    if (existsSync(handshake)) authorizeUrl = (await readFile(handshake, 'utf8')).trim();
  }
  await rm(handshakeDir, { recursive: true, force: true });
  if (!authorizeUrl) return { ok: false, code: 'error', message: 'Could not start the local authorization listener.' };

  await writeWorkdirConfig(dir, { siteUrl });
  openBrowser(authorizeUrl);
  process.stderr.write('已在浏览器打开 WordPress 授权页：请在页面上点「批准」，完成后回到这里。\n');
  return {
    ok: true,
    pending: true,
    siteUrl,
    authorizeUrl,
    next: 'Ask the user to click Approve in the browser (log in to WordPress first if asked), then run `puffergo products schema` to confirm. The link stays valid for 10 minutes.',
  };
}

/** The detached child: owns the callback server, writes credentials, exits. Never prints anything. */
export async function cmdLoginWait(siteUrl: string, handshake: string, dir: string): Promise<void> {
  // Lazy + interop-tolerant: under tsx (source runs) the authorize module can load as CommonJS, so the named
  // export sits on `default`; the esbuild bundle exposes it directly.
  type AuthzModule = typeof import('../authorize/authorize-server');
  const mod = (await import('../authorize/authorize-server')) as AuthzModule & {
    default?: AuthzModule;
  };
  const runAuthorizeServer = mod.runAuthorizeServer ?? mod.default!.runAuthorizeServer;
  const creds = await runAuthorizeServer(
    siteUrl,
    (authorizeUrl: string) => {
      void writeFile(handshake, authorizeUrl, 'utf8');
    },
    { appName: 'PufferGo AI', timeoutMs: WAIT_MS, resultPage: RESULT_PAGE },
  );
  if (creds) {
    await upsertCredential({ siteUrl, username: creds.username, appPassword: creds.appPassword });
    await writeWorkdirConfig(dir, { siteUrl });
  }
}
