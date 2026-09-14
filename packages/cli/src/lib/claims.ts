/**
 * Marketing words models add on their own ("durable", "engineered for demanding …"). The customer never
 * said them, and on a public product page they read as promises. The Skill forbids them; models still
 * slip, so `check` flags each one for the AI to delete — or keep, if the customer really said it.
 */

import type { ProductFile, ValidationError } from './productTypes';
import { identOf } from './imageRefs';

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

/** Every text field of a product with the path the rest of check uses. */
function texts(p: ProductFile): Array<[string, string | undefined]> {
  const id = identOf(p);
  const out: Array<[string, string | undefined]> = [
    [`${id}.title`, p.title],
    [`${id}.excerpt`, p.excerpt],
    [`${id}.detail.title`, p.detail?.title],
    [`${id}.detail.subtitle`, p.detail?.subtitle],
    [`${id}.detail.intro`, p.detail?.intro],
  ];
  (p.detail?.sections ?? []).forEach((s, i) => {
    out.push([`${id}.detail.sections[${i}].heading`, s.heading], [`${id}.detail.sections[${i}].body`, s.body]);
    (s.images ?? []).forEach((img, j) => {
      out.push([`${id}.detail.sections[${i}].images[${j}].title`, img.title]);
      out.push([`${id}.detail.sections[${i}].images[${j}].text`, img.text]);
    });
  });
  return out;
}

export function claimWarnings(p: ProductFile): ValidationError[] {
  const out: ValidationError[] = [];
  for (const [path, text] of texts(p)) {
    const found = [...new Set((text ?? '').match(CLAIM_RE)?.map(w => w.toLowerCase()) ?? [])];
    if (!found.length) continue;
    out.push({
      path,
      code: 'unsupported_claim',
      message: `Uses ${found.map(w => `"${w}"`).join(', ')}. Delete the claim unless the customer said it in their own words; keep only the facts they gave.`,
      fix: 'ai',
    });
  }
  return out;
}
