/** The product file shape from spec section 4 — one file per product, `products/<key>.json`. */

export interface ImageRef {
  file?: string;
  mediaId?: number;
  url?: string;
  alt?: string;
  sha256?: string;
}

export interface DetailSection {
  layout: 'split' | 'full' | 'image' | 'gallery' | 'text';
  heading?: string;
  body?: string;
  image?: ImageRef;
  imagePosition?: 'left' | 'right';
  images?: Array<ImageRef & { title?: string; text?: string }>;
  textWidth?: string;
}

export interface ProductDetail {
  title?: string;
  subtitle?: string;
  intro?: string;
  introWidth?: string;
  sections?: DetailSection[];
  /** Read-only: non-content-alternating markup found on GET; the CLI must not send it back. */
  unmanagedHtml?: string;
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
  title: string;
  excerpt?: string;
  categories?: string[];
  price?: UnitValue;
  moq?: UnitValue;
  leadTime?: UnitValue;
  specs?: Array<{ key: string; value: string }>;
  gallery?: ImageRef[];
  detail?: ProductDetail;
}

export interface ValidationError {
  path: string;
  code: string;
  message: string;
  fix: 'ai' | 'user';
}
