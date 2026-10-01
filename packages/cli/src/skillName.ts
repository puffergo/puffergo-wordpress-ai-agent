/**
 * The name of the Skill this CLI copy ships inside. The source carries a placeholder; `scripts/bundle.mjs`
 * stamps the real name into each Skill's copy at build time (one bundle, one replace pass per Skill), so
 * user-facing text like the "update this Skill" hint always names the Skill the customer actually
 * installed — no hardcoded string drifting between copies. Running from source (tsx), it stays the
 * placeholder, which no shipped message ever shows.
 */
export const SKILL_NAME = '__PUFFERGO_SKILL_NAME__';
