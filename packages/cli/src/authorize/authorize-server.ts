/**
 * Shared Node implementation of WordPress's one-click Application Password flow: a one-shot
 * 127.0.0.1 HTTP server that WordPress's authorize screen redirects back to (`success_url`), used by
 * both the Obsidian plugin (`pages/obsidian/src/vault/authorize.ts`) and the `puffergo` CLI's `login`
 * command. Node-only on purpose (uses `node:http`) — never imported by chrome-extension pages, so it
 * lives next to the platform-agnostic `wp-authorize-protocol.ts` without affecting the browser bundle
 * (the shared package's build is per-file, not bundled: see `packages/shared/build.mjs`).
 *
 * Only a request that actually carries the authorize round-trip's params (`password`, or `success=false`
 * for a rejection) finishes the server — a bare `/favicon.ico` the browser fires after rendering the
 * result page must NOT be mistaken for a second, empty callback.
 */
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  buildAuthorizeUrl,
  parseAuthorizeReturn,
  type AuthorizedAppPasswordCredentials,
} from './wp-authorize-protocol';

export type { AuthorizedAppPasswordCredentials };

/** True when `params` carries the authorize round-trip's own params (a real callback), as opposed to an
 *  incidental request (favicon, browser prefetch, …) hitting the same one-shot server. */
function isCallbackRequest(params: URLSearchParams): boolean {
  return params.has('password') || params.get('success') === 'false';
}

/** Bind failures that mean "not this port" rather than "the server is broken". A live listener answers
 *  `EADDRINUSE`; Windows reserves whole ranges for Hyper-V / WinNAT and answers `EACCES` to a bind while
 *  still looking free to anyone knocking on it. Both mean: let the OS choose instead. */
export function portIsUnusable(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code ?? '';
  return code === 'EADDRINUSE' || code === 'EACCES' || code === 'EPERM' || code === 'EADDRNOTAVAIL';
}

export interface AuthorizeServerOptions {
  /** App name shown on WordPress's authorize screen. Default 'PufferGo'. */
  appName?: string;
  /** How long to keep the server up waiting for the callback. Default 5 minutes. */
  timeoutMs?: number;
  /** Port to hold. Default 0 (the OS picks). Pass the port an authorize URL was already built with to
   *  keep serving that URL from a new process — see `puffergo login status`. If the port is taken, the
   *  server falls back to a free one, which no earlier URL points at. */
  port?: number;
  /** HTML body text for the result page (success / failure) — callers phrase the "go back to X" line. */
  resultPage?: (ok: boolean) => string;
  /** Fires when the wait ends because `timeoutMs` elapsed, as opposed to a callback arriving incomplete
   *  (WordPress appends `success=false` when the approval is declined). Callers that must tell a timeout
   *  apart from a declined approval — the CLI taking a dead listener's port back — need this, because
   *  both end the promise with `null`. */
  onTimeout?: () => void;
  /** Aborting ends the wait immediately with `null`, so a caller that decided to stop (the port it wanted
   *  was already gone) returns at once instead of holding the process to its timeout. The caller knows why
   *  it aborted, so this needs no separate outcome. */
  signal?: AbortSignal;
}

const DEFAULT_RESULT_PAGE = (ok: boolean): string =>
  `<!doctype html><html><head><meta charset="utf-8"><title>PufferGo</title>
<style>html{font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1f2430;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f6f7fb}
div{text-align:center}</style></head><body><div>${
    ok ? '✅ 已授权。' : '❌ 未获取到应用密码。'
  }<br><small style="color:#888">这个页面可以关闭了。</small></div></body></html>`;

/**
 * Starts the one-shot server on 127.0.0.1 — on `opts.port` when given, else on a random free one — and
 * reports the port it actually holds through `onListening`, before any request arrives. Callers that must
 * return immediately (e.g. a CLI command with a shell timeout) use that to open the browser and print the
 * authorize URL without blocking on the result. The returned promise resolves once the real callback lands
 * (or the timeout elapses).
 *
 * `onListening` reporting a port other than the one asked for means the asked-for port was busy — the
 * authorize URL built for it now points at nothing, so callers must not pretend the wait is still live.
 */
export function runAuthorizeServer(
  siteUrl: string,
  onListening: (authorizeUrl: string, port: number) => void,
  opts: AuthorizeServerOptions = {},
): Promise<AuthorizedAppPasswordCredentials | null> {
  const {
    appName = 'PufferGo',
    timeoutMs = 5 * 60 * 1000,
    port = 0,
    resultPage = DEFAULT_RESULT_PAGE,
    onTimeout,
    signal,
  } = opts;
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    let active: http.Server | undefined;

    const finish = (value: AuthorizedAppPasswordCredentials | null): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      active?.close();
      resolve(value);
    };
    timer = setTimeout(() => {
      onTimeout?.();
      finish(null);
    }, timeoutMs);
    signal?.addEventListener('abort', () => finish(null), { once: true });

    const start = (bindPort: number): void => {
      const server = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        if (!isCallbackRequest(url.searchParams)) {
          // Not the authorize round-trip (e.g. /favicon.ico) — answer plainly, keep waiting.
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('not found');
          return;
        }
        const creds = parseAuthorizeReturn(url.searchParams);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(resultPage(!!creds));
        finish(creds);
      });
      active = server;

      server.on('error', err => {
        // The port we were asked to keep is not ours to take — somebody else holds it, or Windows has it
        // reserved. Take a free one instead of failing the whole flow; the authorize URL already handed out
        // points at the old number, so callers compare the port they get in `onListening` with the one they
        // asked for.
        if (portIsUnusable(err) && bindPort !== 0) {
          start(0);
          return;
        }
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        reject(err);
      });

      server.listen(bindPort, '127.0.0.1', () => {
        const { port: bound } = server.address() as AddressInfo;
        onListening(buildAuthorizeUrl(siteUrl, `http://127.0.0.1:${bound}/`, appName), bound);
      });
    };

    if (signal?.aborted) finish(null);
    else start(port);
  });
}
