/** Bundles the CLI into one dependency-free ESM file (Node ≥18) and ships it inside every Skill, with the shared
 *  block references (skill-refs/blocks, written once) copied into the Skills that write blocks, and the built
 *  read-only preview bundle (`silo view`) copied next to the script in the Skill that uses it.
 *
 *  The bundle is built once; each Skill gets its own copy with the `__PUFFERGO_SKILL_NAME__` placeholder
 *  (packages/silo-cli/src/skillName.ts) replaced by that Skill's folder name, so user-facing messages —
 *  e.g. "download the latest <skill>" in the update_skill error — name the Skill the customer actually has.
 *
 *  The build id (`puffergo version`) is stamped the same way from `__PUFFERGO_BUILD__`: version + commit, so a
 *  customer's report identifies the exact code instead of a constant nobody remembered to bump. */
import { build } from 'esbuild';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SKILL_NAME_PLACEHOLDER = '__PUFFERGO_SKILL_NAME__';
import { hostNeutralViolations, describeViolations, skillMarkdownFiles } from '../src/lib/hostNeutral.ts';
const SKILLS = ['puffergo-wordpress-products', 'puffergo-wordpress-content', 'puffergo-wordpress-deploy'];
/** Skills whose `silo view` needs the preview page bundle next to puffergo.mjs. */
const PREVIEW_SKILLS = ['puffergo-wordpress-content'];

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(pkg, 'dist', 'puffergo.mjs');
const BUILD_PLACEHOLDER = '__PUFFERGO_BUILD__';

/** Version + short commit of the tree this build came from. A build must never fail because git is
 *  unavailable: fall back to the version and a timestamp. */
function stamp() {
  const pkgRoot = join(pkg, '..', '..');
  const internal = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).version;
  const read = p => {
    try {
      return JSON.parse(readFileSync(p, 'utf8')).version;
    } catch {
      return undefined;
    }
  };
  // Product version: this package's version internally, the repository root's version in the public repo
  // (where packages/cli is pinned to the npm release and its own version has no meaning to a customer).
  const version = internal === '0.1.0' ? (read(join(pkgRoot, 'package.json')) ?? internal) : internal;
  const git = args => execFileSync('git', args, { cwd: pkgRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    const commit = git(['rev-parse', '--short=7', 'HEAD']);
    return `${version}+g${commit}`;
  } catch {
    return `${version}+t${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)}`;
  }
}

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
if (!bundled.includes(BUILD_PLACEHOLDER))
  throw new Error(`bundle no longer contains ${BUILD_PLACEHOLDER} — did buildId.ts change?`);
const buildId = stamp();
const stamped = bundled.split(BUILD_PLACEHOLDER).join(buildId);
// The dev/npm entry (bin/puffergo.mjs → dist/puffergo.mjs) is not shipped inside a Skill folder, so it
// gets the CLI's own name; the per-skill copies below each get their folder name.
writeFileSync(out, stamped.split(SKILL_NAME_PLACEHOLDER).join('puffergo'));
for (const skill of SKILLS) {
  const dest = join(pkg, '..', '..', 'skills', skill, 'scripts', 'puffergo.mjs');
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, stamped.split(SKILL_NAME_PLACEHOLDER).join(skill));
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

// Skills ship to customers and must stay host-neutral: the kernel asks the script where it lives
// (`puffergo whereami`) instead of naming one AI host's folder. A per-host shell may name its host; the
// shared kernel may not. This runs last, so a violating build never reaches a Skill folder or the public repo.
const neutralViolations = hostNeutralViolations(skillMarkdownFiles(join(pkg, '..', '..', 'skills')));
if (neutralViolations.length) {
  console.error(`\n✖ ${neutralViolations.length} host-specific reference(s) in the shared kernel:\n${describeViolations(neutralViolations)}`);
  console.error('  Move it into a per-host shell, or rephrase it against `puffergo whereami`.');
  process.exit(1);
}
console.log(`build id: ${buildId}`);
console.log(
  `bundled → ${out} (+ copied into skills/*/scripts with the skill name baked in, block references into skills/*/references/blocks, preview bundle into ${PREVIEW_SKILLS.join(', ')})`,
);
