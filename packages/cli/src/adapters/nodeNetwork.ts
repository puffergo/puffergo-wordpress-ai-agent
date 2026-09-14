/**
 * NetworkPort adapter for the CLI: node's global `fetch` (Node ≥ 18). Node's fetch never rides
 * browser cookies, so unlike the extension we don't need `credentials: 'omit'` — the WpClient's Basic
 * auth header is the only credential. Defensive: any transport error becomes a 0-status response with
 * the message in `text`, so callers see a clear failure instead of an unhandled rejection.
 */

import type { HttpRequest, HttpResponse, NetworkPort } from '@puffergo/silo-core';

export const nodeNetwork: NetworkPort = {
  async request(req: HttpRequest): Promise<HttpResponse> {
    try {
      // Binary/text bodies (e.g. media uploads) pass through untouched; plain objects are JSON-encoded.
      const body: Uint8Array | string | undefined =
        req.body === undefined
          ? undefined
          : req.body instanceof Uint8Array || typeof req.body === 'string'
            ? req.body
            : JSON.stringify(req.body);
      const res = await fetch(req.url, { method: req.method, headers: req.headers, body });
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });
      if (res.status === 204) return { status: res.status, json: undefined, headers };
      const text = await res.text();
      let json: unknown = undefined;
      try {
        json = text ? JSON.parse(text) : undefined;
      } catch {
        json = { code: 'invalid_json', message: text.slice(0, 300) };
      }
      return { status: res.status, json, text, headers };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { status: 0, json: { code: 'network_error', message }, text: message, headers: {} };
    }
  },
};
