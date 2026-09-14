/** Bundles the CLI into one dependency-free ESM file (Node ≥18) and ships it inside both Skills. */
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
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
for (const skill of ['wordpress-bulk-product-upload', 'wordpress-seo-silo']) {
  const dest = join(pkg, '..', '..', 'skills', skill, 'scripts', 'puffergo.mjs');
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(out, dest);
}
console.log(`bundled → ${out} (+ copied into skills/*/scripts)`);
