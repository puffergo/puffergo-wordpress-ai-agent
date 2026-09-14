/**
 * SEO field limits — the SINGLE source of truth for how long titles/descriptions may be and how many
 * focus keywords a page may target. Consumed by focusKeywordString (hard cap on write), healthCheck
 * (soft guardrails the agent reads to self-correct), and surfaced to the AI operator via SKILL.md.
 *
 * Focus-keyword cap: Rank Math free exposes only 1 focus keyword in its UI, Rank Math Pro allows 5.
 * PufferGo writes meta through its own `/rankmath/v1/updateMeta` route (backend, not the UI), so we can
 * seat the full 5 even on the free plugin — but never MORE than 5, which is the real ceiling everywhere.
 * Shape: exactly 1 core (the primary focus keyword) + up to 4 long-tail = 5 total.
 *
 * Length limits are a CHAR proxy for Google's pixel-based truncation (English-latin text). CJK glyphs are
 * ~2x wider, so a mostly-Chinese page should aim ~half these — the SerpPreview does the true pixel check.
 */

/** SEO title: too short = wastes the strongest ranking signal; too long = truncated in SERP. */
export const TITLE_MIN = 30;
export const TITLE_MAX = 60;

/** Meta description: too short = thin snippet; too long = truncated. */
export const DESC_MIN = 120;
export const DESC_MAX = 160;

/** Exactly one core (primary) focus keyword per page. */
export const CORE_KEYWORDS_MAX = 1;
/** Up to four secondary long-tail focus keywords. */
export const LONGTAIL_KEYWORDS_MAX = 4;
/** Hard ceiling on total focus keywords written to Rank Math (1 core + 4 long-tail). */
export const FOCUS_KEYWORDS_MAX = CORE_KEYWORDS_MAX + LONGTAIL_KEYWORDS_MAX;
