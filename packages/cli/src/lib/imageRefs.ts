/** Walk every image ref in a product (top-level gallery + the detail's image blocks; a component's images are
 *  plain URLs in its data, see configData.ts) with the
 *  exact path string the server uses in its error paths (spec section 5 / REST source), so local checks
 *  and server errors line up and file→mediaId rewriting can mutate refs in place. */

import { detailBlocks } from './detailBlocks';
import type { ImageRef, ProductFile } from './productTypes';

export function identOf(product: ProductFile): string {
  if (product.key) return product.key;
  if (product.id) return `#${product.id}`;
  return '?';
}

export interface WalkedRef {
  path: string;
  /** Where the image shows: `productGallery` or `detailImage`. */
  place: string;
  ref: ImageRef;
  set: (next: ImageRef) => void;
}

export function walkImageRefs(product: ProductFile): WalkedRef[] {
  const ident = identOf(product);
  const out: WalkedRef[] = [];

  (product.gallery ?? []).forEach((ref, i) => {
    out.push({
      path: `${ident}.gallery[${i}]`,
      place: 'productGallery',
      ref,
      set: next => {
        product.gallery![i] = next;
      },
    });
  });

  for (const { path, block } of detailBlocks(product, ident)) {
    if (block.type !== 'image' || !block.image) continue;
    out.push({
      path: `${path}.image`,
      place: 'detailImage',
      ref: block.image,
      set: next => {
        block.image = next;
      },
    });
  }

  return out;
}
