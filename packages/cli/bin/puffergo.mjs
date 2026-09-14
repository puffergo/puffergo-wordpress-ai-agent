#!/usr/bin/env node
/** Dev entry for `puffergo`: runs the esbuild bundle (the same single file shipped in the Skills).
 *  Build it with `pnpm -F puffergo bundle`. Running the TS source through tsx is not used
 *  here: under tsx, the shared authorize module loads as CommonJS and `login`'s lazy import hits a require(esm)
 *  cycle on Node 24. `bin/silo.mjs` (legacy silo commands) still runs from source. */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const bundle = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'puffergo.mjs');
if (!existsSync(bundle)) {
  process.stderr.write('✖ 缺少 dist/puffergo.mjs：先运行 pnpm -F puffergo bundle\n');
  process.exit(1);
}
await import(pathToFileURL(bundle).href);
