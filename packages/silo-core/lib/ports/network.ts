/**
 * NetworkPort — the HTTP seam. `silo-core` never calls `fetch` or Obsidian's `requestUrl` directly;
 * each host injects an adapter with the right transport.
 *
 * Extension → `fetch` from the service worker (bypasses CORS; must use `credentials: 'omit'` so a
 * logged-in WP cookie doesn't hijack the Basic-auth header). Obsidian → `requestUrl` (also CORS-free).
 */

export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface HttpResponse {
  status: number;
  /** Parsed JSON body (adapters parse and hand back an object). */
  json: unknown;
  /** Raw response body text — for non-JSON responses (e.g. fetching a themed front-end HTML page for
   *  preview). Optional; adapters that can expose it populate it alongside `json`. */
  text?: string;
  /** Response headers, lowercased keys. Optional — only adapters that can expose them do (used for
   *  WP pagination via `x-wp-totalpages`). */
  headers?: Record<string, string>;
}

export interface NetworkPort {
  request(req: HttpRequest): Promise<HttpResponse>;
}

/**
 * Encodes an `HttpRequest.body` for transports that need a wire value rather than the raw JS value
 * `WpClient` hands them: binary passes through UNTOUCHED (e.g. `uploadMedia`'s raw file bytes — a
 * transport that `JSON.stringify`s a `Uint8Array` silently corrupts it into `{"0":137,"1":80,...}`
 * instead of sending the actual bytes), everything else is JSON-stringified. Every `NetworkPort`
 * adapter should encode through this rather than inlining its own `JSON.stringify`, so "don't stringify
 * binary" is fixed once for all hosts instead of per-adapter.
 */
export function encodeHttpBody(body: unknown): string | Uint8Array | undefined {
  if (body === undefined) return undefined;
  if (body instanceof Uint8Array) return body;
  return JSON.stringify(body);
}

/** Thrown by the WP client on a non-2xx response so callers can surface a clear message. */
export class WpHttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'WpHttpError';
  }
}

/** WP error codes that mean "this request never authenticated" (as opposed to authenticated-but-
 *  lacks-capability). Covers a revoked/deleted Application Password: WP silently drops the invalid
 *  Basic-auth credentials and the request falls through as anonymous, so an edit endpoint's permission
 *  check fails exactly like a logged-out visitor's would — surfacing as 401, or 403 with one of these
 *  codes rather than a capability-specific one (e.g. `rest_cannot_edit_others`). */
const AUTH_ERROR_CODES = new Set([
  'incorrect_password',
  'invalid_username',
  'rest_cookie_invalid_nonce',
  'rest_not_logged_in',
  'rest_forbidden',
]);

/** True when an error looks like the connection's credentials are missing/invalid — a revoked or
 *  deleted Application Password being the common cause — rather than a "logged in but not allowed"
 *  capability error (e.g. wrong role, not the post's author). Single shared check so every call site
 *  (push, batch push, connection status) reports the same "reconnect WordPress" diagnosis consistently
 *  instead of re-deriving it from status/code locally. */
export function isAuthError(e: unknown): boolean {
  if (!(e instanceof WpHttpError)) return false;
  if (e.status === 401) return true;
  return e.status === 403 && AUTH_ERROR_CODES.has(e.code);
}
