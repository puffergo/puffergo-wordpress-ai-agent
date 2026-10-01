/**
 * The vault layout — shared with the Obsidian plugin, defined once in silo-core's store/layout:
 * `.puffergo/sites/<domain>/workspace.json` per connected site, `.puffergo/state.json` naming the
 * active one. There is ONE layout: `silo init` writes it, the plugin writes it, and a vault from an
 * older shape is migrated once by scripts/migrate-vault.mjs.
 */

import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyWorkspace } from '@puffergo/silo-core';
import { readWorkspace, writeWorkspace, listSites, resolveSite } from '../adapters/fileStore';

const dirs: string[] = [];
const newVault = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'silo-vault-'));
  dirs.push(d);
  mkdirSync(join(d, '.puffergo'), { recursive: true });
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const ws = (url: string, name = 'Site') => emptyWorkspace({ name, url });

/** Lay out a vault with per-site workspaces (and optionally an active one). */
function withSites(dir: string, sites: Record<string, string>, active?: string): void {
  for (const [key, url] of Object.entries(sites)) {
    mkdirSync(join(dir, '.puffergo', 'sites', key), { recursive: true });
    writeFileSync(join(dir, '.puffergo', 'sites', key, 'workspace.json'), JSON.stringify(ws(url)));
  }
  if (active)
    writeFileSync(join(dir, '.puffergo', 'state.json'), JSON.stringify({ activeDomain: active }));
}

describe('fileStore: per-site 布局', () => {
  it('按 state.json 选活动站点', async () => {
    const dir = newVault();
    withSites(dir, { 'a.com': 'https://a.com', 'b.com': 'https://b.com' }, 'b.com');
    expect((await readWorkspace(dir))?.profile.url).toBe('https://b.com');
  });

  it('--site 覆盖 state.json，URL 或裸域名都认', async () => {
    const dir = newVault();
    withSites(dir, { 'a.com': 'https://a.com', 'b.com': 'https://b.com' }, 'b.com');
    expect((await readWorkspace(dir, 'a.com'))?.profile.url).toBe('https://a.com');
    expect((await readWorkspace(dir, 'https://a.com/'))?.profile.url).toBe('https://a.com');
  });

  it('单站点 vault 不需要 state.json', async () => {
    const dir = newVault();
    withSites(dir, { 'only.com': 'https://only.com' });
    expect((await readWorkspace(dir))?.profile.url).toBe('https://only.com');
  });

  it('多站点又没得选时返回 null，让调用方去问，而不是瞎猜一个站', async () => {
    const dir = newVault();
    withSites(dir, { 'a.com': 'https://a.com', 'b.com': 'https://b.com' });
    expect(await readWorkspace(dir)).toBeNull();
    expect(await resolveSite(dir)).toBeNull();
    expect((await listSites(dir)).sort()).toEqual(['a.com', 'b.com']);
  });

  it('带端口的站点目录名合法（Windows 消毒后的 siteKey）', async () => {
    const dir = newVault();
    await writeWorkspace(dir, ws('http://localhost:8080'));
    expect(existsSync(join(dir, '.puffergo', 'sites', 'localhost_8080', 'workspace.json'))).toBe(true);
    expect((await readWorkspace(dir))?.profile.url).toBe('http://localhost:8080');
  });

  it('写回自己的站点目录，并把该站刷成活动站', async () => {
    const dir = newVault();
    withSites(dir, { 'a.com': 'https://a.com', 'b.com': 'https://b.com' }, 'a.com');
    await writeWorkspace(dir, ws('https://b.com', 'B'));
    const saved = JSON.parse(
      readFileSync(join(dir, '.puffergo', 'sites', 'b.com', 'workspace.json'), 'utf8'),
    );
    expect(saved.profile.name).toBe('B');
    expect(JSON.parse(readFileSync(join(dir, '.puffergo', 'state.json'), 'utf8')).activeDomain).toBe('b.com');
    // a.com's own workspace is untouched
    expect(JSON.parse(readFileSync(join(dir, '.puffergo', 'sites', 'a.com', 'workspace.json'), 'utf8')).profile.url).toBe(
      'https://a.com',
    );
  });

  it('空目录仍然是「没有工作区」', async () => {
    expect(await readWorkspace(newVault())).toBeNull();
  });
});
