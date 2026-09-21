/**
 * The three Skills tell the customer the same thing about logging in and about where the site password
 * lives. That text is deliberately inline in each SKILL.md — the AI needs it before it runs the first
 * command, i.e. before it would read a reference file — so it is copied, and copies drift. This test is
 * the guard: edit one copy and it fails, naming the file that fell behind.
 *
 * Only the command each Skill verifies with differs, so that one token is normalised away.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SKILLS_DIR = join(import.meta.dirname, '..', '..', '..', '..', 'skills');

/** Skill → the command it runs to prove the authorisation took. */
const VERIFY_COMMAND: Record<string, string> = {
  'wordpress-page-builder': 'pages types',
  'wordpress-bulk-product-upload': 'products schema',
  'wordpress-seo-silo': 'silo status',
};

const skills = Object.keys(VERIFY_COMMAND);

const read = (skill: string) => readFileSync(join(SKILLS_DIR, skill, 'SKILL.md'), 'utf8');

/** The `## <name>` section's body, with the Skill's own verify command blanked out. */
function section(skill: string, name: string): string {
  const doc = read(skill);
  const body = new RegExp(`\\n## ${name}\\n([\\s\\S]*?)(?=\\n## |$)`).exec(doc);
  expect(body, `${skill} has no "## ${name}" section`).not.toBeNull();
  return body![1]!.trim().split(VERIFY_COMMAND[skill]!).join('<verify>');
}

describe('SKILL.md 三份共用的段落', () => {
  it('授权 的说法完全一致', () => {
    const [first, ...rest] = skills.map(s => section(s, '授权'));
    for (const [i, body] of rest.entries())
      expect(body, `${skills[i + 1]} 的「授权」和 ${skills[0]} 不一致`).toBe(first);
  });

  it('每份都写了不要问「点好了吗」', () => {
    for (const skill of skills) expect(section(skill, '授权'), skill).toContain('不要问客户「点好了吗」');
  });

  it('每份都写了凭据在本机、不要打开', () => {
    for (const skill of skills) {
      const doc = read(skill);
      expect(doc, skill).toContain('~/.puffergo/credentials.json');
      expect(doc, skill).toMatch(/不要(打开它|打开)/);
    }
  });

  it('每份都写了 Node 版本下限和自己安装', () => {
    for (const skill of skills) expect(read(skill), skill).toContain('winget install OpenJS.NodeJS.LTS');
  });
});
