/**
 * Marketing words models add on their own ("durable", "engineered for demanding …"). The customer never
 * said them, and on a public product page they read as promises. The Skill forbids them; models still
 * slip, so `check` flags each one for the AI to delete — or keep, if the customer really said it.
 */

import type { ProductFile, ValidationError } from './productTypes';
import { identOf } from './imageRefs';
import { detailBlocks, htmlText } from './detailBlocks';
import { configTexts } from './configData';

const CLAIMS = [
  'durable',
  'durability',
  'robust',
  'reliable',
  'reliability',
  'rugged',
  'heavy-duty',
  'sturdy',
  'high-precision',
  'precise',
  'precision',
  'high-quality',
  'top-quality',
  'premium',
  'industrial-grade',
  'excellent',
  'exceptional',
  'superior',
  'outstanding',
  'unmatched',
  'unrivaled',
  'world-class',
  'leading',
  'state-of-the-art',
  'cutting-edge',
  'advanced',
  'innovative',
  'high-performance',
  'high-resolution',
  'efficient',
  'efficiency',
  'versatile',
  'seamless',
  'ensures?',
  'guaranteed?',
  'long service life',
  'extended service life',
  'long-lasting',
  'corrosion resistance',
  'corrosion-resistant',
  'demanding',
  'ideal for',
  'perfect for',
  'engineered for',
  'engineered to',
  'trusted',
  'proven',
  'spacious',
  'ample',
  'consistent',
  'production-ready',
  'production ready',
  // Factory, service and commercial promises (the Skill's banned categories).
  'tested',
  'testing',
  'factory-tested',
  'quality control',
  'quality-controlled',
  'inspected',
  'inspection',
  'certified',
  'certification',
  'warranty',
  'after-sales',
  'technical support',
  'discount',
  'discounts',
];
const CLAIM_RE = new RegExp(`\\b(${CLAIMS.join('|')})\\b`, 'gi');

/** The facts the customer gave: specs and trade fields. A word already in them isn't the model's invention. */
function given(p: ProductFile): string {
  const specs = (p.specs ?? []).flatMap(s => [s?.key, s?.value]);
  const trade = Object.values((p as { trade?: Record<string, unknown> }).trade ?? {});
  return [...specs, ...trade].filter(v => typeof v === 'string').join(' ');
}

/** Every text field of a product with the path the rest of check uses. */
function texts(p: ProductFile): Array<[string, string | undefined]> {
  const id = identOf(p);
  const out: Array<[string, string | undefined]> = [
    [`${id}.title`, p.title],
    [`${id}.excerpt`, p.excerpt],
    [`${id}.seo.title`, p.seo?.title],
    [`${id}.seo.description`, p.seo?.description],
  ];
  for (const { path, block } of detailBlocks(p, id)) {
    if (block.type === 'static') out.push([`${path}.html`, htmlText(block.html)]);
    if (block.type === 'config')
      for (const t of configTexts(block.data, undefined, `${path}.data`)) out.push([t.path, t.value]);
  }
  return out;
}

/** The `unsupported_claim` warning for one piece of text, or null when it has none of the words.
 *  Words already in `before` aren't flagged — the text as it was when editing, or the facts the customer gave. */
export function claimWarning(path: string, text: string | undefined, before = ''): ValidationError | null {
  const had = new Set(before.match(CLAIM_RE)?.map(w => w.toLowerCase()) ?? []);
  const found = [...new Set((text ?? '').match(CLAIM_RE)?.map(w => w.toLowerCase()) ?? [])].filter(w => !had.has(w));
  if (!found.length) return null;
  return {
    path,
    code: 'unsupported_claim',
    message: `Uses ${found.map(w => `"${w}"`).join(', ')}. Delete the claim unless the customer said it in their own words; keep only the facts they gave.`,
    fix: 'ai',
  };
}

export function claimWarnings(p: ProductFile): ValidationError[] {
  const facts = given(p);
  return texts(p)
    .map(([path, text]) => claimWarning(path, text, facts))
    .filter((w): w is ValidationError => w !== null);
}
