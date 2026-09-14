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
