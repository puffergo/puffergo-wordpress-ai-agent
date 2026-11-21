/**
 * Which shipped build this is.
 *
 * The Script travels inside the Skill folder, so "I reinstalled it" proves nothing on its own: this is what
 * a customer's AI quotes back when a fix did or did not arrive. It used to be a hand-edited constant, and it
 * stayed at `2026-10-23.1` through weeks of changes — so every customer reported the same id and the first
 * question of every bug report ("which version are you on?") had no answer.
 *
 * `scripts/bundle.mjs` now stamps the real value at build time: the workspace version plus the commit the
 * build came from, e.g. `1.9.0+g0e252c2`, `+g…-dirty` when the tree was not committed. Source only carries
 * this placeholder and never prints it — the bundle always stamps something.
 */
export const BUILD = '__PUFFERGO_BUILD__';