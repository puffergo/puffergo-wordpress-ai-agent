/**
 * `puffergo login <siteUrl>` — WordPress's one-click Application Password flow, shaped for AI tools.
 *
 * AI tools run shell commands with a timeout (Claude Code: 2 min by default), but a person may take
 * longer to approve in the browser. So the command returns immediately: it spawns a DETACHED child
 * (`__login-wait`) that owns the one-shot 127.0.0.1 callback server for up to 10 minutes, waits for the
 * child to report the authorize URL, opens the browser, prints `{ok:true,pending:true,authorizeUrl}` and
 * exits. The child writes the credentials into ~/.puffergo/credentials.json when WordPress redirects
 * back, then exits.
 *
 * Both processes also keep `~/.puffergo/login-state.json` up to date, so the AI never has to ask the
 * customer whether they clicked: `puffergo login status` blocks until the child reports back (approved,
 * denied or timed out) and answers the moment the browser redirect lands.
 */

import { spawn } from 'node:child_process';
import type * as AuthorizeServer from '../authorize/authorize-server';
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile, mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { upsertCredential, PUFFERGO_DIR } from '../adapters/credentials';
import { writeWorkdirConfig } from './site';

const WAIT_MS = 10 * 60 * 1000;
/** How long `login status` blocks by default — under the 2-minute command timeout AI tools use. */
const STATUS_WAIT_MS = 100 * 1000;

const LOGIN_STATE = join(PUFFERGO_DIR, 'login-state.json');

export interface LoginState {
  siteUrl: string;
  /** `pending` until the browser comes back; then `approved`, or `failed` (denied / 10-minute timeout). */
  status: 'pending' | 'approved' | 'failed';
  startedAt: number;
  username?: string;
}

async function writeLoginState(state: LoginState, path = LOGIN_STATE): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), 'utf8');
}

async function readLoginState(path = LOGIN_STATE): Promise<LoginState | null> {
  try {
    const s = JSON.parse(await readFile(path, 'utf8')) as LoginState;
    return s && typeof s.siteUrl === 'string' && typeof s.status === 'string' ? s : null;
  } catch {
    return null;
  }
}

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

  await writeLoginState({ siteUrl, status: 'pending', startedAt: Date.now() });
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
    next: 'Tell the user the authorization page is open and to click Approve (logging in to WordPress first if asked), then run `puffergo login status` right away — it waits for the click and answers by itself, so never ask the user to report back. If it returns `waiting`, tell the user you are still waiting and run it again. The link stays valid for 10 minutes.',
  };
}

/**
 * `puffergo login status [--wait <seconds>]` — block until the detached waiter reports back.
 *
 * The callback server is ours and runs on this machine, so the approval is observable: this returns the
 * moment WordPress redirects back, and the AI can say "I saw you approve it" without asking.
 */
export async function cmdLoginStatus(waitSeconds?: string): Promise<unknown> {
  const waitMs = waitSeconds ? Math.max(0, Number(waitSeconds) * 1000) : STATUS_WAIT_MS;
  if (Number.isNaN(waitMs))
    return { ok: false, code: 'usage', message: 'usage: puffergo login status [--wait <seconds>]' };

  const deadline = Date.now() + waitMs;
  let state = await readLoginState();
  if (!state)
    return {
      ok: false,
      code: 'no_login',
      message: 'No authorization is in progress. Run `puffergo login <siteUrl>` first.',
    };

  while (state?.status === 'pending' && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 300));
    state = await readLoginState();
  }
  if (!state)
    return {
      ok: false,
      code: 'no_login',
      message: 'No authorization is in progress. Run `puffergo login <siteUrl>` first.',
    };

  if (state.status === 'approved')
    return {
      ok: true,
      status: 'approved',
      siteUrl: state.siteUrl,
      username: state.username,
      next: 'Tell the user you saw the approval come through, then check what it can do with `puffergo products schema` (or `pages types`) and report the result.',
    };
  if (state.status === 'failed')
    return {
      ok: false,
      code: 'denied',
      status: 'failed',
      siteUrl: state.siteUrl,
      message:
        'WordPress came back without granting access (the approval was declined, or the 10-minute window ran out). Run `puffergo login <siteUrl>` again.',
    };
  return {
    ok: true,
    status: 'waiting',
    siteUrl: state.siteUrl,
    next: 'The user has not clicked Approve yet. Tell them you are still waiting on that browser page, then run `puffergo login status` again.',
  };
}

/** The detached child: owns the callback server, writes credentials, exits. Never prints anything. */
export async function cmdLoginWait(siteUrl: string, handshake: string, dir: string): Promise<void> {
  // Lazy + interop-tolerant: under tsx (source runs) the authorize module can load as CommonJS, so the named
  // export sits on `default`; the esbuild bundle exposes it directly.
  type AuthzModule = typeof AuthorizeServer;
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
  const startedAt = (await readLoginState())?.startedAt ?? Date.now();
  if (creds) {
    await upsertCredential({ siteUrl, username: creds.username, appPassword: creds.appPassword });
    await writeWorkdirConfig(dir, { siteUrl });
    await writeLoginState({ siteUrl, status: 'approved', startedAt, username: creds.username });
  } else {
    await writeLoginState({ siteUrl, status: 'failed', startedAt });
  }
}
