/**
 * `puffergo login` / `login status` — the part that broke on a customer's Windows machine: the detached
 * process holding the 127.0.0.1 callback port can be reaped by whatever ran the command, and the
 * customer's click then lands on a dead port. `login status` is what recovers it: whoever can hold the
 * recorded port is where the redirect lands, so it takes the listener over instead of polling a file
 * nobody will ever write. These drive the real commands against a real loopback server.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as http from 'node:http';
import * as net from 'node:net';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdLoginStatus, normalizeSiteUrl } from '../lib/loginCmd';

const SITE = 'https://hechengindustry.test';

/** A port nothing is using — the number a takeover has to find again. */
async function freePort(): Promise<number> {
  const probe = http.createServer();
  await new Promise<void>(r => probe.listen(0, '127.0.0.1', () => r()));
  const { port } = probe.address() as { port: number };
  await new Promise<void>(r => probe.close(() => r()));
  return port;
}

const listening = (port: number): Promise<boolean> =>
  new Promise(res => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.on('connect', () => {
      socket.destroy();
      res(true);
    });
    socket.on('error', () => res(false));
    socket.setTimeout(150, () => res(false));
  });

async function waitUntilListening(port: number, ms = 3000): Promise<boolean> {
  for (let i = 0; i < ms / 50; i++) {
    if (await listening(port)) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

/** Point every file the flow touches at a scratch dir, and say no to opening a browser. */
async function scratch(options: {
  status: 'pending' | 'approved' | 'failed';
  port?: number;
  startedAt?: number;
}): Promise<{ dir: string; statePath: string; credPath: string }> {
  const base = await mkdtemp(join(tmpdir(), 'puffergo-login-test-'));
  const paths = {
    dir: base,
    statePath: join(base, 'login-state.json'),
    credPath: join(base, 'credentials.json'),
  };
  vi.stubEnv('PUFFERGO_LOGIN_STATE', paths.statePath);
  vi.stubEnv('PUFFERGO_CONFIG', paths.credPath);
  vi.stubEnv('PUFFERGO_NO_BROWSER', '1');
  const { writeFile } = await import('node:fs/promises');
  await writeFile(
    paths.statePath,
    JSON.stringify({
      siteUrl: SITE,
      status: options.status,
      startedAt: options.startedAt ?? Date.now(),
      port: options.port,
    }),
    'utf8',
  );
  return paths;
}

const TEN_MINUTES = 10 * 60 * 1000;

describe('puffergo login status', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('takes the dead listener’s port back and catches the click on it', async () => {
    const port = await freePort();
    const { dir, credPath } = await scratch({ status: 'pending', port });

    const status = cmdLoginStatus(dir, '5');
    expect(await waitUntilListening(port)).toBe(true); // we are the callback server now

    const back = await fetch(
      `http://127.0.0.1:${port}/?user_login=Carol&password=${encodeURIComponent('Abcd Efg1')}`,
    );
    expect(await back.text()).toContain('已授权');

    await expect(status).resolves.toMatchObject({ ok: true, status: 'approved', siteUrl: SITE });
    const saved = JSON.parse(await readFile(credPath, 'utf8'));
    expect(saved.sites[SITE]).toEqual({ username: 'Carol', appPassword: 'Abcd Efg1' });
  });

  it('says one more click is needed when it held the port and nobody came back', async () => {
    const port = await freePort();
    const { dir, statePath } = await scratch({ status: 'pending', port });

    // The waiter died before this customer clicked: the click we are waiting for may already have been
    // lost to a dead port, so the answer has to ask for exactly one more click — not a re-login.
    await expect(cmdLoginStatus(dir, '1')).resolves.toMatchObject({
      ok: true,
      status: 'waiting',
      tookOver: true,
    });
    // …and the login stays open, because the 10-minute window has not passed.
    expect(JSON.parse(await readFile(statePath, 'utf8')).status).toBe('pending');
  }, 15000);

  it('leaves the port to the waiter when the waiter is alive', async () => {
    const port = await freePort();
    const holder = http.createServer();
    await new Promise<void>(r => holder.listen(port, '127.0.0.1', () => r()));
    const { dir } = await scratch({ status: 'pending', port });

    try {
      const out = (await cmdLoginStatus(dir, '1')) as { status: string; tookOver?: boolean };
      expect(out).toMatchObject({ ok: true, status: 'waiting' });
      expect(out.tookOver).toBeUndefined();
    } finally {
      await new Promise<void>(r => holder.close(() => r()));
    }
  }, 15000);

  it('closes a login whose 10-minute window ran out with nobody listening', async () => {
    const port = await freePort();
    const { dir, statePath } = await scratch({
      status: 'pending',
      port,
      startedAt: Date.now() - TEN_MINUTES - 60_000,
    });

    await expect(cmdLoginStatus(dir, '1')).resolves.toMatchObject({ ok: false, code: 'denied' });
    expect(JSON.parse(await readFile(statePath, 'utf8')).status).toBe('failed');
  });

  it('reports no login in progress when there is no record at all', async () => {
    const base = await mkdtemp(join(tmpdir(), 'puffergo-login-test-'));
    vi.stubEnv('PUFFERGO_LOGIN_STATE', join(base, 'absent.json'));
    await expect(cmdLoginStatus(base, '0')).resolves.toMatchObject({ code: 'no_login' });
  });
});

describe('normalizeSiteUrl', () => {
  it('accepts what customers actually type', () => {
    expect(normalizeSiteUrl('hechengindustry.com')).toBe('https://hechengindustry.com');
    expect(normalizeSiteUrl('https://x.com/wp-admin/')).toBe('https://x.com');
    expect(normalizeSiteUrl('http://x.com/wp-login.php')).toBe('http://x.com');
    expect(normalizeSiteUrl('https://x.com/shop')).toBe('https://x.com/shop');
  });
});
