/**
 * Thin client for the plugin's `puffergo/*` WordPress Abilities (spec section 6), run through core REST at
 * `/wp-abilities/v1/abilities/puffergo/<name>/run`. Deliberately not built on WpClient (silo-core) — that
 * class targets the generic `/wp/v2` + Rank Math surface for the SEO Silo. Uses node's global fetch directly
 * (Node ≥18 never rides HTTP_PROXY/HTTPS_PROXY env vars automatically).
 */

import type { SiloConfig } from '../adapters/credentials';

/** The plugin's product post type (PufferGo_Product_CPT::CPT_SLUG). */
export const PRODUCT_TYPE = 'puffergo_product';

/** A post's slug, SEO title / description, focus keywords (core + long-tail) and featured image (a media id). */
export interface SeoInput {
  slug: string;
  seoTitle: string;
  seoDescription: string;
  focusKeyword: string;
  keywords?: string[];
  featuredImage?: number;
}

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
    this.base = `${cfg.siteUrl.replace(/\/+$/, '')}/wp-json/wp-abilities/v1/abilities/puffergo`;
    this.authHeader = `Basic ${Buffer.from(`${cfg.username}:${cfg.appPassword}`).toString('base64')}`;
  }

  get siteUrl(): string {
    return this.cfg.siteUrl;
  }

  private async call<T>(method: string, path: string, body?: unknown, base = this.base): Promise<T> {
    const res = await fetch(`${base}${path}`, {
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

  /** Readonly abilities run over GET. Core reads the raw `input` query param (no JSON decoding), so each
   *  field goes as `input[field]=value`; empty fields are left out. */
  private read<T>(ability: string, input: Record<string, string | number | undefined> = {}): Promise<T> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(input)) {
      if (v !== undefined && v !== '') q.set(`input[${k}]`, String(v));
    }
    const qs = q.toString();
    return this.call('GET', `/${ability}/run${qs ? `?${qs}` : ''}`);
  }

  private write<T>(ability: string, input: unknown): Promise<T> {
    return this.call('POST', `/${ability}/run`, { input });
  }

  schema<T = unknown>(): Promise<T> {
    return this.read('get-product-schema');
  }

  /** Products are found through the generic find-posts ability, limited to the product type. */
  listProducts<T = unknown>(params: { search?: string; key?: string; url?: string; page?: number } = {}): Promise<T> {
    return this.findPosts({ ...params, type: PRODUCT_TYPE });
  }

  postTypes<T = unknown>(): Promise<T> {
    return this.read('list-post-types');
  }

  findPosts<T = unknown>(
    params: { type?: string; status?: string; search?: string; key?: string; url?: string; page?: number } = {},
  ): Promise<T> {
    return this.read('find-posts', params);
  }

  getBlocks<T = unknown>(id: number, path?: string): Promise<T> {
    return this.read('get-blocks', { id, path });
  }

  /** With `inPage`, the one section is previewed in place of that block on the post's own page. */
  /** With inPage.data (a component's data) in place of sections, that component block is previewed in its page. */
  previewBlocks<T = unknown>(
    sections: string[],
    title?: string,
    inPage?: { id: number; path: string; data?: unknown },
  ): Promise<T> {
    return this.write('preview-blocks', {
      ...(sections.length ? { sections } : {}),
      ...(title ? { title } : {}),
      ...(inPage ?? {}),
    });
  }

  createPost<T = unknown>(
    input: { type: string; title: string; excerpt?: string; sections: string[] } & SeoInput,
  ): Promise<T> {
    return this.write('create-post', input);
  }

  publishPost<T = unknown>(input: { id: number; baseModified: string }): Promise<T> {
    return this.write('publish-post', input);
  }

  updateSeo<T = unknown>(input: { id: number; baseModified: string } & Partial<SeoInput>): Promise<T> {
    return this.write('update-seo', input);
  }

  /** A static block takes its new html; a component block its new data. */
  replaceBlock<T = unknown>(
    input: { id: number; path: string; baseModified: string } & ({ html: string } | { data: unknown }),
  ): Promise<T> {
    return this.write('replace-block', input);
  }

  getProduct<T = unknown>(id: number): Promise<T> {
    return this.read('get-product', { id });
  }

  validate<T = unknown>(products: unknown[]): Promise<T> {
    return this.write('validate-products', { products });
  }

  upsert<T = unknown>(products: unknown[]): Promise<T> {
    return this.write('upsert-products', { products });
  }

  /** The product's page as upserting this file would make it, without writing it. */
  previewProduct<T = unknown>(product: unknown): Promise<T> {
    return this.write('preview-product', { product });
  }

  mediaLookup<T = unknown>(sha256: string): Promise<T> {
    return this.read('find-media', { sha256 });
  }

  /** Product category terms via WordPress's own `/wp/v2/puffergo_product_cat` route; `lang` filters under Polylang. */
  async listCategoryTerms<T = unknown>(lang = ''): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; ; page++) {
      const batch = await this.call<T[]>(
        'GET',
        `/puffergo_product_cat?per_page=100&page=${page}&hide_empty=false&context=edit${lang ? `&lang=${encodeURIComponent(lang)}` : ''}`,
        undefined,
        this.wpBase,
      );
      out.push(...batch);
      if (batch.length < 100) return out;
    }
  }

  saveCategoryTerm<T = unknown>(id: number | null, body: Record<string, unknown>): Promise<T> {
    return this.call('POST', `/puffergo_product_cat${id ? `/${id}` : ''}`, body, this.wpBase);
  }

  private get wpBase(): string {
    return `${this.cfg.siteUrl.replace(/\/+$/, '')}/wp-json/wp/v2`;
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
