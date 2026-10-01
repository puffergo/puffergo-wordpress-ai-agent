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

/**
 * The same signature, with runs of blocks the site merges collapsed into one `native`.
 *
 * The site folds neighbouring prose / image / video blocks into a single prose block — the image
 * becomes `![alt](url)` inside it, so nothing is lost, but the block count drops. Comparing the raw
 * signature then reports `readback_mismatch` for a write that actually landed in full, and the
 * `fix: "ai"` tells the agent to edit a file that no edit can satisfy. Only `config` and `static`
 * survive as their own blocks, so a genuinely missing component or section still mismatches.
 */
export function mergedBlockSignature(blocks: DetailBlock[]): Array<string> {
  const out: string[] = [];
  for (const kind of blockSignature(blocks)) {
    if (kind === 'native' && out[out.length - 1] === 'native') continue;
    out.push(kind);
  }
  return out;
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
