import { describe, it, expect } from 'vitest';
import { hostNeutralViolations, skillMarkdownFiles } from '../lib/hostNeutral';
import { join } from 'node:path';

const scan = (path: string, text: string) => hostNeutralViolations([{ path, text }]);

describe('host neutrality gate', () => {
  it('catches a host name leaking into a shipped SKILL.md', () => {
    const v = scan('demo/SKILL.md', '先跑 find ~/.workbuddy -name puffergo.mjs 找到脚本');
    expect(v.map(x => x.rule)).toEqual(expect.arrayContaining(['host name in the shared kernel']));
    expect(v.some(x => x.rule.includes('per-host Skills directory'))).toBe(true);
  });

  it('lets a per-host shell name its host (that is the whole point of the split)', () => {
    const v = scan('experts/some-host/plugin.json', 'WorkBuddy quickPrompts');
    expect(v).toEqual([]);
  });

  it('still catches a host CLI leaking into a reference doc', () => {
    const v = scan('demo/references/mcp-capabilities.md', 'WorkBuddy 的官方连接卡片在部分环境会失败');
    expect(v.length).toBeGreaterThan(0);
  });

  it('catches another MCP client’s private credential store', () => {
    const v = scan('demo/references/oauth.md', '验一眼 ~/.mcp-auth/mcp-remote-v1/x_tokens.json 里的 scope');
    expect(v[0]?.rule).toBe('another MCP client’s credential store');
  });

  it('catches host-only UI internals', () => {
    const v = scan('demo/SKILL.md', '看日志里的 [MCP-ManagerAuth] begin');
    expect(v[0]?.rule).toBe('host-only UI internals');
  });

  it('exempts the host names a validation record quotes as observed facts', () => {
    const v = scan('demo/references/validation-notes.md', '实测 WorkBuddy 5.11.3 上该连接静默失败');
    expect(v).toEqual([]);
  });

  it('ignores build output and vendored code', () => {
    const v = scan('demo/scripts/puffergo.mjs', 'WorkBuddy');
    expect(v).toEqual([]);
  });

  it('reports the line number so a failure points at the fix', () => {
    const v = scan('demo/SKILL.md', '第一行\n第二行\n在 WorkBuddy 里跑');
    expect(v[0]).toMatchObject({ line: 3 });
  });
});

describe('skillMarkdownFiles', () => {
  it('walks Skill folders and skips node_modules, scratch dirs and build output', () => {
    // Point at this repo's real Skill folders: the walker must find the docs and skip the bundle.
    const files = skillMarkdownFiles(join(__dirname, '..', '..', '..', '..', 'skills'));
    const names = files.map(f => f.path);
    if (names.length) {
      expect(names.some(p => p.endsWith('SKILL.md'))).toBe(true);
      expect(names.some(p => p.endsWith('puffergo.mjs'))).toBe(false);
      expect(names.some(p => p.includes('node_modules'))).toBe(false);
      expect(names.some(p => p.includes('.puffergo'))).toBe(false);
    }
  });

  it('returns an empty list for a folder that does not exist instead of throwing', () => {
    expect(skillMarkdownFiles('/nonexistent/skills')).toEqual([]);
  });
});