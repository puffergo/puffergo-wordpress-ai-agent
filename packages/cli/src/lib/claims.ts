/**
 * Praise the model added on its own — "world-class", "leading", "state-of-the-art". The customer never
 * said these, and on a public page they read as promises they didn't make.
 *
 * This is a REMINDER, never a block: a hit becomes an `unsupported_claim` warning with `fix: "user"`,
 * so it never stops a push. It is a nudge to check the wording against what the customer actually said
 * — many customers can fairly call themselves world-class, and when they did say it, keep it.
 *
 * Deliberately narrow. An earlier, much longer list also flagged ordinary product language
 * ("durable", "efficient", "certified", "warranty", "precision"…) and misfired so often that the whole
 * guard was switched off — which was worse than noisy, it was silent. Only words that are praise rather
 * than description belong here; a spec or trade field the customer gave is never flagged (see `given`).
 */

import type { ProductFile, ValidationError } from './productTypes';
import { identOf } from './imageRefs';
import { detailBlocks, htmlText } from './detailBlocks';
import { configTexts } from './configData';

const CLAIMS: string[] = [
  'world-class',
  'world class',
  'leading',
  'industry-leading',
  'market-leading',
  'state-of-the-art',
  'cutting-edge',
  'best-in-class',
  'top-rated',
  'top-quality',
  'unmatched',
  'unrivaled',
  'unparalleled',
  'second to none',
  'superior',
  'outstanding',
  'exceptional',
  'premium',
  'guaranteed?',
];
// Empty CLAIMS would make /\b(||)\b/ match zero-width at every word boundary — guard against it.
const CLAIM_RE: RegExp | null = CLAIMS.length ? new RegExp(`\\b(${CLAIMS.join('|')})\\b`, 'gi') : null;

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
  if (!CLAIM_RE) return null;
  const had = new Set(before.match(CLAIM_RE)?.map(w => w.toLowerCase()) ?? []);
  const found = [...new Set((text ?? '').match(CLAIM_RE)?.map(w => w.toLowerCase()) ?? [])].filter(w => !had.has(w));
  if (!found.length) return null;
  return {
    path,
    code: 'unsupported_claim',
    message: `Says ${found.map(w => `"${w}"`).join(', ')}. This is a reminder, not a block: check it against what the customer said — if they said it in their own words, or they approve it, keep it; otherwise reword to the facts they gave.`,
    fix: 'user',
  };
}

export function claimWarnings(p: ProductFile): ValidationError[] {
  const facts = given(p);
  return texts(p)
    .map(([path, text]) => claimWarning(path, text, facts))
    .filter((w): w is ValidationError => w !== null);
}
