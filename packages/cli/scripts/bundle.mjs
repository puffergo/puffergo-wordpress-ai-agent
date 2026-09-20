/** Bundles the CLI into one dependency-free ESM file (Node ≥18) and ships it inside every Skill, with the shared
 *  block references (skill-refs/blocks, written once) copied into the Skills that write blocks. */
import { build } from 'esbuild';
import { copyFileSync, cpSync, mkdirSync, rmSync } from 'node:fs';
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
  banner: { js: "#!/usr/bin/env node\nimport{createRequire}from'module';const require=createRequire(import.meta.url);" },
  logLevel: 'warning',
});
for (const skill of ['wordpress-bulk-product-upload', 'wordpress-page-builder', 'wordpress-seo-silo']) {
  const dest = join(pkg, '..', '..', 'skills', skill, 'scripts', 'puffergo.mjs');
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(out, dest);
}
for (const skill of ['wordpress-bulk-product-upload', 'wordpress-page-builder']) {
  const dest = join(pkg, '..', '..', 'skills', skill, 'references', 'blocks');
  rmSync(dest, { recursive: true, force: true });
  cpSync(join(pkg, 'skill-refs', 'blocks'), dest, { recursive: true });
}
console.log(`bundled → ${out} (+ copied into skills/*/scripts, block references into skills/*/references/blocks)`);
