/**
 * `puffergo profile …` driven through the real command code against a stubbed site, so the parts that
 * matter — merge by default, replace only when asked, warnings that stop a write, the previous-profile
 * backup that makes a merge undoable — hold however the command is wired up.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdProfileGet, cmdProfileCheck, cmdProfileSet, PROFILE_USAGE } from '../lib/profileCmd';
import { writeActiveDomain } from '../adapters/fileStore';

const SITE = 'http://profile.test';

async function workdir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pg-profile-'));
  const store = join(dir, 'credentials.json');
  await writeFile(store, JSON.stringify({ sites: { [SITE]: { username: 'u', appPassword: 'p' } } }));
  process.env.PUFFERGO_CONFIG = store;
  await writeActiveDomain(dir, SITE);
  return dir;
}

interface Sent {
  ability: string;
  input?: Record<string, unknown>;
}

/** Answers each ability by name; records every ability called and the input it was called with. */
function stubSite(answers: Record<string, unknown>) {
  const sent: Sent[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: { body?: string; method?: string }) => {
    const ability = /abilities\/puffergo\/([a-z-]+)\/run/.exec(url)?.[1] ?? url;
    let input: Record<string, unknown> | undefined;
    if (init?.body) {
      const parsed = JSON.parse(init.body) as { input?: Record<string, unknown> };
      input = parsed.input;
    }
    sent.push({ ability, input });
    const body = answers[ability];
    if (body === undefined)
      return new Response(JSON.stringify({ code: 'unexpected', message: ability }), { status: 500 });
    if (body instanceof Fail) return new Response(JSON.stringify(body.body), { status: body.status });
    return new Response(JSON.stringify(body), { status: 200 });
  });
  return sent;
}

/** An ability answering with an HTTP error. */
class Fail {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {}
}

const SCHEMA = { schemaVersion: 6, tradeFields: [], categories: [], images: {}, blocks: {}, units: {}, limits: {} };
const PROFILE = { identity: { brand_name: 'Axion', slogan: 'S', founded: '', story: '' } };
const COMPLETE = { filled: 10, total: 28, percent: 36, missing: ['contact.email'] };

const ctx = (dir: string, positional: string[] = [], flags: Record<string, string> = {}) => ({
  dir,
  positional,
  flags: new Map(Object.entries(flags)),
});

async function profileFile(dir: string, name: string, body: unknown): Promise<string> {
  const file = join(dir, name);
  await writeFile(file, JSON.stringify(body));
  return file;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PUFFERGO_CONFIG;
});

describe('profile get', () => {
  it('reads the profile back with its completeness', async () => {
    const dir = await workdir();
    const sent = stubSite({
      'get-product-schema': SCHEMA,
      'get-site-profile': { profile: PROFILE, limits: { maxProducts: 3 }, completeness: COMPLETE },
    });
    const out = (await cmdProfileGet(ctx(dir))) as { ok: boolean; profile: unknown; completeness: unknown };
    expect(out.ok).toBe(true);
    expect(out.profile).toEqual(PROFILE);
    expect(out.completeness).toEqual(COMPLETE);
    expect(sent.map(s => s.ability)).toContain('get-site-profile');
  });

  it('a plugin without the ability says update the plugin', async () => {
    const dir = await workdir();
    stubSite({
      'get-product-schema': SCHEMA,
      'get-site-profile': new Fail(404, { code: 'rest_ability_not_found', message: 'not found' }),
    });
    expect(await cmdProfileGet(ctx(dir))).toMatchObject({ ok: false, code: 'update_plugin', fix: 'user' });
  });
});

describe('profile check', () => {
  it('a clean profile is ok', async () => {
    const dir = await workdir();
    const file = await profileFile(dir, 'p.json', PROFILE);
    const sent = stubSite({
      'get-product-schema': SCHEMA,
      'validate-site-profile': { ok: true, profile: PROFILE, warnings: [], completeness: COMPLETE },
    });
    const out = await cmdProfileCheck(ctx(dir, [file]));
    expect(out).toMatchObject({ ok: true, valid: true });
    expect(sent.find(s => s.ability === 'validate-site-profile')?.input).toEqual({ profile: PROFILE });
  });

  it('warnings stop it: the file has to be fixed before it is written', async () => {
    const dir = await workdir();
    const file = await profileFile(dir, 'p.json', PROFILE);
    stubSite({
      'get-product-schema': SCHEMA,
      'validate-site-profile': {
        ok: true,
        profile: PROFILE,
        warnings: [{ field: 'seo.keywords', kind: 'truncated', message: 'Only the first 30 keywords are kept.' }],
      },
    });
    expect(await cmdProfileCheck(ctx(dir, [file]))).toMatchObject({
      ok: false,
      code: 'profile_warnings',
      fix: 'ai',
    });
  });

  it('a file holding {"profile": …} is accepted as-is', async () => {
    const dir = await workdir();
    const file = await profileFile(dir, 'p.json', { profile: PROFILE });
    const sent = stubSite({
      'get-product-schema': SCHEMA,
      'validate-site-profile': { ok: true, profile: PROFILE, warnings: [] },
    });
    expect(await cmdProfileCheck(ctx(dir, [file]))).toMatchObject({ ok: true });
    expect(sent.find(s => s.ability === 'validate-site-profile')?.input).toEqual({ profile: PROFILE });
  });

  it('a missing file and a broken file are told apart', async () => {
    const dir = await workdir();
    stubSite({ 'get-product-schema': SCHEMA });
    expect(await cmdProfileCheck(ctx(dir, [join(dir, 'nope.json')]))).toMatchObject({ code: 'file_not_found' });
    const bad = await profileFile(dir, 'bad.json', '[1,2');
    expect(await cmdProfileCheck(ctx(dir, [bad]))).toMatchObject({ code: 'invalid_json' });
    expect(await cmdProfileCheck(ctx(dir, []))).toMatchObject({ code: 'usage' });
  });
});

describe('profile set', () => {
  it('merges by default — the site decides what that means, the CLI only asks for it', async () => {
    const dir = await workdir();
    const file = await profileFile(dir, 'p.json', PROFILE);
    const sent = stubSite({
      'get-product-schema': SCHEMA,
      'update-site-profile': { ok: true, mode: 'merge', profile: PROFILE, previous: PROFILE, warnings: [] },
    });
    const out = (await cmdProfileSet(ctx(dir, [file]))) as { ok: boolean; mode: string; previous: string };
    expect(out.ok).toBe(true);
    expect(out.mode).toBe('merge');
    expect(sent.find(s => s.ability === 'update-site-profile')?.input).toEqual({ profile: PROFILE, mode: 'merge' });
  });

  it('--replace overwrites the whole profile', async () => {
    const dir = await workdir();
    const file = await profileFile(dir, 'p.json', PROFILE);
    const sent = stubSite({
      'get-product-schema': SCHEMA,
      'update-site-profile': { ok: true, mode: 'replace', profile: PROFILE, previous: PROFILE, warnings: [] },
    });
    const out = (await cmdProfileSet(ctx(dir, [file], { replace: 'true' }))) as { ok: boolean; mode: string };
    expect(out.mode).toBe('replace');
    expect(sent.find(s => s.ability === 'update-site-profile')?.input).toEqual({ profile: PROFILE, mode: 'replace' });
  });

  it('keeps the previous profile next to the file, so a merge can be undone', async () => {
    const dir = await workdir();
    const file = await profileFile(dir, 'p.json', PROFILE);
    stubSite({
      'get-product-schema': SCHEMA,
      'update-site-profile': { ok: true, mode: 'merge', profile: PROFILE, previous: PROFILE, warnings: [] },
    });
    const out = (await cmdProfileSet(ctx(dir, [file]))) as { ok: boolean; previous: string };
    expect(out.previous).toBe(join(dir, 'p.previous.json'));
    const saved = JSON.parse(await readFile(out.previous, 'utf8')) as { profile: unknown };
    expect(saved.profile).toEqual(PROFILE);
  });

  it('--backup writes it where the caller said', async () => {
    const dir = await workdir();
    const file = await profileFile(dir, 'p.json', PROFILE);
    const backup = join(dir, 'rollback.json');
    stubSite({
      'get-product-schema': SCHEMA,
      'update-site-profile': { ok: true, mode: 'merge', profile: PROFILE, previous: PROFILE, warnings: [] },
    });
    const out = (await cmdProfileSet(ctx(dir, [file], { backup }))) as { ok: boolean; previous: string };
    expect(out.previous).toBe(backup);
    expect(JSON.parse(await readFile(backup, 'utf8'))).toEqual({ profile: PROFILE });
  });

  it('a plugin without the ability says update the plugin', async () => {
    const dir = await workdir();
    const file = await profileFile(dir, 'p.json', PROFILE);
    stubSite({
      'get-product-schema': SCHEMA,
      'update-site-profile': new Fail(404, { code: 'rest_ability_not_found', message: 'not found' }),
    });
    expect(await cmdProfileSet(ctx(dir, [file]))).toMatchObject({ ok: false, code: 'update_plugin' });
  });
});

describe('usage', () => {
  it('names every subcommand', () => {
    expect(PROFILE_USAGE).toContain('get');
    expect(PROFILE_USAGE).toContain('check');
    expect(PROFILE_USAGE).toContain('set');
    expect(PROFILE_USAGE).toContain('--replace');
  });
});
