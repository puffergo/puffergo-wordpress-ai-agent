/**
 * `puffergo chrome …` driven through the real command code against a stubbed site: the ops file
 * shapes (full object, bare array + --target), the plan dry run that fails loudly on skips, the
 * apply that carries `previous` and the Polylang stale note, and the old-plugin downgrade path.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdChromeGet, cmdChromePlan, cmdChromeApply, CHROME_USAGE } from '../lib/chromeCmd';
import { writeActiveDomain } from '../adapters/fileStore';

const SITE = 'http://chrome.test';

async function workdir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pg-chrome-'));
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

function stubSite(answers: Record<string, unknown>) {
  const sent: Sent[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: { body?: string }) => {
    const ability = /abilities\/puffergo\/([a-z-]+)\/run/.exec(url)?.[1] ?? url;
    let input: Record<string, unknown> | undefined;
    if (init?.body) input = (JSON.parse(init.body) as { input?: Record<string, unknown> }).input;
    sent.push({ ability, input });
    const body = answers[ability];
    if (body === undefined)
      return new Response(JSON.stringify({ code: 'unexpected', message: ability }), { status: 500 });
    if (body instanceof Fail) return new Response(JSON.stringify(body.body), { status: body.status });
    return new Response(JSON.stringify(body), { status: 200 });
  });
  return sent;
}

class Fail {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {}
}

const SCHEMA = { schemaVersion: 6, tradeFields: [], categories: [], images: {}, blocks: {}, units: {}, limits: {} };

const ctx = (dir: string, positional: string[] = [], flags: Record<string, string> = {}) => ({
  dir,
  positional,
  flags: new Map(Object.entries(flags)),
});

async function opsFile(dir: string, name: string, body: unknown): Promise<string> {
  const file = join(dir, name);
  await writeFile(file, JSON.stringify(body));
  return file;
}

const OPS = [{ op: 'add', title: 'CNC Milling', link: { slug: 'cnc-milling' }, parent: 'Products' }];

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PUFFERGO_CONFIG;
});

describe('chrome get', () => {
  it('reads both menus back with the site url attached', async () => {
    const dir = await workdir();
    const sent = stubSite({
      'get-product-schema': SCHEMA,
      'get-chrome': {
        ok: true,
        header: { menuId: 12, items: [] },
        footer: { menuId: 13, items: [] },
        polylang: { active: false },
      },
    });
    const out = (await cmdChromeGet(ctx(dir))) as { ok: boolean; site: string; header: unknown };
    expect(out.ok).toBe(true);
    expect(out.site).toBe(SITE);
    expect(out.header).toBeDefined();
    expect(sent.map(s => s.ability)).toContain('get-chrome');
  });

  it('a plugin without the ability says update the plugin', async () => {
    const dir = await workdir();
    stubSite({
      'get-product-schema': SCHEMA,
      'get-chrome': new Fail(404, { code: 'rest_ability_not_found', message: 'not found' }),
    });
    expect(await cmdChromeGet(ctx(dir))).toMatchObject({ ok: false, code: 'update_plugin', fix: 'user' });
  });
});

describe('chrome plan', () => {
  it('a clean plan is ok and sends target + ops', async () => {
    const dir = await workdir();
    const file = await opsFile(dir, 'ops.json', { target: 'header', ops: OPS });
    const sent = stubSite({
      'get-product-schema': SCHEMA,
      'plan-chrome': {
        ok: true,
        dry: true,
        target: 'header',
        menuId: 12,
        planned: [{ op: 'ops[0]', kind: 'add' }],
        skipped: [],
      },
    });
    const out = await cmdChromePlan(ctx(dir, [file]));
    expect(out).toMatchObject({ ok: true, dry: true });
    expect(sent.find(s => s.ability === 'plan-chrome')?.input).toEqual({ target: 'header', ops: OPS });
  });

  it('any skipped op fails the plan loudly — the agent must fix it before apply', async () => {
    const dir = await workdir();
    const file = await opsFile(dir, 'ops.json', { target: 'header', ops: OPS });
    stubSite({
      'get-product-schema': SCHEMA,
      'plan-chrome': {
        ok: true,
        dry: true,
        target: 'header',
        menuId: 12,
        planned: [],
        skipped: [{ op: 'ops[0]', kind: 'add', reason: 'slug-not-found', message: 'No page "cnc-milling".' }],
      },
    });
    expect(await cmdChromePlan(ctx(dir, [file]))).toMatchObject({ ok: false, code: 'chrome_skipped', fix: 'ai' });
  });

  it('a bare array file + --target works', async () => {
    const dir = await workdir();
    const file = await opsFile(dir, 'ops.json', OPS);
    const sent = stubSite({
      'get-product-schema': SCHEMA,
      'plan-chrome': { ok: true, dry: true, target: 'footer', menuId: 13, planned: [{ op: 'ops[0]' }], skipped: [] },
    });
    const out = await cmdChromePlan(ctx(dir, [file], { target: 'footer' }));
    expect(out).toMatchObject({ ok: true });
    expect(sent.find(s => s.ability === 'plan-chrome')?.input).toMatchObject({ target: 'footer' });
  });

  it('missing target, empty ops, bad json, missing file are each told apart', async () => {
    const dir = await workdir();
    stubSite({ 'get-product-schema': SCHEMA });
    const noTarget = await opsFile(dir, 'a.json', { ops: OPS });
    expect(await cmdChromePlan(ctx(dir, [noTarget]))).toMatchObject({ code: 'invalid_json' });
    const emptyOps = await opsFile(dir, 'b.json', { target: 'header', ops: [] });
    expect(await cmdChromePlan(ctx(dir, [emptyOps]))).toMatchObject({ code: 'invalid_json' });
    const bad = await opsFile(dir, 'c.json', '{oops');
    expect(await cmdChromePlan(ctx(dir, [bad]))).toMatchObject({ code: 'invalid_json' });
    expect(await cmdChromePlan(ctx(dir, [join(dir, 'nope.json')]))).toMatchObject({ code: 'file_not_found' });
    expect(await cmdChromePlan(ctx(dir, []))).toMatchObject({ code: 'usage' });
  });
});

describe('chrome apply', () => {
  it('applies and carries previous + editUrl + polylang', async () => {
    const dir = await workdir();
    const file = await opsFile(dir, 'ops.json', { target: 'header', ops: OPS });
    const sent = stubSite({
      'get-product-schema': SCHEMA,
      'apply-chrome': {
        ok: true,
        dry: false,
        target: 'header',
        menuId: 12,
        applied: [{ op: 'ops[0]', kind: 'add', id: 482, title: 'CNC Milling' }],
        skipped: [],
        previous: [{ id: 100, title: 'Products' }],
        editUrl: 'http://chrome.test/wp-admin/nav-menus.php?action=edit&menu=12',
        polylang: { active: true, sourceMenuId: 12, stale: true },
      },
    });
    const out = (await cmdChromeApply(ctx(dir, [file]))) as Record<string, unknown>;
    expect(out.ok).toBe(true);
    expect(out.previous).toEqual([{ id: 100, title: 'Products' }]);
    expect(out.editUrl).toContain('nav-menus.php');
    // A stale translated copy must be surfaced as a note the agent cannot miss.
    expect(out.polylangNote).toContain('re-translate');
    expect(sent.find(s => s.ability === 'apply-chrome')?.input).toEqual({ target: 'header', ops: OPS });
  });

  it('no polylang note when translations are not stale', async () => {
    const dir = await workdir();
    const file = await opsFile(dir, 'ops.json', { target: 'header', ops: OPS });
    stubSite({
      'get-product-schema': SCHEMA,
      'apply-chrome': { ok: true, dry: false, applied: [], skipped: [], polylang: { active: false, stale: false } },
    });
    const out = (await cmdChromeApply(ctx(dir, [file]))) as Record<string, unknown>;
    expect(out.ok).toBe(true);
    expect(out.polylangNote).toBeUndefined();
  });

  it('a skipped op in apply is reported, not hidden', async () => {
    const dir = await workdir();
    const file = await opsFile(dir, 'ops.json', { target: 'header', ops: OPS });
    stubSite({
      'get-product-schema': SCHEMA,
      'apply-chrome': {
        ok: true,
        dry: false,
        applied: [],
        skipped: [{ op: 'ops[0]', kind: 'add', reason: 'duplicate', message: 'already there' }],
        polylang: { active: false },
      },
    });
    const out = (await cmdChromeApply(ctx(dir, [file]))) as Record<string, unknown>;
    expect(out.skippedNote).toBeDefined();
  });

  it('a plugin without the ability says update the plugin', async () => {
    const dir = await workdir();
    const file = await opsFile(dir, 'ops.json', { target: 'header', ops: OPS });
    stubSite({
      'get-product-schema': SCHEMA,
      'apply-chrome': new Fail(404, { code: 'rest_ability_not_found', message: 'not found' }),
    });
    expect(await cmdChromeApply(ctx(dir, [file]))).toMatchObject({ ok: false, code: 'update_plugin' });
  });
});

describe('usage', () => {
  it('names every subcommand', () => {
    expect(CHROME_USAGE).toContain('get');
    expect(CHROME_USAGE).toContain('plan');
    expect(CHROME_USAGE).toContain('apply');
    expect(CHROME_USAGE).toContain('--target');
  });
});
