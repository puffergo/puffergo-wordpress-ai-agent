/**
 * `puffergo site password` — mint and persist in one step.
 *
 * The point of the command is the pairing: `hosting_websites_create` demands
 * `wordpress.admin.password` from the caller and offers no way to read it back, so a password that is not
 * written down at minting time is lost. These tests pin down that the two halves cannot drift apart —
 * whatever the command prints is byte-for-byte what lands on the customer's desktop.
 */
import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdSitePassword, generatePassword } from '../lib/sitePasswordCmd';
import type { CmdCtx } from '../lib/siteCmd';

const ctx = (flags: Record<string, string>, positional: string[] = []): CmdCtx => ({
  dir: process.cwd(),
  flags: new Map(Object.entries(flags)),
  positional,
});

describe('generatePassword', () => {
  it('satisfies what Hostinger accepts: 8–50 chars, mixed case, a digit', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p.length).toBeGreaterThanOrEqual(8);
      expect(p.length).toBeLessThanOrEqual(50);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[0-9]/);
    }
  });

  it('leaves out look-alike characters, so the customer can retype it', () => {
    const joined = Array.from({ length: 200 }, () => generatePassword()).join('');
    expect(joined).not.toMatch(/[0O1lI|`'"]/);
  });

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generatePassword()));
    expect(seen.size).toBe(200);
  });
});

describe('cmdSitePassword', () => {
  it('writes the same credentials it prints', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pg-pass-'));
    const out = await cmdSitePassword(ctx({ domain: 'example.com', email: 'owner@example.com', out: dir }));
    expect(out.ok).toBe(true);

    const creds = (out as unknown as { credentials: { user: string; password: string; email: string } }).credentials;
    const file = (out as unknown as { file: string }).file;
    const text = await readFile(file, 'utf8');

    expect(text).toContain(creds.user);
    expect(text).toContain(creds.password);
    expect(text).toContain('owner@example.com');
    // The login URL the card points at has to be the real entry point, not the bare domain.
    expect(text).toContain('https://example.com/wp-admin');
  });

  it('strips protocol and www before building the URL and the username', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pg-pass-'));
    const out = await cmdSitePassword(ctx({ domain: 'https://www.Example.co.uk/some/path', out: dir }));
    const creds = (out as unknown as { credentials: { site: string; user: string } }).credentials;
    expect(creds.site).toBe('https://example.co.uk');
    expect(creds.user).toBe('example_co_uk');
  });

  it('keeps the card private to its owner', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pg-pass-'));
    const out = await cmdSitePassword(ctx({ domain: 'example.com', out: dir }));
    const mode = (await stat((out as unknown as { file: string }).file)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('never overwrites a card the customer already has', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pg-pass-'));
    const first = await cmdSitePassword(ctx({ domain: 'example.com', out: dir }));
    const second = await cmdSitePassword(ctx({ domain: 'example.com', out: dir }));
    expect((second as unknown as { file: string }).file).not.toBe((first as unknown as { file: string }).file);
    // The first card still holds the first password.
    const kept = await readFile((first as unknown as { file: string }).file, 'utf8');
    const firstPass = (first as unknown as { credentials: { password: string } }).credentials.password;
    expect(kept).toContain(firstPass);
  });

  it('accepts the domain positionally, and refuses to run without one', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pg-pass-'));
    const out = await cmdSitePassword({
      dir: process.cwd(),
      flags: new Map([['out', dir]]),
      positional: ['example.com'],
    });
    expect(out.ok).toBe(true);

    const missing = await cmdSitePassword(ctx({ out: dir }));
    expect(missing).toMatchObject({ ok: false, code: 'missing_domain' });
  });

  it('still hands back the credentials when the card cannot be written', async () => {
    // A path that is a file, not a directory: mkdir fails, so the write does.
    const blocker = join(await mkdtemp(join(tmpdir(), 'pg-pass-')), 'not-a-dir');
    await writeFile(blocker, 'x', 'utf8');
    const out = await cmdSitePassword(ctx({ domain: 'example.com', out: join(blocker, 'sub') }));

    expect(out.ok).toBe(true);
    expect((out as unknown as { file: string | null }).file).toBeNull();
    expect((out as unknown as { credentials: { password: string } }).credentials.password).toBeTruthy();
    expect((out as unknown as { warning?: string }).warning).toBeTruthy();
  });
});
