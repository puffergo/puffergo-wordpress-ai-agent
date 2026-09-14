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

export interface AuthorizeServerOptions {
  /** App name shown on WordPress's authorize screen. Default 'PufferGo'. */
  appName?: string;
  /** How long to keep the server up waiting for the callback. Default 5 minutes. */
  timeoutMs?: number;
  /** HTML body text for the result page (success / failure) — callers phrase the "go back to X" line. */
  resultPage?: (ok: boolean) => string;
}

const DEFAULT_RESULT_PAGE = (ok: boolean): string =>
  `<!doctype html><html><head><meta charset="utf-8"><title>PufferGo</title>
<style>html{font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1f2430;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f6f7fb}
div{text-align:center}</style></head><body><div>${
    ok ? '✅ 已授权。' : '❌ 未获取到应用密码。'
  }<br><small style="color:#888">这个页面可以关闭了。</small></div></body></html>`;

/**
 * Starts the one-shot server on a random free 127.0.0.1 port and resolves the free port before any
 * request arrives, via `onListening` — callers that must return immediately (e.g. a CLI command with a
 * shell timeout) use this to open the browser and print the authorize URL without blocking on the
 * result. The returned promise resolves once the real callback lands (or the timeout elapses).
 */
export function runAuthorizeServer(
  siteUrl: string,
  onListening: (authorizeUrl: string, port: number) => void,
  opts: AuthorizeServerOptions = {},
): Promise<AuthorizedAppPasswordCredentials | null> {
  const { appName = 'PufferGo', timeoutMs = 5 * 60 * 1000, resultPage = DEFAULT_RESULT_PAGE } = opts;
  return new Promise((resolve, reject) => {
    let settled = false;
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

    const timer = setTimeout(() => finish(null), timeoutMs);

    const finish = (value: AuthorizedAppPasswordCredentials | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      resolve(value);
    };

    server.on('error', err => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      const successUrl = `http://127.0.0.1:${port}/`;
      onListening(buildAuthorizeUrl(siteUrl, successUrl, appName), port);
    });
  });
}
