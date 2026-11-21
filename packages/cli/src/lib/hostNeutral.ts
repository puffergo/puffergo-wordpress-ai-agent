/**
 * Skills ship to customers, so they must not name the AI host they were written on.
 *
 * The kernel (CLI + SKILL.md + references) is host-agnostic by design: a skill is a folder with a
 * SKILL.md, and the script answers "where am I" itself (`puffergo whereami`) instead of the doc guessing
 * a host's directory. Only a deliberately separate shell — an expert/plugin manifest for one tool —
 * may know a host's name.
 *
 * This is the enforcement, not the aspiration: `pnpm -F puffergo bundle` bundles into the
 * customer-facing Skill folders and fails on a hit, and the public-repo sync runs the same rules again on
 * the generated tree. A rule only needs a line here to stop a regression from shipping.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Files we own under the Skill folders; `puffergo.mjs` and `preview.js/css` are build output. */
const SCANNED = /(^|\/)(SKILL\.md|[^/]+\.md|hostinger\.mjs)$/;

/** Host names that belong in a per-host shell, never in the shared kernel. */
const HOST_NAMES = /\b(WorkBuddy|CodeBuddy|DeepSeek Harness|Qwen Code|Codex)\b/i;

/** Per-host directories: a Skill cannot assume which one it was installed into. */
const HOST_DIRS = /~\/\.(workbuddy|codebuddy|codex|qwen|deepseek|claude)\b|\/\.(workbuddy|codebuddy)\//i;

/** One host's private credential store is not something the kernel should read or point at. */
const HOST_CREDENTIAL_STORE = /~\/\.mcp-auth\//i;

/** Client-only UI shells, e.g. a host's native address bar or settings tab. */
const CLIENT_UI = /MCP-ManagerAuth|workbuddyMainThread|mcp__browser/;

export type NeutralViolation = { file: string; line: number; rule: string; text: string };

/**
 * Host-specific references in files that ship inside a Skill.
 * `references/validation-notes.md` records what was *observed* on a host during testing, so a host name
 * there is a fact, not a dependency: it is exempt from HOST_NAMES/HOST_DIRS. The CLI must never read one.
 */
export function hostNeutralViolations(files: { path: string; text: string }[]): NeutralViolation[] {
  const out: NeutralViolation[] = [];
  for (const { path, text } of files) {
    if (!SCANNED.test(path)) continue;
    const isValidationNote = /\bvalidation-notes\.md$/.test(path);
    text.split('\n').forEach((line, i) => {
      const hit = (rule: string) => out.push({ file: path, line: i + 1, rule, text: line.trim().slice(0, 120) });
      if (!isValidationNote) {
        if (HOST_NAMES.test(line)) hit('host name in the shared kernel');
        if (HOST_DIRS.test(line)) hit("per-host Skills directory — use `puffergo whereami` instead");
      }
      if (HOST_CREDENTIAL_STORE.test(line)) hit('another MCP client’s credential store');
      if (CLIENT_UI.test(line)) hit('host-only UI internals');
    });
  }
  return out;
}

/** Formats violations for a bundle/sync failure message. */
export function describeViolations(v: NeutralViolation[]): string {
  return v.map(x => `  ${x.file}:${x.line}  [${x.rule}]\n     ${x.text}`).join('\n');
}

/**
 * The files a host-neutrality check reads: every markdown file and the scripts a Skill ships, found by
 * walking the Skill folders. Missing folders yield an empty list rather than throwing.
 */
export function skillMarkdownFiles(skillsRoot: string): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string): void => {
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.puffergo' || e.name === 'pages') continue;
        walk(p);
      } else if (/\.(md|mjs)$/.test(e.name) && e.name !== 'puffergo.mjs' && e.name !== 'preview.js') {
        out.push({ path: p.slice(skillsRoot.length + 1), text: readFileSync(p, 'utf8') });
      }
    }
  };
  walk(skillsRoot);
  return out;
}