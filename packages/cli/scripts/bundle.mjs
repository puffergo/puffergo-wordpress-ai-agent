/** Bundles the CLI into one dependency-free ESM file (Node ≥18) and ships it inside every Skill, with the shared
 *  block references (skill-refs/blocks, written once) copied into the Skills that write blocks, and the built
 *  read-only preview bundle (`silo view`) copied next to the script in the Skill that uses it. */
import { build } from 'esbuild';
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
for (const skill of ['wordpress-bulk-product-upload', 'wordpress-page-builder', 'wordpress-seo-silo']) {
  const dest = join(pkg, '..', '..', 'skills', skill, 'scripts', 'puffergo.mjs');
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(out, dest);
}

// `silo view`'s page bundle — built by `pages/silo-preview` (vite, one IIFE + one stylesheet) and read
// at runtime from next to puffergo.mjs. Only the silo Skill has a `view` command, so only it carries
// the ~2MB bundle. Missing build output is a hard error: shipping the Skill without it would leave
// `silo view` broken in the customer's hands with no sign of it here.
const previewSrc = join(pkg, '..', '..', 'dist', 'silo-preview');
if (!existsSync(join(previewSrc, 'preview.js'))) {
  throw new Error(`missing ${previewSrc}/preview.js — run \`pnpm -F @puffergo/silo-preview build\` first`);
}
for (const asset of ['preview.js', 'preview.css']) {
  const from = join(previewSrc, asset);
  if (!existsSync(from)) continue; // preview.css is absent only if the page ever ships style-free
  copyFileSync(from, join(pkg, '..', '..', 'skills', 'wordpress-seo-silo', 'scripts', asset));
}
for (const skill of ['wordpress-bulk-product-upload', 'wordpress-page-builder']) {
  const dest = join(pkg, '..', '..', 'skills', skill, 'references', 'blocks');
  rmSync(dest, { recursive: true, force: true });
  cpSync(join(pkg, 'skill-refs', 'blocks'), dest, { recursive: true });
}
console.log(
  `bundled → ${out} (+ copied into skills/*/scripts, block references into skills/*/references/blocks, preview bundle into the silo Skill)`,
);
