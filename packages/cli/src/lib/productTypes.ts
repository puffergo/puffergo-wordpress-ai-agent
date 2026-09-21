/** The product file shape from spec section 4 — one file per product, `products/<key>.json`. */

export interface ImageRef {
  file?: string;
  mediaId?: number;
  url?: string;
  alt?: string;
  sha256?: string;
}

/**
 * One block of the content, in page order — the same shape for a product's detail and for a page's blocks
 * (schema `blocks` lists the components and native types a site takes).
 */
export type DetailBlock =
  /** Body text: paragraphs, headings, lists… as Markdown. Stored as core WordPress blocks. */
  | { type: 'prose'; markdown: string }
  | { type: 'static'; html: string; scopeId?: string }
  /** A config component: `data` is its configData, fields as the component's schema says (schema `blocks.components`). */
  | { type: 'config'; component: string; data: Record<string, unknown> }
  /** A block made in the editor (video, image, other plugins…), as read: keep, move or delete, never edit. */
  | { type: 'native'; raw: string; name?: string; text?: string }
  | { type: 'image'; image: ImageRef }
  | { type: 'video'; url?: string; mediaId?: number };

/** The content blocks a page and a product's detail both hold; `DetailBlock` is its name in a product file. */
export type ContentBlock = DetailBlock;

/** `blocks` is the whole detail. */
export interface ProductDetail {
  blocks?: DetailBlock[];
}

export interface UnitValue {
  type?: 'contact';
  value?: number;
  min?: number;
  max?: number;
  unit?: string;
}

export interface ProductFile {
  key?: string;
  id?: number;
  baseModified?: string;
  status?: 'draft' | 'publish';
  /** Local only (never sent): the sample this product follows, by name from `.puffergo/samples.json`. */
  sample?: string;
  title: string;
  excerpt?: string;
  categories?: string[];
  price?: UnitValue;
  moq?: UnitValue;
  leadTime?: UnitValue;
  /** Custom trade fields of this site (schema `tradeFields` with path `trade.<key>`): key → plain text. */
  trade?: Record<string, string | null>;
  specs?: Array<{ key: string; value: string }>;
  gallery?: ImageRef[];
  detail?: ProductDetail;
  /** SEO title / description and focus keywords (core + up to 5 long-tail); required on a new product. */
  seo?: ProductSeo;
}

export interface ProductSeo {
  title?: string;
  description?: string;
  focusKeyword?: string;
  keywords?: string[];
}

export interface ValidationError {
  path: string;
  code: string;
  message: string;
  fix: 'ai' | 'user';
}
