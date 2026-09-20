/** The one place the CLI walks a product's detail blocks. Paths match the plugin's error paths
 *  (PufferGo_Block_Content), so local checks and server errors line up. */

import type { DetailBlock, ProductFile, ValidationError } from './productTypes';

export interface WalkedBlock {
  path: string;
  block: DetailBlock;
}

export function detailBlocks(product: ProductFile, ident: string): WalkedBlock[] {
  return (product.detail?.blocks ?? []).map((block, i) => ({ path: `${ident}.detail.blocks[${i}]`, block }));
}

/** Visible text of static HTML, for the claim check. */
export function htmlText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Block kinds in page order as the site reads them back (a new image or video comes back as native). */
export function blockSignature(blocks: DetailBlock[]): Array<string> {
  return blocks.map(b => {
    if (b.type === 'config') return `config:${b.component}`;
    return b.type === 'static' ? 'static' : 'native';
  });
}

/** A new product whose detail has no component: only a suggestion (the customer may want it plain). */
export function detailWarnings(product: ProductFile, ident: string): ValidationError[] {
  if (product.id || detailBlocks(product, ident).some(b => b.block.type === 'config')) return [];
  return [
    {
      path: `${ident}.detail`,
      code: 'no_detail_component',
      message: 'The detail has no component. Suggest the customer one (see the Skill), unless they want it this way.',
      fix: 'user',
    },
  ];
}
