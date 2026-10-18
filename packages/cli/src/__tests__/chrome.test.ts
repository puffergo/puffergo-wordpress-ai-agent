/**
 * `puffergo chrome …` driven through the real command code against a stubbed site: the tree file
 * shape (`{target, menu}` and bare array + --target), `get --out` writing the editable file, the
 * check dry run that fails loudly on skips, the push that saves `previous` next to the file and
 * carries the Polylang stale note, the refusal of a legacy ops file, and the old-plugin downgrade.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdChromeGet, cmdChromeCheck, cmdChromePush, CHROME_USAGE } from '../lib/chromeCmd';
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

async function menuFile(dir: string, name: string, body: unknown): Promise<string> {
  const file = join(dir, name);
  await writeFile(file, JSON.stringify(body));
  return file;
}

const MENU = [
  { id: 10, title: 'Products', link: { slug: 'products' } },
  { title: 'CNC Milling', link: { url: '/cnc-milling/' } },
];

const GET_CHROME = {
  ok: true,
  header: {
    menuId: 12,
    items: [],
    tree: [],
    menu: MENU,
    editUrl: 'http://chrome.test/wp-admin/nav-menus.php?action=edit&menu=12',
  },
  footer: { menuId: 13, items: [], tree: [], menu: [] },
  limits: { matchedBy: 'id' },
  polylang: { active: false },
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PUFFERGO_CONFIG;
});

describe('chrome get', () => {
  it('reads both menus back with the site url attached', async () => {
    const dir = await workdir();
    const sent = stubSite({ 'get-product-schema': SCHEMA, 'get-chrome': GET_CHROME });
    const out = (await cmdChromeGet(ctx(dir))) as { ok: boolean; site: string; header: unknown };
    expect(out.ok).toBe(true);
    expect(out.site).toBe(SITE);
    expect(out.header).toBeDefined();
    expect(sent.map(s => s.ability)).toContain('get-chrome');
  });

  it('--out writes the editable tree file in the exact shape check/push read', async () => {
    const dir = await workdir();
    stubSite({ 'get-product-schema': SCHEMA, 'get-chrome': GET_CHROME });
    const outPath = join(dir, 'menu.json');
    const out = (await cmdChromeGet(ctx(dir, [], { target: 'header', out: outPath }))) as Record<string, unknown>;
    expect(out.ok).toBe(true);
    expect(out.items).toBe(2);
    const saved = JSON.parse(await readFile(outPath, 'utf8'));
    expect(saved).toEqual({ target: 'header', menu: MENU });
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

describe('chrome check', () => {
  it('a clean check is ok and sends target + menu', async () => {
    const dir = await workdir();
    const file = await menuFile(dir, 'menu.json', { target: 'header', menu: MENU });
    const sent = stubSite({
      'get-product-schema': SCHEMA,
      'plan-chrome': {
        ok: true,
        dry: true,
        target: 'header',
        menuId: 12,
        changes: [{ op: 'create', node: 'menu[1]' }],
        kept: 1,
        skipped: [],
      },
    });
    const out = await cmdChromeCheck(ctx(dir, [file]));
    expect(out).toMatchObject({ ok: true, dry: true, kept: 1 });
    expect(sent.find(s => s.ability === 'plan-chrome')?.input).toEqual({ target: 'header', menu: MENU });
  });

  it('any skipped node fails the check loudly — the agent must fix it before push', async () => {
    const dir = await workdir();
    const file = await menuFile(dir, 'menu.json', { target: 'header', menu: MENU });
    stubSite({
      'get-product-schema': SCHEMA,
      'plan-chrome': {
        ok: true,
        dry: true,
        target: 'header',
        menuId: 12,
        changes: [],
        skipped: [{ node: 'menu[1]', reason: 'duplicate', message: 'already there' }],
      },
    });
    expect(await cmdChromeCheck(ctx(dir, [file]))).toMatchObject({ ok: false, code: 'chrome_skipped', fix: 'ai' });
  });

  it('a bare array file + --target works', async () => {
    const dir = await workdir();
    const file = await menuFile(dir, 'menu.json', MENU);
    const sent = stubSite({
      'get-product-schema': SCHEMA,
      'plan-chrome': { ok: true, dry: true, target: 'footer', menuId: 13, changes: [], skipped: [] },
    });
    const out = await cmdChromeCheck(ctx(dir, [file], { target: 'footer' }));
    expect(out).toMatchObject({ ok: true });
    expect(sent.find(s => s.ability === 'plan-chrome')?.input).toMatchObject({ target: 'footer' });
  });

  it('a legacy ops file is refused with a pointer to the new flow', async () => {
    const dir = await workdir();
    const file = await menuFile(dir, 'ops.json', { target: 'header', ops: [{ op: 'add', title: 'X' }] });
    stubSite({ 'get-product-schema': SCHEMA });
    expect(await cmdChromeCheck(ctx(dir, [file]))).toMatchObject({ code: 'invalid_json' });
  });

  it('missing target, bad json, missing file, no file arg are each told apart', async () => {
    const dir = await workdir();
    stubSite({ 'get-product-schema': SCHEMA });
    const noTarget = await menuFile(dir, 'a.json', { menu: MENU });
    expect(await cmdChromeCheck(ctx(dir, [noTarget]))).toMatchObject({ code: 'invalid_json' });
    const bad = await menuFile(dir, 'c.json', '{oops');
    expect(await cmdChromeCheck(ctx(dir, [bad]))).toMatchObject({ code: 'invalid_json' });
    expect(await cmdChromeCheck(ctx(dir, [join(dir, 'nope.json')]))).toMatchObject({ code: 'file_not_found' });
    expect(await cmdChromeCheck(ctx(dir, []))).toMatchObject({ code: 'usage' });
  });
});

describe('chrome push', () => {
  it('pushes, saves previous next to the file, carries editUrl + polylang note', async () => {
    const dir = await workdir();
    const file = await menuFile(dir, 'menu.json', { target: 'header', menu: MENU });
    const sent = stubSite({
      'get-product-schema': SCHEMA,
      'apply-chrome': {
        ok: true,
        dry: false,
        target: 'header',
        menuId: 12,
        changes: [{ op: 'create', node: 'menu[1]', id: 482, title: 'CNC Milling' }],
        kept: 1,
        skipped: [],
        previous: [{ id: 10, title: 'Products' }],
        editUrl: 'http://chrome.test/wp-admin/nav-menus.php?action=edit&menu=12',
        polylang: { active: true, sourceMenuId: 12, stale: true },
      },
    });
    const out = (await cmdChromePush(ctx(dir, [file]))) as Record<string, unknown>;
    expect(out.ok).toBe(true);
    expect(sent.find(s => s.ability === 'apply-chrome')?.input).toEqual({ target: 'header', menu: MENU });
    // `previous` is a file on disk (the undo), not the array itself.
    expect(typeof out.previous).toBe('string');
    const previous = JSON.parse(await readFile(out.previous as string, 'utf8'));
    expect(previous).toEqual([{ id: 10, title: 'Products' }]);
    expect(out.editUrl).toContain('nav-menus.php');
    // A stale translated copy must be surfaced as a note the agent cannot miss.
    expect(out.polylangNote).toContain('re-translate');
  });

  it('no polylang note when translations are not stale', async () => {
    const dir = await workdir();
    const file = await menuFile(dir, 'menu.json', { target: 'header', menu: MENU });
    stubSite({
      'get-product-schema': SCHEMA,
      'apply-chrome': {
        ok: true,
        dry: false,
        changes: [],
        kept: 2,
        skipped: [],
        polylang: { active: false, stale: false },
      },
    });
    const out = (await cmdChromePush(ctx(dir, [file]))) as Record<string, unknown>;
    expect(out.ok).toBe(true);
    expect(out.polylangNote).toBeUndefined();
    expect(out.previous).toBeUndefined(); // nothing changed → nothing to undo
  });

  it('a skipped node in push is reported, not hidden', async () => {
    const dir = await workdir();
    const file = await menuFile(dir, 'menu.json', { target: 'header', menu: MENU });
    stubSite({
      'get-product-schema': SCHEMA,
      'apply-chrome': {
        ok: true,
        dry: false,
        changes: [],
        kept: 2,
        skipped: [{ node: 'menu[1]', reason: 'duplicate', message: 'already there' }],
        polylang: { active: false },
      },
    });
    const out = (await cmdChromePush(ctx(dir, [file]))) as Record<string, unknown>;
    expect(out.skippedNote).toBeDefined();
  });

  it('leftAlone comes back on the response so the agent can report it', async () => {
    const dir = await workdir();
    const file = await menuFile(dir, 'menu.json', { target: 'header', menu: [MENU[0]] });
    stubSite({
      'get-product-schema': SCHEMA,
      'apply-chrome': {
        ok: true,
        dry: false,
        changes: [],
        kept: 1,
        skipped: [],
        leftAlone: [{ id: 11, title: 'Blog', url: '/blog' }],
        leftAloneNote: 'NOT deleted',
        polylang: { active: false },
      },
    });
    const out = (await cmdChromePush(ctx(dir, [file]))) as Record<string, unknown>;
    expect(out.leftAlone).toEqual([{ id: 11, title: 'Blog', url: '/blog' }]);
  });

  it('a plugin without the ability says update the plugin', async () => {
    const dir = await workdir();
    const file = await menuFile(dir, 'menu.json', { target: 'header', menu: MENU });
    stubSite({
      'get-product-schema': SCHEMA,
      'apply-chrome': new Fail(404, { code: 'rest_ability_not_found', message: 'not found' }),
    });
    expect(await cmdChromePush(ctx(dir, [file]))).toMatchObject({ ok: false, code: 'update_plugin' });
  });
});

describe('usage', () => {
  it('names every subcommand', () => {
    expect(CHROME_USAGE).toContain('get');
    expect(CHROME_USAGE).toContain('check');
    expect(CHROME_USAGE).toContain('push');
    expect(CHROME_USAGE).toContain('--target');
    expect(CHROME_USAGE).toContain('--out');
  });
});
