/**
 * Managed-keyword reconciliation — the bridge between the free keyword STRINGS living in content /
 * category SEO fields and the first-class KeywordEntity vocabulary (`ws.keywords`).
 *
 * Design (pre-launch, no back-compat): keywords are a first-class list so a word can be PLANNED before
 * any content covers it, and so LOCAL (hand-planned) and CLOUD (imported-from-WP) keywords merge into
 * ONE incrementally-growing list keyed by the normalized term. Core/long-tail is NOT stored on the
 * keyword — it's a per-page role derived from the assignments (see libraries.keywordLibrary).
 *
 * `reconcileKeywords` is the single idempotent, NON-DESTRUCTIVE merge: it keeps every existing entity
 * (including planned-only words with no usage), refreshes each used word's `source` provenance from
 * current usage, and adopts any SEO term that has no entity yet. Run it on load and after import so the
 * vocabulary always covers reality without ever dropping the user's planned words.
 */

import type { KeywordEntity, KeywordSource, Seo, SiloWorkspace } from './types';
import { newId } from './factory';

/** Identity key for a keyword: trimmed + lower-cased. Empty string for blank. */
export const normalizeTerm = (t: string): string => t.trim().toLowerCase();

/** Every keyword string on one Seo (core + long-tail), trimmed, blanks dropped. */
const seoTerms = (seo: Seo): string[] =>
  [...seo.coreKeywords, ...seo.longTailKeywords].map(s => s.trim()).filter(Boolean);

/** Per-term usage provenance: is the term used by any cloud (wpPostId!=null) / local content? */
interface Usage {
  display: string; // first-seen display casing
  cloud: boolean;
  local: boolean;
}

/** Index every term used across content + category-archive SEO, tracking cloud/local provenance. */
function usageIndex(ws: SiloWorkspace): Map<string, Usage> {
  const idx = new Map<string, Usage>();
  const touch = (term: string, isCloud: boolean) => {
    const key = normalizeTerm(term);
    if (!key) return;
    const u = idx.get(key) ?? { display: term.trim(), cloud: false, local: false };
    if (isCloud) u.cloud = true;
    else u.local = true;
    idx.set(key, u);
  };
  for (const c of ws.contents) {
    const isCloud = c.wpPostId != null;
    for (const t of seoTerms(c.seo)) touch(t, isCloud);
  }
  // Category archive-SEO keywords count as usage too; treat a category with a WP term id as cloud.
  for (const n of ws.nodes) {
    if (n.system || !n.seo) continue;
    const isCloud = n.wpCategoryId != null;
    for (const t of seoTerms(n.seo)) touch(t, isCloud);
  }
  return idx;
}

const asSource = (cloud: boolean, local: boolean): KeywordSource =>
  cloud && local ? 'both' : cloud ? 'cloud' : 'local';

/** Provenance is MONOTONIC: a word hand-planned locally stays "local" even once it's matched to cloud
 *  content (→ "both"), and vice-versa. So we OR the entity's PRIOR provenance with its current usage. */
const mergeSource = (prior: KeywordSource, u: Usage): KeywordSource =>
  asSource(prior === 'cloud' || prior === 'both' || u.cloud, prior === 'local' || prior === 'both' || u.local);

/**
 * Merge the managed keyword list with actual SEO usage. Non-destructive + idempotent:
 *  - keeps every existing entity (planned-only words survive even with zero usage),
 *  - recomputes `source` for words that ARE used (planned-only words keep their stored source),
 *  - adopts any used term that has no entity yet (source from its usage).
 * Returns a NEW keywords array.
 */
export function reconcileKeywords(ws: SiloWorkspace): KeywordEntity[] {
  const usage = usageIndex(ws);
  const existing = ws.keywords ?? [];
  const byKey = new Map<string, KeywordEntity>();
  for (const k of existing) {
    const key = normalizeTerm(k.term);
    if (!key || byKey.has(key)) continue; // drop blanks / de-dup collisions
    byKey.set(key, { ...k });
  }
  // refresh source for existing entities that are used (monotonic union with prior provenance)
  for (const [key, ent] of byKey) {
    const u = usage.get(key);
    if (u) ent.source = mergeSource(ent.source, u);
  }
  // adopt used terms with no entity yet
  for (const [key, u] of usage) {
    if (byKey.has(key)) continue;
    byKey.set(key, { id: newId('k'), term: u.display, source: asSource(u.cloud, u.local) });
  }
  return Array.from(byKey.values());
}
