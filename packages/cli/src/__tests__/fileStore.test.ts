/**
 * The vault is shared with the Obsidian plugin, which stores one file per site (`.silo/sites/*.json`)
 * and DELETES the CLI's `.silo/workspace.json` when it migrates a vault it opens for the first time.
 * Before fileStore understood that layout, every CLI command reported `no_workspace` on a vault that
 * was perfectly intact — and the Skill's error table then sends the agent to `silo init`, which would
 * drop an empty workspace beside the customer's real, already-pushed silo.
 *
 * These tests pin both halves: read either layout, and write back the one the vault already uses.
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
  mkdirSync(join(d, '.silo'), { recursive: true });
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const ws = (url: string, name = 'Site') => emptyWorkspace({ name, url });

/** Lay out a vault the way the Obsidian plugin does. */
function asSitesLayout(dir: string, sites: Record<string, string>, active?: string): void {
  mkdirSync(join(dir, '.silo', 'sites'), { recursive: true });
  for (const [key, url] of Object.entries(sites))
    writeFileSync(join(dir, '.silo', 'sites', `${key}.json`), JSON.stringify(ws(url)));
  if (active) writeFileSync(join(dir, '.silo', 'state.json'), JSON.stringify({ activeDomain: active }));
}

describe('fileStore: 两种布局共存', () => {
  it('读得了旧布局(workspace.json)', async () => {
    const dir = newVault();
    writeFileSync(join(dir, '.silo', 'workspace.json'), JSON.stringify(ws('https://old.com')));
    expect((await readWorkspace(dir))?.profile.url).toBe('https://old.com');
  });

  it('读得了 Obsidian 的 sites/ 布局，按 state.json 选活动站点', async () => {
    const dir = newVault();
    asSitesLayout(dir, { 'a.com': 'https://a.com', 'b.com': 'https://b.com' }, 'b.com');
    expect((await readWorkspace(dir))?.profile.url).toBe('https://b.com');
  });

  it('--site 覆盖 state.json，URL 或裸域名都认', async () => {
    const dir = newVault();
    asSitesLayout(dir, { 'a.com': 'https://a.com', 'b.com': 'https://b.com' }, 'b.com');
    expect((await readWorkspace(dir, 'a.com'))?.profile.url).toBe('https://a.com');
    expect((await readWorkspace(dir, 'https://a.com/'))?.profile.url).toBe('https://a.com');
  });

  it('单站点 vault 不需要 state.json', async () => {
    const dir = newVault();
    asSitesLayout(dir, { 'only.com': 'https://only.com' });
    expect((await readWorkspace(dir))?.profile.url).toBe('https://only.com');
  });

  it('多站点又没得选时返回 null，让调用方去问，而不是瞎猜一个站', async () => {
    const dir = newVault();
    asSitesLayout(dir, { 'a.com': 'https://a.com', 'b.com': 'https://b.com' });
    expect(await readWorkspace(dir)).toBeNull();
    expect(await resolveSite(dir)).toBeNull();
    expect((await listSites(dir)).sort()).toEqual(['a.com', 'b.com']);
  });

  it('sites/ 存在时，绝不回退到残留的 workspace.json', async () => {
    // A stale legacy file beside sites/ must never shadow the real active site.
    const dir = newVault();
    asSitesLayout(dir, { 'real.com': 'https://real.com' }, 'real.com');
    writeFileSync(join(dir, '.silo', 'workspace.json'), JSON.stringify(ws('https://stale.com')));
    expect((await readWorkspace(dir))?.profile.url).toBe('https://real.com');
  });

  it('写回时跟随 vault 现有布局：sites/ 的写回 sites/，并刷新 state.json', async () => {
    const dir = newVault();
    asSitesLayout(dir, { 'a.com': 'https://a.com', 'b.com': 'https://b.com' }, 'a.com');
    await writeWorkspace(dir, ws('https://b.com', 'B'));
    expect(existsSync(join(dir, '.silo', 'workspace.json'))).toBe(false);
    const saved = JSON.parse(readFileSync(join(dir, '.silo', 'sites', 'b.com.json'), 'utf8'));
    expect(saved.profile.name).toBe('B');
    expect(JSON.parse(readFileSync(join(dir, '.silo', 'state.json'), 'utf8')).activeDomain).toBe('b.com');
  });

  it('写回时跟随 vault 现有布局：旧布局的留在旧布局，不会凭空造出 sites/', async () => {
    const dir = newVault();
    writeFileSync(join(dir, '.silo', 'workspace.json'), JSON.stringify(ws('https://old.com')));
    await writeWorkspace(dir, ws('https://old.com', 'Renamed'));
    expect(existsSync(join(dir, '.silo', 'sites'))).toBe(false);
    expect(JSON.parse(readFileSync(join(dir, '.silo', 'workspace.json'), 'utf8')).profile.name).toBe('Renamed');
  });

  it('空目录仍然是「没有工作区」', async () => {
    expect(await readWorkspace(newVault())).toBeNull();
  });
});
