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
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdLogin, cmdLoginStatus, cmdLoginAppPassword, cmdLoginFromUrl, cmdLoginDoctor, normalizeSiteUrl } from '../lib/loginCmd';

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

    const back = await fetch(`http://127.0.0.1:${port}/?user_login=Carol&password=${encodeURIComponent('Abcd Efg1')}`);
    expect(await back.text()).toContain('已授权');

    // The page says ✅ — so the credential must ALREADY be on disk at that instant. The bug this guards
    // against: `res.end()` firing before the write, so a killed process leaves a "success" page and no
    // credential, and both the customer and the AI believe it worked.
    const savedNow = JSON.parse(await readFile(credPath, 'utf8'));
    expect(savedNow.sites[SITE]).toEqual({ username: 'Carol', appPassword: 'Abcd Efg1' });

    await expect(status).resolves.toMatchObject({ ok: true, status: 'approved', siteUrl: SITE });
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

  it('refuses a flag, and refuses a single word that is not a domain', () => {
    // `login --help` used to become `https://--help`: a state file, a listener and a burned port for a
    // domain that cannot exist. A flag is never a site.
    expect(() => normalizeSiteUrl('--help')).toThrow(/flag/);
    expect(() => normalizeSiteUrl('-h')).toThrow(/flag/);
    expect(normalizeSiteUrl('localhost')).toBe('https://localhost');
    expect(() => normalizeSiteUrl('nonsense')).toThrow(/not a domain/);
    expect(() => normalizeSiteUrl('-x.com')).toThrow(/flag/);
    expect(() => normalizeSiteUrl('x-.com')).toThrow(/not a valid domain/);
  });
});

describe('puffergo login — bad input must not touch the flow', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('rejects `--help` without overwriting the login that is already running', async () => {
    const port = await freePort();
    const { dir, statePath } = await scratch({ status: 'pending', port });
    const before = await readFile(statePath, 'utf8');

    await expect(cmdLogin(dir, '--help')).resolves.toMatchObject({ ok: false, code: 'bad_url' });

    // Untouched: the real site is still the one being authorized, and its window is still valid.
    expect(await readFile(statePath, 'utf8')).toBe(before);
    expect(JSON.parse(before).siteUrl).toBe(SITE);
  });

  it('rejects a single-word "site" the same way', async () => {
    const port = await freePort();
    const { dir, statePath } = await scratch({ status: 'pending', port });
    const before = await readFile(statePath, 'utf8');
    await expect(cmdLogin(dir, 'nonsense')).resolves.toMatchObject({ ok: false, code: 'bad_url' });
    expect(await readFile(statePath, 'utf8')).toBe(before);
  });
});

describe('login from-url — recovering a grant whose listener was gone at click time', () => {
  const site = 'https://recover.test';

  function stubMeOk(): void {
    vi.stubGlobal('fetch', async (url: string) => {
      if (String(url).includes('/wp/v2/users/me'))
        return new Response(JSON.stringify({ id: 1, username: 'admin' }), { status: 200 });
      return new Response('{}', { status: 404 });
    });
  }

  async function env(): Promise<{ dir: string; credPath: string; statePath: string; file: string }> {
    const base = await mkdtemp(join(tmpdir(), 'puffergo-fromurl-'));
    const paths = {
      dir: base,
      credPath: join(base, 'credentials.json'),
      statePath: join(base, 'login-state.json'),
      file: join(base, 'callback-url.txt'),
    };
    vi.stubEnv('PUFFERGO_CONFIG', paths.credPath);
    vi.stubEnv('PUFFERGO_LOGIN_STATE', paths.statePath);
    return paths;
  }

  afterEach(() => vi.unstubAllEnvs());

  it('pulls the password out of the address-bar URL the browser actually landed on', async () => {
    const p = await env();
    stubMeOk();
    // WordPress percent-encodes the spaces in an application password.
    await writeFile(
      p.file,
      'http://127.0.0.1:49512/?site_url=https%3A%2F%2Frecover.test&user_login=admin&password=abcd%20efgh%20ijkl%20mnop',
      'utf8',
    );
    const out = (await cmdLoginFromUrl(p.dir, site, p.file)) as Record<string, unknown>;
    expect(out).toMatchObject({ ok: true, status: 'approved', username: 'admin', route: 'callback-url-file' });
    // The whole point of the file route: the secret never appears in what the AI reads.
    expect(JSON.stringify(out)).not.toContain('abcdefghijklmnop');
    const creds = JSON.parse(await readFile(p.credPath, 'utf8')) as {
      sites: Record<string, { appPassword: string }>;
    };
    expect(creds.sites[site]?.appPassword).toBe('abcdefghijklmnop');
  });

  it('also accepts a bare query string (what people sometimes paste)', async () => {
    const p = await env();
    stubMeOk();
    await writeFile(p.file, 'user_login=boss&password=1234%205678', 'utf8');
    await expect(cmdLoginFromUrl(p.dir, site, p.file)).resolves.toMatchObject({
      ok: true,
      username: 'boss',
    });
  });

  it('says what to copy when the text has no password in it', async () => {
    const p = await env();
    await writeFile(p.file, 'https://recover.test/some/page', 'utf8');
    await expect(cmdLoginFromUrl(p.dir, site, p.file)).resolves.toMatchObject({
      ok: false,
      code: 'no_password',
    });
  });

  it('asks for --user rather than inventing a username', async () => {
    const p = await env();
    await writeFile(p.file, 'http://127.0.0.1:1/?password=abcdefgh', 'utf8');
    await expect(cmdLoginFromUrl(p.dir, site, p.file)).resolves.toMatchObject({
      ok: false,
      code: 'missing_user',
    });
  });
});

describe('giving up on the callback instead of asking for a third click', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('switches to a listener-free route after two fruitless takeovers', async () => {
    const port = await freePort();
    const { dir } = await scratch({ status: 'pending', port });

    const first = (await cmdLoginStatus(dir, '1')) as Record<string, unknown>;
    expect(first).toMatchObject({ ok: true, status: 'waiting', tookOver: true, takeovers: 1 });
    expect(String(first.next)).toContain('最后一次');

    // Second time: the click keeps landing outside every listening window. Asking again is guessing, so
    // the command has to hand over a plan instead.
    const second = (await cmdLoginStatus(dir, '1')) as Record<string, unknown>;
    expect(second).toMatchObject({ ok: false, code: 'callback_unreliable', takeovers: 2 });
    expect(String(second.next)).toContain('from-url');
    expect(String(second.next)).toContain('app-password');
  }, 25000);

  it('names the same dead end in `login doctor`', async () => {
    const port = await freePort();
    const base = await scratch({ status: 'pending', port });
    const state = JSON.parse(await readFile(base.statePath, 'utf8'));
    await writeFile(base.statePath, JSON.stringify({ ...state, takeovers: 2 }), 'utf8');
    await expect(cmdLoginDoctor()).resolves.toMatchObject({ diagnosis: 'callback-unreachable', takeovers: 2 });
  });
});

describe('puffergo login doctor', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('says nobody is listening when the callback port is free — the exact failure that lost three clicks', async () => {
    const port = await freePort();
    await scratch({ status: 'pending', port });
    await expect(cmdLoginDoctor()).resolves.toMatchObject({
      diagnosis: 'nobody-listening',
      state: 'pending',
      siteUrl: SITE,
      listening: { port, alive: false },
    });
  });

  it('confirms a live listener when one exists', async () => {
    const port = await freePort();
    const holder = http.createServer();
    await new Promise<void>(r => holder.listen(port, '127.0.0.1', () => r()));
    await scratch({ status: 'pending', port });
    try {
      await expect(cmdLoginDoctor()).resolves.toMatchObject({ diagnosis: 'listening', listening: { alive: true } });
    } finally {
      await new Promise<void>(r => holder.close(() => r()));
    }
  });

  it('catches "state says approved but nothing was saved"', async () => {
    const { credPath } = await scratch({ status: 'approved', port: 49512 });
    // No credential file written — precisely the fake-success case.
    await writeFile(credPath, JSON.stringify({ sites: {} }), 'utf8');
    await expect(cmdLoginDoctor()).resolves.toMatchObject({
      diagnosis: 'state-without-credential',
      credentialSaved: false,
    });
  });

  it('reports ready only when the credential really is on disk', async () => {
    const { credPath } = await scratch({ status: 'approved', port: 49512 });
    await writeFile(
      credPath,
      JSON.stringify({ sites: { [SITE]: { username: 'u', appPassword: 'p' } } }),
      'utf8',
    );
    await expect(cmdLoginDoctor()).resolves.toMatchObject({ diagnosis: 'ready', credentialSaved: true });
  });

  it('names the expired window instead of leaving the customer clicking a dead link', async () => {
    const port = await freePort();
    await scratch({ status: 'pending', port, startedAt: Date.now() - TEN_MINUTES - 60_000 });
    await expect(cmdLoginDoctor()).resolves.toMatchObject({ diagnosis: 'expired' });
  });

  it('says there is nothing to diagnose when no login ever ran', async () => {
    const base = await mkdtemp(join(tmpdir(), 'puffergo-login-test-'));
    vi.stubEnv('PUFFERGO_LOGIN_STATE', join(base, 'absent.json'));
    await expect(cmdLoginDoctor()).resolves.toMatchObject({ diagnosis: 'no-login', state: 'none' });
  });
});


describe('login app-password (WAF/proxy fallback)', () => {
  const fallbackSite = 'https://apppw.test';

  function stubMe(status: number): void {
    vi.stubGlobal('fetch', async (url: string, init?: { headers?: Record<string, string> }) => {
      if (url.includes('/wp/v2/users/me')) {
        // The Basic header must carry the customer's file value — base64 of "admin:aabbccdd...".
        expect(init?.headers?.Authorization).toMatch(/^Basic /);
        return new Response(JSON.stringify({ id: 1, username: 'admin' }), { status });
      }
      return new Response('{}', { status: 404 });
    });
  }

  async function env(): Promise<{ dir: string; credPath: string; statePath: string; file: string }> {
    const base = await mkdtemp(join(tmpdir(), 'puffergo-apppw-'));
    const paths = {
      dir: base,
      credPath: join(base, 'credentials.json'),
      statePath: join(base, 'login-state.json'),
      file: join(base, 'app-password.txt'),
    };
    vi.stubEnv('PUFFERGO_CONFIG', paths.credPath);
    vi.stubEnv('PUFFERGO_LOGIN_STATE', paths.statePath);
    return paths;
  }

  it('reads the password from the CUSTOMER FILE and never echoes it in the output', async () => {
    const p = await env();
    stubMe(200);
    // WordPress prints app passwords as "xxxx xxxx xxxx xxxx"; copy-paste must still work.
    await writeFile(p.file, 'aabb ccdd eeff gghh\n', 'utf8');
    const out = (await cmdLoginAppPassword(
      p.dir,
      fallbackSite,
      p.file,
      'admin',
    )) as Record<string, unknown>;
    expect(out).toMatchObject({ ok: true, status: 'approved', route: 'app-password-file', username: 'admin' });
    expect(JSON.stringify(out)).not.toContain('aabbccddeeffgghh');
    const creds = JSON.parse(await readFile(p.credPath, 'utf8')) as {
      sites: Record<string, { appPassword: string }>;
    };
    expect(creds.sites[fallbackSite]?.appPassword).toBe('aabbccddeeffgghh');
    expect(JSON.parse(await readFile(p.statePath, 'utf8')).status).toBe('approved');
  });

  it('accepts JSON files with username + appPassword', async () => {
    const p = await env();
    stubMe(200);
    await writeFile(p.file, JSON.stringify({ username: 'boss', appPassword: '1234 5678' }), 'utf8');
    const out = (await cmdLoginAppPassword(p.dir, fallbackSite, p.file)) as Record<string, unknown>;
    expect(out).toMatchObject({ ok: true, username: 'boss' });
  });

  it('rejects a wrong password at the door instead of saving a broken credential', async () => {
    const p = await env();
    stubMe(401);
    await writeFile(p.file, 'wrong', 'utf8');
    const out = (await cmdLoginAppPassword(p.dir, fallbackSite, p.file, 'admin')) as Record<string, unknown>;
    expect(out).toMatchObject({ ok: false, code: 'invalid_app_password' });
    expect(JSON.stringify(out)).not.toContain('wrong');
    const credsExists = await readFile(p.credPath, 'utf8').catch(() => '');
    expect(credsExists).not.toContain('appPassword');
  });

  it('requires a username rather than guessing one', async () => {
    const p = await env();
    stubMe(200);
    await writeFile(p.file, 'secret', 'utf8');
    await expect(cmdLoginAppPassword(p.dir, fallbackSite, p.file)).resolves.toMatchObject({
      ok: false,
      code: 'missing_user',
    });
  });

  it('never accepts a password passed as a command argument — only a file path', async () => {
    const p = await env();
    // No file was written: the caller tried to pass the password directly. It must fail, not save it.
    const out = (await cmdLoginAppPassword(p.dir, fallbackSite, 'aabbccddeeffgghh', 'admin')) as Record<
      string,
      unknown
    >;
    expect(out).toMatchObject({ ok: false, code: 'file_unreadable' });
  });
});
