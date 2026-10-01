/** Bundles the CLI into one dependency-free ESM file (Node ≥18) and ships it inside every Skill, with the shared
 *  block references (skill-refs/blocks, written once) copied into the Skills that write blocks, and the built
 *  read-only preview bundle (`silo view`) copied next to the script in the Skill that uses it.
 *
 *  The bundle is built once; each Skill gets its own copy with the `__PUFFERGO_SKILL_NAME__` placeholder
 *  (packages/silo-cli/src/skillName.ts) replaced by that Skill's folder name, so user-facing messages —
 *  e.g. "download the latest <skill>" in the update_skill error — name the Skill the customer actually has. */
import { build } from 'esbuild';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_NAME_PLACEHOLDER = '__PUFFERGO_SKILL_NAME__';
const SKILLS = ['puffergo-wordpress-products', 'puffergo-wordpress-content'];
/** Skills whose `silo view` needs the preview page bundle next to puffergo.mjs. */
const PREVIEW_SKILLS = ['puffergo-wordpress-content'];

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(pkg, 'dist', 'puffergo.mjs');
await build({
  entryPoints: [join(pkg, 'src', 'index.ts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  banner: {
    js: "#!/usr/bin/env node\nimport{createRequire}from'module';const require=createRequire(import.meta.url);",
  },
  logLevel: 'warning',
});
const bundled = readFileSync(out, 'utf8');
if (!bundled.includes(SKILL_NAME_PLACEHOLDER))
  throw new Error(`bundle no longer contains ${SKILL_NAME_PLACEHOLDER} — did skillName.ts change?`);
// The dev/npm entry (bin/puffergo.mjs → dist/puffergo.mjs) is not shipped inside a Skill folder, so it
// gets the CLI's own name; the per-skill copies below each get their folder name.
writeFileSync(out, bundled.split(SKILL_NAME_PLACEHOLDER).join('puffergo'));
for (const skill of SKILLS) {
  const dest = join(pkg, '..', '..', 'skills', skill, 'scripts', 'puffergo.mjs');
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, bundled.split(SKILL_NAME_PLACEHOLDER).join(skill));
}

// `silo view`'s page bundle — built by `pages/silo-preview` (vite, one IIFE + one stylesheet) and read
// at runtime from next to puffergo.mjs. Only the content Skill has a `view` command, so only it carries
// the ~2MB bundle. Missing build output is a hard error: shipping the Skill without it would leave
// `silo view` broken in the customer's hands with no sign of it here.
const previewSrc = join(pkg, '..', '..', 'dist', 'silo-preview');
if (!existsSync(join(previewSrc, 'preview.js'))) {
  throw new Error(`missing ${previewSrc}/preview.js — run \`pnpm -F @puffergo/silo-preview build\` first`);
}
for (const skill of PREVIEW_SKILLS)
  for (const asset of ['preview.js', 'preview.css']) {
    const from = join(previewSrc, asset);
    if (!existsSync(from)) continue; // preview.css is absent only if the page ever ships style-free
    copyFileSync(from, join(pkg, '..', '..', 'skills', skill, 'scripts', asset));
  }
for (const skill of SKILLS) {
  const dest = join(pkg, '..', '..', 'skills', skill, 'references', 'blocks');
  rmSync(dest, { recursive: true, force: true });
  cpSync(join(pkg, 'skill-refs', 'blocks'), dest, { recursive: true });
}
console.log(
  `bundled → ${out} (+ copied into skills/*/scripts with the skill name baked in, block references into skills/*/references/blocks, preview bundle into ${PREVIEW_SKILLS.join(', ')})`,
);
