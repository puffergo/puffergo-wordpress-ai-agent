/**
 * Behaviour shared by the products and pages commands, driven through the real command code (a workdir
 * credential file + a stubbed fetch), so it holds however that code is split into modules.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdPush, cmdPreview, cmdPull, cmdCheck } from '../lib/productsCmd';
import { siteErrorOutput, cmdEditLive } from '../lib/siteCmd';
import { cmdReplace, cmdGet, cmdPublish as cmdPagesPublish } from '../lib/pagesCmd';
import { NoSiteError, NotLoggedInError, writeWorkdirConfig } from '../lib/site';
import { SchemaVersionError, PluginOutdatedError } from '../lib/siteSchema';

const SITE = 'http://shared.test';

async function workdir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pg-shared-'));
  // Legacy single-site credential file in the workdir: resolveSite() finds it without touching ~/.puffergo.
  await writeFile(join(dir, 'silo.config.json'), JSON.stringify({ siteUrl: SITE, username: 'u', appPassword: 'p' }));
  await writeWorkdirConfig(dir, { siteUrl: SITE });
  return dir;
}

/** An ability answering with an HTTP error. */
class Fail {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {}
}

/** Answers each ability by name; records the abilities called. */
function stubSite(answers: Record<string, unknown>) {
  const called: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    const name = /abilities\/puffergo\/([a-z-]+)\/run/.exec(url)?.[1] ?? url;
    called.push(name);
    const body = answers[name];
    if (body === undefined) return new Response(JSON.stringify({ code: 'unexpected', message: name }), { status: 500 });
    if (body instanceof Fail) return new Response(JSON.stringify(body.body), { status: body.status });
    return new Response(JSON.stringify(body), { status: 200 });
  });
  return called;
}

const SCHEMA = { schemaVersion: 5, tradeFields: [], categories: [], images: {}, blocks: {}, units: {}, limits: {} };
const ctx = (dir: string, positional: string[] = [], flags: Record<string, string> = {}) => ({
  dir,
  positional,
  flags: new Map(Object.entries(flags)),
});

afterEach(() => vi.unstubAllGlobals());

describe('site errors → command output', () => {
  it('maps each site problem to its code', () => {
    expect(siteErrorOutput(new NoSiteError(['a', 'b']))).toEqual({ ok: false, code: 'no_site', sites: ['a', 'b'] });
    expect(siteErrorOutput(new NotLoggedInError('x'))).toEqual({ ok: false, code: 'not_logged_in' });
    expect(siteErrorOutput(new SchemaVersionError(9))).toMatchObject({ ok: false, code: 'update_skill', fix: 'user' });
    expect(siteErrorOutput(new PluginOutdatedError())).toMatchObject({ ok: false, code: 'update_plugin', fix: 'user' });
    expect(siteErrorOutput(new Error('other'))).toBeNull();
  });

  it('an old plugin stops products and pages commands alike with update_plugin', async () => {
    const dir = await workdir();
    stubSite({ 'get-product-schema': { ...SCHEMA, schemaVersion: 2 } });
    await mkdir(join(dir, 'products'));
    await writeFile(join(dir, 'products', 'a-1.json'), JSON.stringify({ key: 'a-1', title: 'A' }));
    expect(await cmdPush(ctx(dir))).toMatchObject({ ok: false, code: 'update_plugin' });
    expect(await cmdGet(ctx(dir, ['5', '1']))).toMatchObject({ ok: false, code: 'update_plugin' });
  });
});

describe('published content is left alone without edit-live', () => {
  it('products push: live_locked, nothing written', async () => {
    const dir = await workdir();
    const called = stubSite({
      'get-product-schema': SCHEMA,
      'get-product': { id: 7, status: 'publish', title: 'A' },
    });
    await mkdir(join(dir, 'products'));
    await writeFile(
      join(dir, 'products', 'a-1.json'),
      JSON.stringify({ key: 'a-1', id: 7, baseModified: 'T', title: 'A' }),
    );
    const out = (await cmdPush(ctx(dir))) as { ok: boolean; results: Array<{ errors: Array<Record<string, string>> }> };
    expect(out.ok).toBe(false);
    expect(out.results[0].errors[0]).toMatchObject({ code: 'live_locked', fix: 'ai' });
    expect(out.results[0].errors[0].message).toContain('--customer-said');
    expect(out.results[0].errors[0].message).toContain('products edit-live on');
    expect(called).not.toContain('upsert-products');
  });

  it('products push --customer-said needs --only naming the products', async () => {
    const dir = await workdir();
    await mkdir(join(dir, 'products'));
    await writeFile(
      join(dir, 'products', 'a-1.json'),
      JSON.stringify({ key: 'a-1', id: 7, baseModified: 'T', title: 'A' }),
    );
    expect(await cmdPush(ctx(dir, [], { 'customer-said': '改一下' }))).toMatchObject({ ok: false, code: 'usage' });
  });

  it('pages replace: live_locked, nothing written', async () => {
    const dir = await workdir();
    const post = { id: 5, type: 'page', title: 'P', status: 'publish', baseModified: 'T', link: 'l', editUrl: 'e' };
    const called = stubSite({
      'get-product-schema': SCHEMA,
      'get-blocks': {
        ...post,
        block: { path: '1', name: 'puffergo/tailwind-container', kind: 'static', html: '<p>x</p>' },
      },
    });
    await cmdGet(ctx(dir, ['5', '1']));
    const out = await cmdReplace(ctx(dir, ['5', '1', 'pages/5/block-1.html']));
    expect(out).toMatchObject({ ok: false, code: 'live_locked', fix: 'ai' });
    expect(String(out.message)).toContain('--customer-said');
    expect(String(out.message)).toContain('pages edit-live on');
    expect(called).not.toContain('replace-block');
  });
});

describe('edit-live (one switch for products and pages)', () => {
  it("needs the customer's words to turn on; on / off / status", async () => {
    const dir = await workdir();
    expect(await cmdEditLive(ctx(dir, ['on']))).toMatchObject({
      ok: false,
      code: 'needs_customer_request',
      fix: 'user',
    });
    expect(await cmdEditLive(ctx(dir, ['on'], { 'customer-said': '改一下线上页面' }))).toMatchObject({
      ok: true,
      editLive: true,
    });
    expect(await cmdEditLive(ctx(dir, []))).toEqual({ ok: true, editLive: true });
    expect(await cmdEditLive(ctx(dir, ['off']))).toEqual({ ok: true, editLive: false });
    expect(await cmdEditLive(ctx(dir, ['maybe']))).toMatchObject({ ok: false, code: 'usage' });
  });
});

describe('products pull', () => {
  it('a product with no key on the site reuses its local file instead of writing a second one', async () => {
    const dir = await workdir();
    await mkdir(join(dir, 'products'));
    await writeFile(join(dir, 'products', 'lamp.json'), JSON.stringify({ key: 'lamp', id: 7, title: 'Lamp' }));
    stubSite({
      'get-product-schema': SCHEMA,
      'get-product': {
        key: null,
        id: 7,
        status: 'publish',
        title: 'Lamp',
        baseModified: 'T2',
        link: 'L',
        editUrl: 'E',
      },
    });
    expect(await cmdPull(ctx(dir, ['7']))).toMatchObject({
      ok: true,
      key: 'lamp',
      path: 'products/lamp.json',
      link: 'L',
      editUrl: 'E',
    });
    expect(await readdir(join(dir, 'products'))).toEqual(['lamp.json']);
    // Where to look at it goes in the output, not into the product file.
    expect(JSON.parse(await readFile(join(dir, 'products', 'lamp.json'), 'utf8'))).not.toHaveProperty('link');
  });
});

describe('two local files for one product', () => {
  it('check and push report duplicate_id on both and push writes neither', async () => {
    const dir = await workdir();
    await mkdir(join(dir, 'products'));
    for (const k of ['lamp', 'lamp-2'])
      await writeFile(
        join(dir, 'products', `${k}.json`),
        JSON.stringify({ key: k, id: 7, baseModified: 'T', title: 'L' }),
      );
    const called = stubSite({
      'get-product-schema': SCHEMA,
      'validate-products': { ok: true, results: [{ errors: [], warnings: [] }] },
    });
    const check = (await cmdCheck(ctx(dir))) as { ok: boolean; results: Array<{ errors: Array<{ code: string }> }> };
    expect(check.ok).toBe(false);
    expect(check.results.map(r => r.errors[0].code)).toEqual(['duplicate_id', 'duplicate_id']);
    const push = (await cmdPush(ctx(dir))) as { ok: boolean; results: Array<{ errors: Array<{ code: string }> }> };
    expect(push.results.map(r => r.errors[0].code)).toEqual(['duplicate_id', 'duplicate_id']);
    expect(called).not.toContain('upsert-products');
  });
});

describe('products preview', () => {
  const FILE = { key: 'a-1', id: 7, baseModified: 'T', title: 'A new title' };
  async function withProduct() {
    const dir = await workdir();
    await mkdir(join(dir, 'products'));
    await writeFile(join(dir, 'products', 'a-1.json'), JSON.stringify(FILE));
    return dir;
  }
  const VALID = { ok: true, results: [{ errors: [], warnings: [] }] };

  it('previews a live product with no --customer-said and writes nothing', async () => {
    const dir = await withProduct();
    const called = stubSite({
      'get-product-schema': SCHEMA,
      'validate-products': VALID,
      'preview-product': {
        ok: true,
        id: 7,
        previewUrl: `${SITE}/p/?puffergo_product_preview=7`,
        notShown: ['SEO'],
        warnings: [],
      },
    });
    const out = (await cmdPreview(ctx(dir, ['a-1']))) as { ok: boolean; results: Array<Record<string, unknown>> };
    expect(out.ok).toBe(true);
    expect(out.results[0]).toMatchObject({
      key: 'a-1',
      id: 7,
      previewUrl: `${SITE}/p/?puffergo_product_preview=7`,
      notShown: ['SEO'],
    });
    expect(called).not.toContain('upsert-products');
    expect(called).not.toContain('get-product');
    expect(JSON.parse(await readFile(join(dir, 'products', 'a-1.json'), 'utf8'))).toEqual(FILE);
  });

  it("passes on the site's errors (conflict, not_on_site)", async () => {
    const dir = await withProduct();
    stubSite({
      'get-product-schema': SCHEMA,
      'validate-products': VALID,
      'preview-product': {
        ok: false,
        errors: [{ path: 'a-1.baseModified', code: 'conflict', message: 'pull', fix: 'ai' }],
      },
    });
    const conflict = (await cmdPreview(ctx(dir, ['a-1']))) as { ok: boolean; results: Array<{ errors: unknown[] }> };
    expect(conflict.ok).toBe(false);
    expect(conflict.results[0].errors[0]).toMatchObject({ code: 'conflict' });

    stubSite({
      'get-product-schema': SCHEMA,
      'validate-products': VALID,
      'preview-product': new Fail(400, { code: 'not_on_site', message: 'Push it.', data: { status: 400 } }),
    });
    const notOnSite = (await cmdPreview(ctx(dir, ['a-1']))) as { results: Array<{ errors: unknown[] }> };
    expect(notOnSite.results[0].errors[0]).toMatchObject({ code: 'not_on_site', message: 'Push it.' });
  });

  it('uploads local images in static detail HTML and sends the site URL', async () => {
    const dir = await withProduct();
    await mkdir(join(dir, 'images'));
    await writeFile(join(dir, 'images', 'a.png'), 'not really a png');
    const html = '<section><div class="max-w-canvas mx-auto"><img src="images/a.png" alt="a"></div></section>';
    await writeFile(
      join(dir, 'products', 'a-1.json'),
      JSON.stringify({ ...FILE, detail: { blocks: [{ type: 'static', html }] } }),
    );
    stubSite({
      'get-product-schema': SCHEMA,
      'validate-products': VALID,
      'find-media': { found: true, mediaId: 9, url: `${SITE}/wp-content/uploads/a.png` },
      'preview-product': { ok: true, id: 7, previewUrl: 'p', notShown: [], warnings: [] },
    });
    const sent: unknown[] = [];
    const stubbed = globalThis.fetch;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.includes('preview-product')) sent.push(JSON.parse(String(init?.body)).input.product);
      return stubbed(url, init);
    });
    expect(await cmdPreview(ctx(dir, ['a-1']))).toMatchObject({ ok: true });
    expect(sent[0]).toMatchObject({
      detail: { blocks: [{ type: 'static', html: html.replace('images/a.png', `${SITE}/wp-content/uploads/a.png`) }] },
    });
  });

  it('a plugin without preview-product → update_plugin; an unknown key → not_found', async () => {
    const dir = await withProduct();
    stubSite({
      'get-product-schema': SCHEMA,
      'validate-products': VALID,
      'preview-product': new Fail(404, { code: 'rest_ability_not_found', message: 'no' }),
    });
    expect(await cmdPreview(ctx(dir, ['a-1']))).toMatchObject({ ok: false, code: 'update_plugin' });
    expect(await cmdPreview(ctx(dir, ['nope']))).toMatchObject({ ok: false, code: 'not_found' });
    expect(await cmdPreview(ctx(dir))).toMatchObject({ ok: false, code: 'usage' });
  });
});

describe('pages: any config component is edited by its data', () => {
  it('get saves schema and data; replace uploads local images and sends only the data', async () => {
    const dir = await workdir();
    const post = { id: 5, type: 'page', title: 'P', status: 'draft', baseModified: 'T', link: 'l', editUrl: 'e' };
    const schema = { slides: { type: 'array', itemSchema: { title: { type: 'text' }, image: { type: 'image' } } } };
    const data = { slides: [{ title: 'Old', image: 'https://shared.test/old.jpg' }] };
    const sent: Record<string, unknown>[] = [];
    stubSite({
      'get-product-schema': SCHEMA,
      'get-blocks': {
        ...post,
        block: {
          path: '2',
          name: 'puffergo/tailwind-container',
          kind: 'config',
          component: 'carousel',
          html: 'x',
          schema,
          data,
        },
      },
      'find-media': { found: true, mediaId: 9, url: 'https://shared.test/a.png' },
      'replace-block': { ...post, revision: true },
    });
    const stubbed = globalThis.fetch;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.includes('replace-block')) sent.push(JSON.parse(String(init?.body)).input);
      return stubbed(url, init);
    });
    expect(await cmdGet(ctx(dir, ['5', '2']))).toMatchObject({ ok: true, file: 'pages/5/block-2.json' });
    const file = join(dir, 'pages', '5', 'block-2.json');
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ component: 'carousel', schema, data });
    await mkdir(join(dir, 'images'));
    await writeFile(join(dir, 'images', 'a.png'), 'png');
    await writeFile(join(dir, 'pages', '5', 'b.png'), 'png'); // next to the .json, as a .html section's images
    await writeFile(
      file,
      JSON.stringify({
        component: 'carousel',
        schema,
        data: {
          slides: [
            { title: 'Durable lamp', image: 'images/a.png' },
            { title: 'Side', image: 'b.png' },
          ],
        },
      }),
    );
    const out = (await cmdReplace(ctx(dir, ['5', '2', 'pages/5/block-2.json']))) as {
      ok: boolean;
      warnings: Array<{ code: string; path: string }>;
    };
    expect(out.ok).toBe(true);
    expect(out.warnings).toMatchObject([
      { code: 'unsupported_claim', path: 'pages/5/block-2.json:data.slides[0].title' },
    ]);
    expect(sent[0]).toEqual({
      id: 5,
      path: '2',
      baseModified: 'T',
      data: {
        slides: [
          { title: 'Durable lamp', image: 'https://shared.test/a.png' },
          { title: 'Side', image: 'https://shared.test/a.png' },
        ],
      },
    });
  });
});

describe('pages publish', () => {
  const post = { id: 5, type: 'page', title: 'P', status: 'draft', baseModified: 'T', link: 'l', editUrl: 'e' };

  it("needs the customer's words asking to publish, and the page read first", async () => {
    const dir = await workdir();
    const called = stubSite({ 'get-product-schema': SCHEMA, 'publish-post': { ...post, status: 'publish' } });
    expect(await cmdPagesPublish(ctx(dir, ['5'], { 'customer-said': '改一下标题' }))).toMatchObject({
      ok: false,
      code: 'needs_publish_request',
    });
    expect(await cmdPagesPublish(ctx(dir, ['5'], { 'customer-said': '可以发布了' }))).toMatchObject({
      ok: false,
      code: 'get_first',
    });
    expect(called).not.toContain('publish-post');
  });

  it('publishes with the base it read; a change since then is a conflict', async () => {
    const dir = await workdir();
    const sent: unknown[] = [];
    stubSite({
      'get-product-schema': SCHEMA,
      'get-blocks': {
        ...post,
        blocks: [{ path: '1', name: 'puffergo/tailwind-container', kind: 'static' }],
        block: { path: '1', name: 'puffergo/tailwind-container', kind: 'static', html: '<p>x</p>' },
      },
      'publish-post': { ...post, status: 'publish', link: 'https://s/p/' },
    });
    const stubbed = globalThis.fetch;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.includes('publish-post')) sent.push(JSON.parse(String(init?.body)).input);
      return stubbed(url, init);
    });
    await cmdGet(ctx(dir, ['5', '1']));
    expect(await cmdPagesPublish(ctx(dir, ['5'], { 'customer-said': '可以上线' }))).toMatchObject({
      ok: true,
      status: 'publish',
      link: 'https://s/p/',
    });
    expect(sent[0]).toEqual({ id: 5, baseModified: 'T' });

    stubSite({ 'get-product-schema': SCHEMA, 'publish-post': new Fail(409, { code: 'conflict', message: 'changed' }) });
    expect(await cmdPagesPublish(ctx(dir, ['5'], { 'customer-said': 'publish it' }))).toMatchObject({
      ok: false,
      code: 'conflict',
    });
  });
});
