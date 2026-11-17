/**
 * `puffergo logout` — the one command that deletes credentials, so it gets the tests: it must remove
 * exactly one site and leave the rest of the store, the other sites' switches, and the customer's
 * workspace alone. `activeDomain` is the trap: left pointing at a disconnected site it fails every later
 * command in that folder as `not_logged_in`, even when this machine still has other sites.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdLogout } from '../lib/logoutCmd';

const A = 'https://a.test';
const B = 'https://b.test';

const creds = {
  sites: { [A]: { username: 'u', appPassword: 'a' }, [B]: { username: 'u', appPassword: 'b' } },
};

/** A scratch credential store + work folder, so no test touches the real `~/.puffergo`. */
async function scratch(activeDomain?: string) {
  const base = await mkdtemp(join(tmpdir(), 'puffergo-logout-test-'));
  const cfg = join(base, 'credentials.json');
  await writeFile(cfg, JSON.stringify(creds), 'utf8');
  const work = join(base, 'work');
  const siteA = join(work, '.puffergo/sites/a.test');
  const siteB = join(work, '.puffergo/sites/b.test');
  await mkdir(siteA, { recursive: true });
  await mkdir(siteB, { recursive: true });
  await writeFile(join(siteA, 'config.json'), JSON.stringify({ editLive: { on: true } }), 'utf8');
  await writeFile(join(siteA, 'workspace.json'), JSON.stringify({ version: 1 }), 'utf8');
  await writeFile(join(siteB, 'config.json'), JSON.stringify({ editLive: { on: true } }), 'utf8');
  if (activeDomain) await writeFile(join(work, '.puffergo/state.json'), JSON.stringify({ activeDomain }), 'utf8');
  await writeFile(
    join(base, 'login-state.json'),
    JSON.stringify({ siteUrl: A, status: 'approved', startedAt: 1 }),
    'utf8',
  );
  vi.stubEnv('PUFFERGO_LOGIN_STATE', join(base, 'login-state.json'));
  return { base, cfg, work, siteA, siteB };
}

const store = async (cfg: string) => Object.keys(JSON.parse(await readFile(cfg, 'utf8')).sites);

describe('puffergo logout', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('without a site only lists them — nothing is removed', async () => {
    const { cfg, work } = await scratch('a.test');
    const out = await cmdLogout(work, undefined, cfg);
    expect(out).toMatchObject({ ok: false, code: 'need_site', sites: [A, B], active: A });
    expect(await store(cfg)).toEqual([A, B]);
    expect(existsSync(join(work, '.puffergo/state.json'))).toBe(true);
  });

  it('removes that one site, its pointer, receipt and switch — and keeps the content', async () => {
    const { base, cfg, work, siteA } = await scratch('a.test');
    const out = await cmdLogout(work, 'a.test', cfg); // 裸域名 == 存的是 https://a.test
    expect(out).toMatchObject({
      ok: true,
      siteUrl: A,
      remaining: [B],
      revokeUrl: `${A}/wp-admin/profile.php#application-passwords-section`,
    });
    expect(out.cleared).toEqual({ activeSite: true, loginState: true, editLive: true });

    expect(await store(cfg)).toEqual([B]);
    expect(existsSync(join(work, '.puffergo/state.json'))).toBe(false);
    expect(existsSync(join(base, 'login-state.json'))).toBe(false);
    expect(existsSync(join(siteA, 'config.json'))).toBe(false);
    expect(existsSync(join(siteA, 'workspace.json'))).toBe(true); // 客户的台账不删
  });

  it('leaves another site’s pointer and switches alone', async () => {
    const { cfg, work, siteB } = await scratch('b.test');
    const out = await cmdLogout(work, A, cfg);
    // A's own receipt and switch still go — they belong to the authorization that just ended.
    expect(out.cleared).toEqual({ activeSite: false, loginState: true, editLive: true });
    expect(await store(cfg)).toEqual([B]);
    expect(existsSync(join(work, '.puffergo/state.json'))).toBe(true);
    expect(existsSync(join(siteB, 'config.json'))).toBe(true); // b.test 的开关不被动
  });

  it('reports a site this machine never connected instead of guessing', async () => {
    const { cfg, work } = await scratch();
    expect(await cmdLogout(work, 'nope.test', cfg)).toMatchObject({ ok: false, code: 'not_connected', sites: [A, B] });
    expect(await store(cfg)).toEqual([A, B]);
  });
});
