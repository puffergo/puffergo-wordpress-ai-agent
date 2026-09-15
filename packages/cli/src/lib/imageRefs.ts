/** Walk every image ref in a product (top-level gallery + detail.sections[].image/.images[]) with the
 *  exact path string the server uses in its error paths (spec section 5 / REST source), so local checks
 *  and server errors line up and file→mediaId rewriting can mutate refs in place. */

import type { ImageRef, ProductFile } from './productTypes';

export function identOf(product: ProductFile): string {
  if (product.key) return product.key;
  if (product.id) return `#${product.id}`;
  return '?';
}

export interface WalkedRef {
  path: string;
  /** Where the image shows: `productGallery`, or the detail layout (`split`/`full`/`image`/`gallery`). */
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

  (product.detail?.sections ?? []).forEach((section, i) => {
    const sectionPath = `${ident}.detail.sections[${i}]`;
    if (section.image) {
      out.push({
        path: `${sectionPath}.image`,
        place: section.layout,
        ref: section.image,
        set: next => {
          section.image = next;
        },
      });
    }
    (section.images ?? []).forEach((ref, j) => {
      out.push({
        path: `${sectionPath}.images[${j}]`,
        place: 'gallery',
        ref,
        set: next => {
          section.images![j] = { ...next, title: ref.title, text: ref.text };
        },
      });
    });
  });

  return out;
}
