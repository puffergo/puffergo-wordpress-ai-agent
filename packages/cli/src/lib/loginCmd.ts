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
import { sandboxFreeEnv } from './sandboxEnv';
import type * as AuthorizeServer from '../authorize/authorize-server';
import type { AuthorizedAppPasswordCredentials } from '../authorize/authorize-server';
import * as net from 'node:net';
import { existsSync } from 'node:fs';
import { readdir, readFile, rm, writeFile, rename, mkdir, mkdtemp } from 'node:fs/promises';
import { nodeNetwork } from '../adapters/nodeNetwork';
import { tmpdir } from 'node:os';
import { customerVisibleDirs } from './locate';
import { dirname, join } from 'node:path';
import { upsertCredential, PUFFERGO_DIR } from '../adapters/credentials';
import { writeActiveDomain } from '../adapters/fileStore';
import { siteKey } from '@puffergo/silo-core';

const WAIT_MS = 10 * 60 * 1000;
/**
 * How long `login status` blocks by default.
 *
 * Deliberately short. This command is the ONLY reliable listener in environments that reap background
 * processes (AI tool sandboxes kill the detached waiter the moment the parent command returns), so the
 * answer is "hold the port briefly, then be asked again" — a 100-second block gets killed by a 120-second
 * tool timeout and takes the port down with it, which is strictly worse than returning early. Sixty
 * seconds leaves room for the tool's own overhead and still gives the customer time to click.
 */
const STATUS_WAIT_MS = 60 * 1000;
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
  /**
   * How many times a `login status` run held the port for its whole window and caught nothing. Two of
   * those means the click keeps landing outside every listening window — the callback route is not
   * working in this environment, and telling the customer to click a fourth time is just guessing. The
   * count is what turns that judgement into a fact.
   */
  takeovers?: number;
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

const RESULT_PAGE = (ok: boolean, problem?: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"><title>PufferGo</title>
<style>html{font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1f2430;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f6f7fb}
div{text-align:center;max-width:32em;padding:0 1.5em}</style></head><body><div>${
  ok ? '✅ 已授权，可以回到 AI 工具继续了。' : '❌ 没有拿到授权。可以回到 AI 工具重新运行登录。'
}${
    problem ? `<br><small style="color:#c0392b">保存凭据失败：${problem}</small>` : ''
  }<br><small style="color:#888">这个页面可以关闭了。</small></div></body></html>`;

export const LOGIN_USAGE = [
  'puffergo login <siteUrl>                                    授权一个站点（浏览器回传，推荐）',
  'puffergo login status [--wait <seconds>]                    查看/继续等待授权结果',
  'puffergo login from-url --site <url> --file <path> [--user <u>]   客户把地址栏那条回调 URL 粘进文件，从里面取回密码（回传丢了就用这条）',
  'puffergo login app-password --site <url> --file <path> [--user <u>]   客户在后台生成应用密码写进文件（最稳的兜底）',
  'puffergo login doctor                                       自检：端口有没有人在听、状态属于哪个站',
].join('\n');

/** `example.com` → `https://example.com`; keeps an explicit scheme; drops trailing slashes and paths
 *  like `/wp-admin`. */
export function normalizeSiteUrl(input: string): string {
  const raw = input.trim();
  if (!raw) throw new Error('empty site URL');
  // A flag that reached here is a caller bug (`login --help`), not a site. Accepting it writes
  // `https://--help` into the shared login state and burns a callback port — the next real login then
  // silently belongs to a domain that does not exist. Refuse loudly instead.
  if (raw.startsWith('-')) throw new Error(`"${raw}" is a flag, not a site URL`);
  let s = raw;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  const u = new URL(s);
  const host = u.hostname.toLowerCase();
  // A real site always has a dot (or is localhost / a bare IP). `new URL()` happily accepts single-label
  // hosts, so without this check every typo becomes a plausible-looking "site".
  const singleLabel =
    host === 'localhost' || host.endsWith('.local') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  if (!singleLabel && !host.includes('.')) throw new Error(`"${host}" is not a domain (no dot)`);
  if (host.split('.').some(label => !label || /^-|-$/.test(label)))
    throw new Error(`"${host}" is not a valid domain`);
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

/** POSIX shell single-quote escape — the waiter command line goes through `/bin/sh -c`. */
const shQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * Start the callback listener so that it outlives THIS command.
 *
 * `spawn(..., { detached: true })` only starts a new process GROUP. AI tool sandboxes reap the whole
 * process TREE when the command returns (or times out), so a detached child still dies with its parent —
 * and the customer's click then lands on a closed port, which is exactly the failure that makes the
 * approval look "lost". Routing through `( nohup … & )` fixes the tree instead of the group: the waiter
 * is a child of a short-lived shell, that shell exits at once, and the waiter is reparented to
 * init/launchd — no longer a descendant of the tool's process. Portable: macOS ships no `setsid`.
 *
 * The waiter writes to a log file rather than /dev/null, because when the callback never arrives the log
 * is the only record of what the listener actually did.
 */
function spawnWaiter(
  siteUrl: string,
  handshake: string,
  dir: string,
  port: number,
): { pidFile: string; logFile: string; error: string } {
  const tag = `${process.pid}-${port || 'auto'}`;
  const pidFile = join(tmpdir(), `puffergo-login-${tag}.pid`);
  const logFile = join(tmpdir(), `puffergo-login-${tag}.log`);
  // The waiter writes its own pid too (see `cmdLoginWait`). POSIX could rely on the shell's `echo $!`,
  // but Windows has no shell to echo it — without this the pid file never appears there and `pidAlive`
  // is permanently false, which reads as "the listener died" when it is usually alive.
  const args = [
    ...process.execArgv,
    process.argv[1]!,
    '__login-wait',
    siteUrl,
    handshake,
    dir,
    String(port),
    pidFile,
  ];

  if (process.platform === 'win32') {
    // Windows has no shell-parent trick that survives: `detached` already means a new process group and
    // there is no reparenting to init. `login status`'s takeover is the fallback there, by design.
    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: sandboxFreeEnv(),
    });
    child.unref();
    let error = '';
    child.on('error', e => {
      error = e.message;
    });
    return { pidFile, logFile, error };
  }

  const line = [process.execPath, ...args].map(shQuote).join(' ');
  const script = `( nohup ${line} >${shQuote(logFile)} 2>&1 & echo $! > ${shQuote(pidFile)} )`;
  const shell = spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore', env: sandboxFreeEnv() });
  shell.unref();
  let error = '';
  shell.on('error', e => {
    error = e.message;
  });
  return { pidFile, logFile, error };
}

/** The waiter writes its pid a beat after the shell starts; give it a moment before concluding "none". */
async function readPid(path: string, attempts = 20): Promise<number | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const n = Number((await readFile(path, 'utf8')).trim());
      if (Number.isFinite(n) && n > 0) return n;
    } catch {
      /* not written yet */
    }
    await new Promise(r => setTimeout(r, 50));
  }
  return null;
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
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

/** The first PufferGo callback port we can actually hold, or 0 to let the OS pick when none of them work
 *  out — which costs the takeover below, never the login itself.
 *
 *  This binds rather than knocks: Windows reserves whole ranges for Hyper-V / WinNAT, and a port inside
 *  one answers `EACCES` to our listener while looking perfectly free to a connect probe. Trusting the
 *  probe would hand the customer a login that dies the moment the waiter tries to bind it. */
async function pickCallbackPort(): Promise<number> {
  for (const port of CALLBACK_PORTS) if (await portIsUsable(port)) return port;
  return 0;
}

function portIsUsable(port: number): Promise<boolean> {
  return new Promise(usable => {
    const probe = net.createServer();
    probe.once('error', () => usable(false));
    probe.once('listening', () => probe.close(() => usable(true)));
    probe.listen(port, '127.0.0.1');
  });
}

/** Save the grant (or its absence) where `login status`, the next command and the next session read it.
 *  Shared by the detached waiter and by a takeover, so both end the flow identically.
 *
 *  Returns a human-readable problem when the credential could not be written, so the caller can show it on
 *  the browser's result page instead of a ✅ for a grant that never reached disk. */
async function finishLogin(
  siteUrl: string,
  dir: string,
  creds: AuthorizedAppPasswordCredentials | null,
  port?: number,
): Promise<string | null> {
  const startedAt = (await readLoginState())?.startedAt ?? Date.now();
  if (!creds) {
    await writeLoginState({ siteUrl, status: 'failed', startedAt, port });
    return null;
  }
  try {
    await upsertCredential({ siteUrl, username: creds.username, appPassword: creds.appPassword });
    await writeActiveDomain(dir, siteUrl);
    await writeLoginState({ siteUrl, status: 'approved', startedAt, username: creds.username, port });
    return null;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await writeLoginState({ siteUrl, status: 'failed', startedAt, port }).catch(() => {});
    return message;
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
    'WordPress came back without granting access (the approval was declined, or the 10-minute window ran out). Run `puffergo login <siteUrl>` again. If the callback is blocked by a WAF or a local proxy, use the fallback: have the customer generate an Application Password in wp-admin, write it to a file, then run `puffergo login app-password --site <url> --file <path> --user <username>` — the AI passes only the path, never the password.',
});

/**
 * The login card `site password` wrote sits on the customer's Desktop. Return its NAME only — never its
 * contents — so the AI can say "open **<domain>-登录信息.txt**" instead of "some file on your
 * desktop". A miss is harmless: the fallback wording still tells the customer where to look.
 */
async function findLoginCard(siteUrl: string): Promise<string | null> {
  try {
    const host = new URL(siteUrl).hostname.replace(/^www\./i, '');
    const found = await Promise.all(
      customerVisibleDirs().map(async dir => {
        try {
          return (await readdir(dir)).filter(n => /登录信息.*\.txt$/i.test(n));
        } catch {
          return [];
        }
      }),
    );
    const cards = found.flat();
    return cards.find(n => host.split('.').some(part => part.length > 2 && n.includes(part))) ?? null;
  } catch {
    return null;
  }
}

/** The customer's browser was opened for them; the link in chat is the FALLBACK, not the main route.
 *  Phrased as a blockquote the AI can paste verbatim — bold on the things they must actually do. */
function loginScript(authorizeUrl: string, cardName: string | null): string {
  const file = cardName ? `**${cardName}**` : '桌面上那个「**<域名>-登录信息.txt**」文件';
  return [
    '**授权页面已经在你的浏览器里自动打开了**，请在那个窗口里操作，不用回到这里。',
    '',
    `> **① 如果看到 WordPress 登录页**（有 Username / Password 两个输入框）——**这是正常的，不是出错**。账号和密码在你电脑桌面的 ${file} 里，打开它，把里面的**用户名**和**密码**复制过来填进去。**记得勾上 Remember Me**，以后就不用再登录了。旁边那张示意图标了要填的四个位置。`,
    '',
    '> **② 登录之后会看到「PufferGo AI 想要访问你的账户」这类提示——点 Approve / 批准。** 点完就完成了，可以关掉那个页面。',
    '',
    `> **③ 如果浏览器没弹出来、被不小心关掉了，或者你想用另一个浏览器**：回到这个聊天窗口，**点这个链接** ${authorizeUrl} ——也可以**复制整个链接**粘贴到浏览器地址栏。链接 10 分钟内有效。`,
    '',
    'Show the login-page illustration from the skill\'s `images/wp-login-annotated.png` next to step ① — customers recognise the screen far faster than a description, and it makes "you are supposed to see this" unmistakable.',
    'Never open `authorizeUrl` in your own built-in browser: the callback must land in the customer\'s browser on this machine.',
    'Then run `puffergo login status` IMMEDIATELY — it waits for the click and answers by itself, so do NOT ask the customer to report back. If it returns `waiting`, say you are still waiting and run it again.',
  ].join('\n');
}

export async function cmdLogin(dir: string, siteArg: string | undefined): Promise<unknown> {
  if (!siteArg) return { ok: false, code: 'usage', message: LOGIN_USAGE };
  let siteUrl: string;
  try {
    siteUrl = normalizeSiteUrl(siteArg);
  } catch (e) {
    return {
      ok: false,
      code: 'bad_url',
      message: `${e instanceof Error ? e.message : String(e)} — \`puffergo login\` needs a real site URL, e.g. \`puffergo login https://example.com\`. Nothing was changed.`,
    };
  }

  // Replacing a live login silently is how the state file ends up describing a site nobody is authorizing.
  const previous = await readLoginState();
  const replaced =
    previous && previous.status === 'pending' && Date.now() < previous.startedAt + WAIT_MS
      ? { siteUrl: previous.siteUrl, port: previous.port }
      : null;

  const port = await pickCallbackPort();
  await writeLoginState({ siteUrl, status: 'pending', startedAt: Date.now(), port });
  const handshakeDir = await mkdtemp(join(tmpdir(), 'puffergo-login-'));
  const handshake = join(handshakeDir, 'authorize-url');
  // Re-run this same script (bundle, or tsx entry with its loader flags) as the waiter.
  const waiter = spawnWaiter(siteUrl, handshake, dir, port);

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
      message: `Could not start the local authorization listener.${waiter.error ? ` ${waiter.error}` : ''} The waiter log is at ${waiter.logFile}. You can still authorize without a listener: have the customer open the authorize page, approve, then copy the address bar (it starts with http://127.0.0.1:) into a text file and run \`puffergo login from-url --site <url> --file <path>\`.`,
    };
  }

  await writeActiveDomain(dir, siteUrl);
  openBrowser(authorizeUrl);
  const cardName = await findLoginCard(siteUrl);
  process.stderr.write('已在浏览器打开 WordPress 授权页：如需登录，账号密码在桌面的登录信息文件里。\n');

  // The waiter now lives outside this command's process tree, but "should survive" is not "did survive".
  // Saying "I am watching the page" when nothing is listening is how a customer clicks Approve into the
  // void, so check — right now, while we still control the message the AI will repeat back.
  const boundPort = Number(new URL(authorizeUrl).port) || port;
  const pid = await readPid(waiter.pidFile);
  const waiterAlive = pid ? processAlive(pid) : false;
  const listening = boundPort > 0 && (await portIsHeld(boundPort));

  return {
    ok: true,
    pending: true,
    siteUrl,
    authorizeUrl,
    listener: {
      alive: listening,
      port: boundPort,
      pid,
      pidAlive: waiterAlive,
      logFile: waiter.logFile,
      note: listening
        ? 'A process outside this command owns the callback port, so the click will be received even after this command returns.'
        : 'Nothing is holding the callback port. Run `puffergo login status` right now — it takes the port over itself and waits — and run it again as soon as it returns. Do NOT tell the customer to click before that command is running.',
    },
    ...(replaced ? { replaced } : {}),
    ...(cardName ? { loginCard: cardName } : {}),
    script: loginScript(authorizeUrl, cardName),
    next: listening
      ? 'Send `script` to the customer as your next message — it already covers the main route (the browser we just opened) and the fallback (the link in chat). The listener outlives this command, so the customer can click whenever they get there; still run `puffergo login status` to hear about it. Do not shorten the script to "click Approve": the customer may be looking at a LOGIN page, not the approval screen.'
      : 'The listener did not survive. Run `puffergo login status` NOW (it takes the callback port over and waits up to a minute) and re-run it while the customer clicks. If that also reports `tookover`, stop trying — run `puffergo login doctor` and switch to the no-listener route rather than asking the customer to click again.',
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
    } else if (outcome === 'grant_failed') {
      return {
        ok: false,
        code: 'grant_failed',
        siteUrl: state.siteUrl,
        message: `WordPress 确实批准了，但本机没能把凭据写到磁盘，所以这次授权作废了。再看一次磁盘空间和 ~/.puffergo 的写权限，然后重新运行 \`puffergo login ${state.siteUrl}\`。别再让客户点一次批准——点了也存不下来。`,
        next: 'Diagnose the write failure (disk space / permissions on ~/.puffergo), then run `puffergo login <siteUrl>` again. Do not ask the customer to approve again until the cause is fixed.',
      };
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
      // when we started, so a click the customer made in that gap went to a dead port — worth one more
      // click. Twice is not: at that point the click keeps landing outside every listening window, and
      // asking a third time is guessing rather than diagnosis.
      const latest = (await readLoginState()) ?? state;
      if (latest.status !== 'pending') {
        return latest.status === 'approved' ? approvedOutput(latest) : failedOutput(latest);
      }
      const takeovers = (latest.takeovers ?? 0) + 1;
      await writeLoginState({ ...latest, takeovers });

      if (takeovers >= 2) {
        return {
          ok: false,
          code: 'callback_unreliable',
          status: 'waiting',
          siteUrl: latest.siteUrl,
          takeovers,
          message:
            '连续两次占住回调端口都没等到回传——这个环境里浏览器回传确实收不到，再让客户点第三次没有意义，那不是他点错。',
          next: `Stop asking for clicks. Pick a listener-free route:
  (a) If the customer's browser still has the callback URL in its address bar (it starts with http://127.0.0.1: and contains &password=), have them copy that WHOLE line into a text file on their machine, then run \`puffergo login from-url --site ${latest.siteUrl} --file <path>\`. You pass only the path — the password never enters your context.
  (b) Otherwise have them generate an Application Password in wp-admin → Users → Profile → Application Passwords, write it to a file, and run \`puffergo login app-password --site ${latest.siteUrl} --file <path> --user <username>\`.`,
        };
      }

      return {
        ok: true,
        status: 'waiting',
        siteUrl: latest.siteUrl,
        tookOver: true,
        takeovers,
        listener: { alive: false, note: 'The callback port was held by this command and released on return.' },
        next: `窗口主已经关掉了，客户那一瞬间点的话没送到（不是他点错，也不是网站的问题）。马上再运行一次 \`puffergo login status\` —— 它每一轮都会重新占住回调端口；只要它还在跑，客户点「批准」就一定收得到。**这是最后一次尝试**：如果这次还是 \`tookover\`，命令会直接告诉你改用不需要监听的路子，别再让客户点。`,
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
    listener: {
      alive: state.port ? await portIsHeld(state.port) : false,
      port: state.port,
      note: 'This command held the port while it ran; it is released now that you have the answer.',
    },
    next: `Still waiting — and the port is free again now that this command returned, so a click made in the next few seconds would be lost. Run \`puffergo login status\` again immediately, and keep doing that until it says approved. Each run listens for about a minute. Do NOT ask the customer to report back — say you are watching the page and keep the loop going.`,
  };
}

/** How a takeover ended. */
type Takeover = 'busy' | 'tookover' | 'approved' | 'denied' | 'moved' | 'expired' | 'grant_failed';

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
  let grantFailed = '';
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
      onGrant: async granted => {
        const problem = await finishLogin(state.siteUrl, dir, granted, port);
        if (problem) grantFailed = problem;
        return problem;
      },
    },
  ).catch(() => {
    bindFailed = true;
    return null;
  });

  // The port got taken between the check and the bind: the authorize URL the customer is looking at now
  // points at nothing, which only a fresh `login` can fix.
  if (moved || bindFailed) return 'moved';
  // `finishLogin` already stored the grant (that is what `onGrant` is for) — nothing left to write here.
  if (creds) return 'approved';
  if (grantFailed) return 'grant_failed';
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
  pidFile?: string,
): Promise<void> {
  // Announce ourselves before doing anything else: the parent polls this file to tell "listener alive"
  // from "listener got reaped", and on Windows this is the only writer (there is no shell `echo $!`).
  if (pidFile) await writeFile(pidFile, String(process.pid), 'utf8').catch(() => {});
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
    {
      appName: 'PufferGo AI',
      timeoutMs: WAIT_MS,
      resultPage: RESULT_PAGE,
      port: wanted,
      onGrant: granted => finishLogin(siteUrl, dir, granted, bound),
    },
  );
  // A saved grant already wrote `approved`. A decline (or a window that closed) still has to record
  // `failed`, so a later `login status` reports the truth instead of waiting on a dead process.
  if (!creds) await finishLogin(siteUrl, dir, null, bound);
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

/**
 * `puffergo login app-password` — the fallback for when the 127.0.0.1 callback cannot get through
 * (Hostinger's WAF reads `success_url=http://127.0.0.1…` as SSRF and returns 403; some local proxies
 * refuse loopback too). The customer generates an Application Password himself in wp-admin and writes
 * it to a file on HIS machine. The AI passes only the FILE PATH — never the password — so this route
 * keeps the same guarantee as the callback flow: the secret never enters the model's context.
 *
 * The file may be a bare app password (spaces/newlines tolerated — WordPress prints them in groups of
 * four) or JSON `{ "username", "appPassword" }`. Nothing is echoed back: the output carries status and
 * the next step only. Validation is a real GET against `/wp-json/wp/v2/users/me`, so a typo fails here
 * instead of three commands later.
 */
export async function cmdLoginAppPassword(
  dir: string,
  siteArg: string | undefined,
  fileArg: string | undefined,
  userArg?: string,
): Promise<unknown> {
  if (!siteArg || !fileArg) {
    return {
      ok: false,
      code: 'usage',
      message: 'usage: puffergo login app-password --site <url> --file <path> [--user <username>]',
    };
  }
  let siteUrl: string;
  try {
    siteUrl = normalizeSiteUrl(siteArg);
  } catch {
    return { ok: false, code: 'error', message: `Not a valid site URL: ${siteArg}` };
  }

  let raw: string;
  try {
    raw = (await readFile(fileArg, 'utf8')).trim();
  } catch (e) {
    return {
      ok: false,
      code: 'file_unreadable',
      message: `Cannot read the password file (${(e as Error).message}). The customer should write it to a plain text file on his own computer and give you the path.`,
    };
  }
  if (!raw) {
    return { ok: false, code: 'file_empty', message: 'The password file is empty.' };
  }

  let username = (userArg ?? '').trim();
  let appPassword = raw;
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const u = typeof parsed.username === 'string' ? parsed.username.trim() : '';
      const p = typeof parsed.appPassword === 'string' ? parsed.appPassword.trim() : '';
      if (!p) return { ok: false, code: 'file_empty', message: 'The JSON file has no appPassword.' };
      username = username || u;
      appPassword = p;
    } catch {
      return { ok: false, code: 'bad_file', message: 'The file starts with `{` but is not valid JSON.' };
    }
  }
  // WordPress displays app passwords in space-separated groups; strip whitespace so copy-paste works.
  appPassword = appPassword.replace(/\s+/g, '');
  if (!username) {
    return {
      ok: false,
      code: 'missing_user',
      message: 'Add `--user <username>` — the WordPress login the customer used to generate the Application Password.',
    };
  }

  return verifyAndSave(dir, siteUrl, username, appPassword, 'app-password-file');
}

/**
 * Validate a username/password pair against the live site, then store it. Shared by the two
 * listener-free routes (`app-password`, `from-url`) so a credential is never saved without a real
 * `GET /users/me` behind it — a typo fails here instead of three commands later.
 *
 * Nothing about the secret is echoed: the returned object carries status, username and the site only.
 */
async function verifyAndSave(
  dir: string,
  siteUrl: string,
  username: string,
  appPassword: string,
  route: 'app-password-file' | 'callback-url-file',
): Promise<unknown> {
  const auth = `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`;
  let verified = false;
  let detail = '';
  try {
    const res = await nodeNetwork.request({
      method: 'GET',
      url: `${siteUrl}/wp-json/wp/v2/users/me?context=edit&_fields=id,username,capabilities`,
      headers: { Authorization: auth },
    });
    verified = res.status >= 200 && res.status < 300;
    detail = verified ? '' : ` WordPress answered ${res.status}.`;
  } catch (e) {
    detail = ` ${(e as Error).message}`;
  }
  if (!verified) {
    return {
      ok: false,
      code: 'invalid_app_password',
      message: `That Application Password did not work.${detail} Ask the customer to re-check the username and generate a new one in wp-admin → Users → Profile → Application Passwords — never guess or retry with variations.`,
    };
  }

  await upsertCredential({ siteUrl, username, appPassword });
  await writeActiveDomain(dir, siteUrl);
  await writeLoginState({ siteUrl, status: 'approved', startedAt: Date.now(), username });
  return {
    ok: true,
    status: 'approved',
    siteUrl,
    username,
    route,
    next: `Authorization is done and the credential was verified against ${siteUrl} and saved on this machine. The password was read from the customer's file and never printed. Tell the customer they can delete that file now, then continue with \`puffergo site setup\`.`,
  };
}

/**
 * `puffergo login from-url` — recover a grant whose callback had nowhere to land.
 *
 * When the listener was dead at click time, WordPress still performed the whole round trip: the browser
 * sits on `http://127.0.0.1:PORT/?site_url=…&user_login=…&password=…` showing a connection error, and the
 * application password is right there in the address bar. Nothing is lost — it just needs collecting.
 *
 * This is the cheapest recovery there is: the customer was already on that page and does not have to go
 * find the Application Passwords screen. The AI passes only the file path, so the password stays out of
 * the model's context — the same guarantee as `app-password`.
 */
export async function cmdLoginFromUrl(
  dir: string,
  siteArg: string | undefined,
  fileArg: string | undefined,
  userArg?: string,
): Promise<unknown> {
  if (!siteArg || !fileArg) {
    return {
      ok: false,
      code: 'usage',
      message: 'usage: puffergo login from-url --site <url> --file <path> [--user <username>]',
    };
  }
  let siteUrl: string;
  try {
    siteUrl = normalizeSiteUrl(siteArg);
  } catch (e) {
    return { ok: false, code: 'bad_url', message: `${e instanceof Error ? e.message : String(e)}` };
  }

  let raw: string;
  try {
    raw = (await readFile(fileArg, 'utf8')).trim();
  } catch (e) {
    return {
      ok: false,
      code: 'file_unreadable',
      message: `Cannot read the file (${(e as Error).message}). The customer should paste the address bar into a plain text file and give you the path.`,
    };
  }
  if (!raw) {
    return { ok: false, code: 'file_empty', message: 'The file is empty. Paste the whole address-bar line into it.' };
  }

  // Accept the full URL, or just the query string the customer happened to copy.
  let params: URLSearchParams;
  try {
    const asUrl = raw.includes('://') ? raw : `http://127.0.0.1/?${raw.replace(/^\?/, '')}`;
    params = new URL(asUrl).searchParams;
  } catch {
    return {
      ok: false,
      code: 'bad_file',
      message:
        'That does not look like the callback URL. It should start with `http://127.0.0.1:` and contain `site_url=`, `user_login=` and `password=`.',
    };
  }

  const appPassword = (params.get('password') ?? '').replace(/\s+/g, '');
  if (!appPassword) {
    return {
      ok: false,
      code: 'no_password',
      message:
        'No `password=` in that text. Copy the URL the browser landed on AFTER clicking approve — the one that starts with `http://127.0.0.1:` and carries site_url / user_login / password.',
    };
  }
  const username = (userArg ?? params.get('user_login') ?? '').trim();
  if (!username) {
    return {
      ok: false,
      code: 'missing_user',
      message: 'Add `--user <username>` — the WordPress login the approval was made with.',
    };
  }

  return verifyAndSave(dir, siteUrl, username, appPassword, 'callback-url-file');
}

/**
 * Forget the authorization record when it belongs to `siteUrl` — `logout` calls this so a later
 * `login status` cannot read back an `approved` record for a site this machine no longer has, and
 * report a connection that is gone. A record for a different site is left alone (one file, one flow).
 */
export async function forgetLoginState(siteUrl: string): Promise<boolean> {
  const state = await readLoginState();
  if (!state || siteKey(state.siteUrl) !== siteKey(siteUrl)) return false;
  await rm(loginStatePath(), { force: true });
  return true;
}

/** Is a credential for this site already in the store? The "page said ✅ but nothing was saved" case can
 *  only be told apart from a real success by looking — the state file alone will happily say `approved`. */
async function hasStoredCredential(siteUrl: string): Promise<boolean> {
  const path = process.env.PUFFERGO_CONFIG || join(PUFFERGO_DIR, 'credentials.json');
  if (!existsSync(path)) return false;
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as { sites?: Record<string, unknown> };
    const want = siteKey(siteUrl);
    return Object.keys(raw.sites ?? {}).some(k => siteKey(k) === want);
  } catch {
    return false;
  }
}

/**
 * `puffergo login doctor` — one command that answers "why did the approval never arrive".
 *
 * Every field here is a fact the AI cannot otherwise obtain: whether anything is listening on the callback
 * port right now, which site the shared state file belongs to (the `--help`-as-a-domain case shows up here
 * as a `siteUrl` that is obviously not a site), how much of the ten-minute window is left, and whether a
 * credential actually reached disk despite the state file claiming success. Diagnosis beats guessing.
 */
export async function cmdLoginDoctor(): Promise<unknown> {
  const state = await readLoginState();
  const port = state?.port ?? 0;
  const listening = port > 0 ? await portIsHeld(port) : false;
  const remainingSec = state ? Math.max(0, Math.round((state.startedAt + WAIT_MS - Date.now()) / 1000)) : 0;
  const stored = state ? await hasStoredCredential(state.siteUrl) : false;

  const base = {
    ok: true,
    loginStateFile: loginStatePath(),
    credentialStore: process.env.PUFFERGO_CONFIG || join(PUFFERGO_DIR, 'credentials.json'),
    listening: { port, alive: listening },
  };

  if (!state) {
    return {
      ...base,
      state: 'none',
      diagnosis: 'no-login',
      message: '本机没有登录记录：没有进行中的授权，也没有上一次的失败记录。运行 `puffergo login <站点地址>` 开始一次。',
    };
  }

  const common = {
    ...base,
    state: state.status,
    siteUrl: state.siteUrl,
    siteKey: siteKey(state.siteUrl),
    port,
    startedAgoSec: Math.max(0, Math.round((Date.now() - state.startedAt) / 1000)),
    windowRemainingSec: remainingSec,
    credentialSaved: stored,
    takeovers: state.takeovers ?? 0,
  };

  if (state.status === 'approved') {
    return stored
      ? {
          ...common,
          diagnosis: 'ready',
          message: '授权是好的：状态已批准，凭据也已经在本机存好了。可以直接用 `puffergo site setup` 或 `pages find` 验证连通。',
        }
      : {
          ...common,
          diagnosis: 'state-without-credential',
          message:
            '状态文件说「已批准」，但凭据里根本没有这个站——这就是授权页显示 ✅ 而实际没存下来的情况。重新运行 `puffergo login <站点地址>`；如果反复出现，检查 ~/.puffergo 的写权限和磁盘空间。',
          next: 'Run `puffergo login <siteUrl>` again. If it repeats, check write permission on ~/.puffergo.',
        };
  }

  if (state.status === 'failed') {
    return {
      ...common,
      diagnosis: 'failed',
      message: '上一次授权失败或被拒绝了（也可能过了 10 分钟窗口）。重新运行 `puffergo login <站点地址>`，把新链接发给客户。',
      next: 'Run `puffergo login <siteUrl>` again.',
    };
  }

  // pending
  if (remainingSec <= 0) {
    return {
      ...common,
      diagnosis: 'expired',
      message: '授权窗口已经过了 10 分钟，那个链接现在是废的。重新运行 `puffergo login <站点地址>`，把新链接发给客户。',
      next: 'Run `puffergo login <siteUrl>` again — the old link is dead.',
    };
  }
  const takeovers = state.takeovers ?? 0;
  if (takeovers >= 2) {
    return {
      ...common,
      diagnosis: 'callback-unreachable',
      message:
        `已经 ${takeovers} 次占住端口都没等到回传：这个环境的浏览器回传确实收不到，再点也没有意义。`,
      next: `Switch to a listener-free route — do not ask for another click.
  (a) If the callback URL is still in the customer's address bar (starts with http://127.0.0.1: and has &password=), have them copy that whole line into a text file and run \`puffergo login from-url --site ${state.siteUrl} --file <path>\`.
  (b) Otherwise \`puffergo login app-password --site ${state.siteUrl} --file <path> --user <username>\`.`,
    };
  }
  if (listening) {
    return {
      ...common,
      diagnosis: 'listening',
      message: `有一个进程正在 ${port} 端口听着，客户现在点「批准」就能收到。保持 \`puffergo login status\` 在跑就行，别让客户反复点。`,
    };
  }
  return {
    ...common,
    diagnosis: 'nobody-listening',
    message:
      '没有任何进程在听回调端口——客户现在点「批准」会丢掉（这不是他点错，也不是网站的问题）。立刻运行 `puffergo login status`（它会占用端口并等待约一分钟），在它跑起来之后再让客户点；它每返回一次就再跑一次。',
    next: 'Run `puffergo login status` now — it takes the port over. Only ask the customer to click while it is running.',
  };
}
