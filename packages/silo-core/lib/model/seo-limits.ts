/**
 * SEO field limits — how long titles/descriptions should be and how many focus keywords a page may target.
 * Consumed by focusKeywords (hard cap on write), healthCheck and content-score (soft guardrails), and
 * surfaced to the AI operator via SKILL.md.
 *
 * The PufferGo plugin is the source of truth: it publishes its limits (GET /puffergo/v1/seo-limits, and on
 * every /seo-meta read), and `applySeoLimits` adopts them. The values below are the defaults for a site
 * without the plugin, and are deliberately the SAME numbers the plugin publishes — 1 core + 5 long-tail — so
 * a page targets the same keywords on any site and nobody has to ask which kind of site this is. We offer the
 * 6th keyword either way; on a site without the plugin, Rank Math's own UI shows only the first 5 of them
 * (the plugin raises that ceiling through the rank_math/focus_keyword/maxtags filter), which costs nothing:
 * the keyword is stored, it just isn't scored there.
 *
 * Length limits are DISPLAY WIDTHS (seoWidth): a Chinese / Japanese / Korean or full-width character counts 2,
 * others 1 — a proxy for Google's pixel truncation that holds for every language, the same measure as the
 * plugin (PHP mb_strwidth). The SerpPreview does the true pixel check.
 */

/** SEO title: too short = wastes the strongest ranking signal; too long = truncated in SERP. */
export let TITLE_MIN = 30;
export let TITLE_MAX = 60;

/** Meta description: too short = thin snippet; too long = truncated. */
export let DESC_MIN = 120;
export let DESC_MAX = 160;

/** Exactly one core (primary) focus keyword per page. */
export let CORE_KEYWORDS_MAX = 1;
/** Secondary long-tail focus keywords. */
export let LONGTAIL_KEYWORDS_MAX = 5;
/** Hard ceiling on total focus keywords written (core + long-tail). */
export let FOCUS_KEYWORDS_MAX = CORE_KEYWORDS_MAX + LONGTAIL_KEYWORDS_MAX;

/** The limits as the PufferGo plugin publishes them (PufferGo_Seo_Meta::limits()). */
export interface SeoLimits {
  titleRecommended: [number, number];
  descriptionRecommended: [number, number];
  coreKeywordsMax: number;
  longTailKeywordsMax: number;
}

/** Adopt the site's limits (ES module live bindings: every importer sees the new values). */
export function applySeoLimits(l: SeoLimits | null | undefined): void {
  if (!l) return;
  [TITLE_MIN, TITLE_MAX] = l.titleRecommended;
  [DESC_MIN, DESC_MAX] = l.descriptionRecommended;
  CORE_KEYWORDS_MAX = l.coreKeywordsMax;
  LONGTAIL_KEYWORDS_MAX = l.longTailKeywordsMax;
  FOCUS_KEYWORDS_MAX = CORE_KEYWORDS_MAX + LONGTAIL_KEYWORDS_MAX;
}

/** East Asian wide / full-width ranges, as PHP mb_strwidth counts them (width 2). */
const WIDE =
  /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]|[\u{20000}-\u{3FFFD}]/u;

/** Display width of an SEO title / description: wide characters count 2, others 1. */
export function seoWidth(text: string): number {
  let width = 0;
  for (const ch of text.trim()) width += WIDE.test(ch) ? 2 : 1;
  return width;
}

/** A width range for people: "30–60（中文约 15–30 字）". */
export function widthRange(min: number, max: number): string {
  return `${min}–${max}（中文约 ${Math.floor(min / 2)}–${Math.floor(max / 2)} 字）`;
}
