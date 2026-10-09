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
 * The detached child is a bet that a background process survives on the customer's machine — an AI tool
 * reaping the process tree it spawned breaks that bet, and the customer then clicks 批准 into a port
 * nobody listens on any more ("127.0.0.1 拒绝连接") with nothing left to recover it. So the port is
 * *predictable* instead of OS-assigned and is recorded in `login-state.json`, which lets any later
 * `puffergo login status` take the listener back over: the AI is already running that command in a loop,
 * so a lost click costs one more click and never costs a re-login. Both processes keep
 * `~/.puffergo/login-state.json` up to date for exactly that reason.
 */

import { spawn } from 'node:child_process';
import type * as AuthorizeServer from '../authorize/authorize-server';
import type { AuthorizedAppPasswordCredentials } from '../authorize/authorize-server';
import * as net from 'node:net';
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile, rename, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { upsertCredential, PUFFERGO_DIR } from '../adapters/credentials';
import { writeActiveDomain } from '../adapters/fileStore';

const WAIT_MS = 10 * 60 * 1000;
/** How long `login status` blocks by default — under the 2-minute command timeout AI tools use. */
const STATUS_WAIT_MS = 100 * 1000;
/** Slack on the 10-minute window before `login status` closes it: the waiter writes `failed` at its own
 *  deadline, so a takeover only ends the flow early once that could no longer happen. */
const WINDOW_GRACE_MS = 30 * 1000;
/** Ports the callback server tries to hold, in order. Predictable on purpose — a later process can only
 *  take the listener back over if it knows where to listen — and inside the dynamic range, where nothing
 *  a customer runs is likely to be. */
const CALLBACK_PORTS = [49512, 49513, 49514, 49515, 49516, 49517];

const LOGIN_STATE = join(PUFFERGO_DIR, 'login-state.json');
/** Test seam: keep the record of "which site, which port, has it landed" out of the real home dir. */
const loginStatePath = (): string => process.env.PUFFERGO_LOGIN_STATE || LOGIN_STATE;

export interface LoginState {
  siteUrl: string;
  /** `pending` until the browser comes back; then `approved`, or `failed` (denied / 10-minute timeout). */
  status: 'pending' | 'approved' | 'failed';
  startedAt: number;
  username?: string;
  /** The port the authorize URL redirects back to. Recorded so `login status` can take it over. */
  port?: number;
}

async function writeLoginState(state: LoginState, path = loginStatePath()): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), 'utf8');
}

async function readLoginState(path = loginStatePath()): Promise<LoginState | null> {
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
  // `rundll32`, not `cmd /c start`: the authorize URL carries `&`, which cmd.exe reads as a command
  // separator and hands the browser a truncated link.
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
        : ['xdg-open', [url]];
  try {
    spawn(cmd, args as string[], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch {
    /* the URL is printed too — the AI can hand it to the user */
  }
}

/** True when something already listens on `port` — our waiter, or anything else. A connect that hangs
 *  counts as held: stealing a port whose owner is merely slow is worse than waiting. */
function portIsHeld(port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise(held => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = (value: boolean): void => {
      socket.destroy();
      held(value);
    };
    socket.setTimeout(timeoutMs, () => done(true));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/** The first PufferGo callback port nothing is using, or 0 to let the OS pick when they all are. */
async function pickCallbackPort(): Promise<number> {
  for (const port of CALLBACK_PORTS) if (!(await portIsHeld(port, 150))) return port;
  return 0;
}

/** Save the grant (or its absence) where `login status`, the next command and the next session read it.
 *  Shared by the detached waiter and by a takeover, so both end the flow identically. */
async function finishLogin(
  siteUrl: string,
  dir: string,
  creds: AuthorizedAppPasswordCredentials | null,
  port?: number,
): Promise<void> {
  const startedAt = (await readLoginState())?.startedAt ?? Date.now();
  if (creds) {
    await upsertCredential({ siteUrl, username: creds.username, appPassword: creds.appPassword });
    await writeActiveDomain(dir, siteUrl);
    await writeLoginState({ siteUrl, status: 'approved', startedAt, username: creds.username, port });
  } else {
    await writeLoginState({ siteUrl, status: 'failed', startedAt, port });
  }
}

const NO_LOGIN = {
  ok: false,
  code: 'no_login',
  message: 'No authorization is in progress. Run `puffergo login <siteUrl>` first.',
};

const approvedOutput = (state: LoginState): unknown => ({
  ok: true,
  status: 'approved',
  siteUrl: state.siteUrl,
  username: state.username,
  next: 'Tell the user you saw the approval come through, then check what it can do with `puffergo products schema` (or `pages types`) and report the result.',
});

const failedOutput = (state: LoginState): unknown => ({
  ok: false,
  code: 'denied',
  status: 'failed',
  siteUrl: state.siteUrl,
  message:
    'WordPress came back without granting access (the approval was declined, or the 10-minute window ran out). Run `puffergo login <siteUrl>` again.',
});

export async function cmdLogin(dir: string, siteArg: string | undefined): Promise<unknown> {
  if (!siteArg) return { ok: false, code: 'error', message: 'usage: puffergo login <siteUrl>' };
  let siteUrl: string;
  try {
    siteUrl = normalizeSiteUrl(siteArg);
  } catch {
    return { ok: false, code: 'error', message: `Not a valid site URL: ${siteArg}` };
  }

  const port = await pickCallbackPort();
  await writeLoginState({ siteUrl, status: 'pending', startedAt: Date.now(), port });
  const handshakeDir = await mkdtemp(join(tmpdir(), 'puffergo-login-'));
  const handshake = join(handshakeDir, 'authorize-url');
  // Re-run this same script (bundle, or tsx entry with its loader flags) as the detached waiter.
  const child = spawn(
    process.execPath,
    [...process.execArgv, process.argv[1]!, '__login-wait', siteUrl, handshake, dir, String(port)],
    { detached: true, stdio: 'ignore', windowsHide: true },
  );
  child.unref();
  let spawnError = '';
  child.on('error', e => {
    spawnError = e.message;
  });

  // Wait (≤10 s) for the child to report the authorize URL.
  let authorizeUrl = '';
  for (let i = 0; i < 100 && !authorizeUrl; i++) {
    await new Promise(r => setTimeout(r, 100));
    authorizeUrl = await readHandshake(handshake);
  }
  await rm(handshakeDir, { recursive: true, force: true });
  if (!authorizeUrl) {
    await writeLoginState({ siteUrl, status: 'failed', startedAt: Date.now(), port });
    return {
      ok: false,
      code: 'error',
      message: `Could not start the local authorization listener.${spawnError ? ` ${spawnError}` : ''}`,
    };
  }

  await writeActiveDomain(dir, siteUrl);
  openBrowser(authorizeUrl);
  process.stderr.write('已在浏览器打开 WordPress 授权页：请在页面上点「批准」，完成后回到这里。\n');
  return {
    ok: true,
    pending: true,
    siteUrl,
    authorizeUrl,
    next:
      'Send `authorizeUrl` to the user verbatim too — the page may not have opened, or opened somewhere they cannot paste into. Never open it in your own built-in browser: the callback comes back to this machine, so it has to be the user\'s own browser. Tell them the authorization page is open and to click Approve (logging in to WordPress first if asked), then run `puffergo login status` right away — it waits for the click and answers by itself, so never ask the user to report back. If it returns `waiting`, tell the user you are still waiting and run it again. The link stays valid for 10 minutes.',
  };
}

/** The child writes the URL once, atomically: a reader that caught a half-written file would open a
 *  truncated authorize link, and WordPress would then redirect nowhere. */
async function writeHandshake(path: string, value: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, value, 'utf8');
  await rename(tmp, path);
}

async function readHandshake(path: string): Promise<string> {
  if (!existsSync(path)) return '';
  try {
    return (await readFile(path, 'utf8')).trim();
  } catch {
    return '';
  }
}

/**
 * `puffergo login status [--wait <seconds>]` — block until the detached waiter reports back.
 *
 * The callback server is ours and runs on this machine, so the approval is observable: this returns the
 * moment WordPress redirects back, and the AI can say "I saw you approve it" without asking.
 *
 * It is also *itself* the callback server whenever the detached waiter is gone: whoever can hold the
 * recorded port is where WordPress's redirect lands, so this command takes the port over rather than
 * polling a file a dead process will never write. That is what turns "the tool killed our background
 * listener" from a dead end into one more click for the customer.
 */
export async function cmdLoginStatus(dir: string, waitSeconds?: string): Promise<unknown> {
  const waitMs = waitSeconds ? Math.max(0, Number(waitSeconds) * 1000) : STATUS_WAIT_MS;
  if (Number.isNaN(waitMs))
    return { ok: false, code: 'usage', message: 'usage: puffergo login status [--wait <seconds>]' };

  let state = await readLoginState();
  if (!state) return NO_LOGIN;

  if (state.status === 'pending' && state.port) {
    const outcome = await holdCallbackPort(state, dir, waitMs);
    if (outcome === 'busy') {
      // The waiter is alive and owns the answer; watch the file it writes.
    } else if (outcome === 'approved' || outcome === 'denied') {
      const after = (await readLoginState()) ?? state;
      return outcome === 'approved' ? approvedOutput(after) : failedOutput(after);
    } else if (outcome === 'expired') {
      await finishLogin(state.siteUrl, dir, null, state.port);
      return failedOutput(state);
    } else if (outcome === 'moved') {
      return {
        ok: false,
        code: 'port_taken',
        status: 'failed',
        siteUrl: state.siteUrl,
        message:
          '本机授权回调用的端口被别的程序占了，刚才那个授权页已经作废。重新运行 `puffergo login <网站地址>`，把新链接发给客户。',
        next: 'Run `puffergo login <siteUrl>` again and send the user the new link.',
      };
    } else {
      // 'tookover': we held the port for the whole window and nothing arrived. The waiter was already dead
      // when we started, so a click the customer made in that gap went to a dead port — worth one more click.
      return {
        ok: true,
        status: 'waiting',
        siteUrl: state.siteUrl,
        tookOver: true,
        next:
          '本机接听的进程之前被打断过，客户那一次点击（如果已经点了）没有送到。请客户回到还开着的那个授权页，再点一次「批准」——就是再点一下，不用重新登录、不用复制任何东西；然后马上再运行 `puffergo login status`。',
      };
    }
  }

  const deadline = Date.now() + waitMs;
  state = await readLoginState();
  while (state?.status === 'pending' && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 300));
    state = await readLoginState();
  }
  if (!state) return NO_LOGIN;

  if (state.status === 'approved') return approvedOutput(state);
  if (state.status === 'failed') return failedOutput(state);
  return {
    ok: true,
    status: 'waiting',
    siteUrl: state.siteUrl,
    next: 'The user has not clicked Approve yet. Tell them you are still waiting on that browser page, then run `puffergo login status` again.',
  };
}

/** How a takeover ended. */
type Takeover = 'busy' | 'tookover' | 'approved' | 'denied' | 'moved' | 'expired';

/**
 * Be the one listening for WordPress's redirect, for up to `waitMs`.
 *
 * `busy` — the detached waiter still holds the port; watch the file it writes.
 * `tookover` — we held the port the whole window and no request arrived.
 * `approved` / `denied` — the callback landed on us and we saved it.
 * `moved` — the port got taken between the check and the bind, so the authorize URL points at nothing.
 * `expired` — the 10-minute window is over; nothing is coming.
 */
async function holdCallbackPort(state: LoginState, dir: string, waitMs: number): Promise<Takeover> {
  const port = state.port!;
  if (Date.now() > state.startedAt + WAIT_MS + WINDOW_GRACE_MS) return 'expired';
  if (await portIsHeld(port)) return 'busy';

  const window = Math.max(1000, Math.min(waitMs, state.startedAt + WAIT_MS - Date.now()));
  let timedOut = false;
  let moved = false;
  let bindFailed = false;
  const abort = new AbortController();
  const creds = await runAuthorizeServer(
    state.siteUrl,
    (_authorizeUrl, bound) => {
      if (bound !== port) {
        moved = true;
        abort.abort();
      }
    },
    {
      appName: 'PufferGo AI',
      timeoutMs: window,
      resultPage: RESULT_PAGE,
      port,
      onTimeout: () => {
        timedOut = true;
      },
      signal: abort.signal,
    },
  ).catch(() => {
    bindFailed = true;
    return null;
  });

  // The port got taken between the check and the bind: the authorize URL the customer is looking at now
  // points at nothing, which only a fresh `login` can fix.
  if (moved || bindFailed) return 'moved';
  if (creds) {
    await finishLogin(state.siteUrl, dir, creds, port);
    return 'approved';
  }
  // `null` is either a declined approval or our own window closing; only the second keeps the login
  // alive, because the customer may still click before the 10 minutes are up.
  return timedOut ? 'tookover' : 'denied';
}

/** Lazy + interop-tolerant: under tsx (source runs) the authorize module can load as CommonJS, so the
 *  named export sits on `default`; the esbuild bundle exposes it directly. Shared by the detached waiter
 *  and by `login status`'s takeover. */
async function runAuthorizeServer(
  siteUrl: string,
  onListening: (authorizeUrl: string, port: number) => void,
  opts: AuthorizeServer.AuthorizeServerOptions,
): Promise<AuthorizedAppPasswordCredentials | null> {
  type AuthzModule = typeof AuthorizeServer;
  const mod = (await import('../authorize/authorize-server')) as AuthzModule & {
    default?: AuthzModule;
  };
  const run = mod.runAuthorizeServer ?? mod.default!.runAuthorizeServer;
  return run(siteUrl, onListening, opts);
}

/** The detached child: owns the callback server, writes credentials, exits. Never prints anything. */
export async function cmdLoginWait(
  siteUrl: string,
  handshake: string,
  dir: string,
  portArg?: string,
): Promise<void> {
  const wanted = Number(portArg) > 0 ? Number(portArg) : undefined;
  let bound = wanted;
  const creds = await runAuthorizeServer(
    siteUrl,
    (authorizeUrl, port) => {
      bound = port;
      // The URL about to be handed out points at this port, so this is the one a later takeover listens on.
      if (wanted && port !== wanted) void rebindLoginState(siteUrl, port);
      void writeHandshake(handshake, authorizeUrl);
    },
    { appName: 'PufferGo AI', timeoutMs: WAIT_MS, resultPage: RESULT_PAGE, port: wanted },
  );
  await finishLogin(siteUrl, dir, creds, bound);
}

/** The requested port was busy, so the flow really lives on `bound` — keep the record honest about where. */
async function rebindLoginState(siteUrl: string, bound: number): Promise<void> {
  const current = await readLoginState();
  if (current && current.status !== 'pending') return; // never resurrect a finished login
  await writeLoginState({
    siteUrl,
    status: 'pending',
    startedAt: current?.startedAt ?? Date.now(),
    port: bound,
  });
}
