/**
 * Thin REST client for the plugin's `puffergo/v1/agent/*` surface (spec section 6). Deliberately not
 * built on WpClient (silo-core) — that class targets the generic `/wp/v2` + Rank Math surface for the
 * SEO Silo; the agent-products routes are a separate, already-fully-shaped JSON contract this CLI just
 * needs to call and relay. Uses node's global fetch directly (Node ≥18 never rides HTTP_PROXY/HTTPS_PROXY
 * env vars automatically — no explicit bypass code needed; see the e2e notes in the final report).
 */

import type { SiloConfig } from '../adapters/credentials';

export class AgentHttpError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`HTTP ${status}`);
  }
}

export class AgentClient {
  private readonly base: string;
  private readonly authHeader: string;

  constructor(private readonly cfg: SiloConfig) {
    this.base = `${cfg.siteUrl.replace(/\/+$/, '')}/wp-json/puffergo/v1`;
    this.authHeader = `Basic ${Buffer.from(`${cfg.username}:${cfg.appPassword}`).toString('base64')}`;
  }

  get siteUrl(): string {
    return this.cfg.siteUrl;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.authHeader,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = { code: 'invalid_json', message: text.slice(0, 300) };
    }
    if (!res.ok) throw new AgentHttpError(res.status, json);
    return json as T;
  }

  schema<T = unknown>(): Promise<T> {
    return this.call('GET', '/agent/products/schema');
  }

  listProducts<T = unknown>(params: { search?: string; key?: string; url?: string; page?: number } = {}): Promise<T> {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.key) q.set('key', params.key);
    if (params.url) q.set('url', params.url);
    if (params.page) q.set('page', String(params.page));
    const qs = q.toString();
    return this.call('GET', `/agent/products${qs ? `?${qs}` : ''}`);
  }

  getProduct<T = unknown>(id: number): Promise<T> {
    return this.call('GET', `/agent/products/${id}`);
  }

  validate<T = unknown>(products: unknown[]): Promise<T> {
    return this.call('POST', '/agent/products/validate', { products });
  }

  upsert<T = unknown>(products: unknown[]): Promise<T> {
    return this.call('POST', '/agent/products/upsert', { products });
  }

  mediaLookup<T = unknown>(sha256: string): Promise<T> {
    return this.call('GET', `/agent/media?sha256=${sha256}`);
  }

  /** POST /wp/v2/media — outside the puffergo/v1 namespace, so bypasses `base`. */
  async uploadMedia(bytes: Uint8Array, filename: string, mimeType: string): Promise<{ id: number; url: string }> {
    const url = `${this.cfg.siteUrl.replace(/\/+$/, '')}/wp-json/wp/v2/media`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        Authorization: this.authHeader,
      },
      body: bytes,
    });
    const text = await res.text();
    let json: { id?: number; source_url?: string } = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    if (!res.ok) throw new AgentHttpError(res.status, json);
    return { id: json.id ?? 0, url: json.source_url ?? '' };
  }
}
