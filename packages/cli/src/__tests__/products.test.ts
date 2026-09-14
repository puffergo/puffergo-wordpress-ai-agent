import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { sniffImage } from '../lib/imageSniff';
import { walkImageRefs } from '../lib/imageRefs';
import { readbackMismatches, stripFileRefsForValidate, PUBLISH_INTENT, cmdPublish } from '../lib/productsCmd';
import { readUploadsCache, writeUploadsCache, loadProducts } from '../lib/productFiles';
import { localCheckProduct } from '../lib/localCheck';
import { normalizeSiteUrl } from '../lib/loginCmd';
import type { ProductFile } from '../lib/productTypes';

// ---- tiny image builders -------------------------------------------------------------------------
function png(w: number, h: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type), data, Buffer.alloc(4)]);
  };
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.alloc(h * (w * 3 + 1)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function gif(w: number, h: number): Buffer {
  const b = Buffer.from('GIF89a\0\0\0\0', 'binary');
  b.writeUInt16LE(w, 6);
  b.writeUInt16LE(h, 8);
  return b;
}
function jpeg(w: number, h: number): Buffer {
  // SOI, APP0 (len 16), SOF0 (len 17) with dims, EOI
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Buffer.from('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const sof = Buffer.alloc(19);
  sof.set([0xff, 0xc0, 0x00, 0x11, 0x08]);
  sof.writeUInt16BE(h, 5);
  sof.writeUInt16BE(w, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}
function webpVp8x(w: number, h: number): Buffer {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0);
  b.write('WEBP', 8);
  b.write('VP8X', 12);
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
}
const u8 = (b: Buffer) => new Uint8Array(b.buffer, b.byteOffset, b.byteLength);

describe('sniffImage', () => {
  it('identifies formats by content and parses dimensions', () => {
    expect(sniffImage(u8(png(800, 601)))).toEqual({ format: 'png', width: 800, height: 601 });
    expect(sniffImage(u8(gif(320, 200)))).toEqual({ format: 'gif', width: 320, height: 200 });
    expect(sniffImage(u8(jpeg(1080, 771)))).toEqual({ format: 'jpeg', width: 1080, height: 771 });
    expect(sniffImage(u8(webpVp8x(1600, 900)))).toEqual({ format: 'webp', width: 1600, height: 900 });
  });
  it('rejects non-images regardless of extension', () => {
    expect(sniffImage(u8(Buffer.from('not an image'))).format).toBeNull();
  });
});

describe('workdir files', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pg-cli-test-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('local check: missing file, fake image, small image warning', async () => {
    await mkdir(join(dir, 'images'));
    await writeFile(join(dir, 'images', 'fake.jpg'), 'hello');
    await writeFile(join(dir, 'images', 'small.png'), png(500, 400));
    await writeFile(join(dir, 'images', 'ok.png'), png(1200, 800));
    const product: ProductFile = {
      key: 'k-1',
      title: 't',
      gallery: [
        { file: 'images/missing.jpg' },
        { file: 'images/fake.jpg' },
        { file: 'images/small.png' },
        { file: 'images/ok.png' },
      ],
    };
    const r = await localCheckProduct(product, dir);
    expect(r.errors.map(e => [e.path, e.code])).toEqual([
      ['k-1.gallery[0]', 'not_found'],
      ['k-1.gallery[1]', 'format'],
    ]);
    expect(r.warnings.map(e => e.path)).toEqual(['k-1.gallery[2]']);
  });

  it('upload cache is kept per site', async () => {
    await writeUploadsCache(dir, 'http://a.test', { abc: { mediaId: 1, url: 'u' } });
    await writeUploadsCache(dir, 'http://b.test', { abc: { mediaId: 9, url: 'v' } });
    expect((await readUploadsCache(dir, 'http://a.test')).abc.mediaId).toBe(1);
    expect((await readUploadsCache(dir, 'http://b.test')).abc.mediaId).toBe(9);
    expect(await readUploadsCache(dir, 'http://c.test')).toEqual({});
  });

  it('a broken product file becomes a parse error, not a crash', async () => {
    await mkdir(join(dir, 'products'));
    await writeFile(join(dir, 'products', 'bad.json'), '{ nope');
    const [p] = await loadProducts(dir);
    expect(p.fileKey).toBe('bad');
    expect(p.parseError).toBeTruthy();
  });
});

describe('site resolution', () => {
  let dir: string;
  let home: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pg-cli-site-'));
    home = await mkdtemp(join(tmpdir(), 'pg-cli-home-'));
    vi.resetModules();
    vi.doMock('node:os', async orig => ({ ...(await orig<typeof import('node:os')>()), homedir: () => home }));
  });
  afterEach(async () => {
    vi.doUnmock('node:os');
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });
  const store = async (sites: Record<string, unknown>) => {
    await mkdir(join(home, '.puffergo'), { recursive: true });
    await writeFile(join(home, '.puffergo', 'credentials.json'), JSON.stringify({ sites }));
  };
  const cred = { username: 'u', appPassword: 'p' };

  it('--site beats workdir config beats the only site', async () => {
    await store({ 'http://a.test': cred, 'http://b.test': cred });
    const { resolveSite } = await import('../lib/site');
    await mkdir(join(dir, '.puffergo'));
    await writeFile(join(dir, '.puffergo', 'config.json'), JSON.stringify({ siteUrl: 'http://b.test' }));
    expect((await resolveSite(dir, 'http://a.test')).config.siteUrl).toBe('http://a.test');
    expect((await resolveSite(dir, undefined)).config.siteUrl).toBe('http://b.test');
  });
  it('several sites and no choice → no_site with the list; unknown site → not_logged_in', async () => {
    await store({ 'http://a.test': cred, 'http://b.test': cred });
    const { resolveSite } = await import('../lib/site');
    await expect(resolveSite(dir, undefined)).rejects.toMatchObject({
      code: 'no_site',
      sites: ['http://a.test', 'http://b.test'],
    });
    await expect(resolveSite(dir, 'http://c.test')).rejects.toMatchObject({ code: 'not_logged_in' });
  });
  it('a single stored site is used when nothing else says which', async () => {
    await store({ 'http://a.test/': cred });
    const { resolveSite } = await import('../lib/site');
    expect((await resolveSite(dir, undefined)).config.siteUrl).toBe('http://a.test/');
  });
  it('credentials file is written owner-only', async () => {
    const { upsertCredential } = await import('../adapters/credentials');
    await upsertCredential({ siteUrl: 'http://a.test', ...cred });
    const { stat } = await import('node:fs/promises');
    expect((await stat(join(home, '.puffergo', 'credentials.json'))).mode & 0o777).toBe(0o600);
    expect(
      JSON.parse(await readFile(join(home, '.puffergo', 'credentials.json'), 'utf8')).sites['http://a.test'],
    ).toEqual(cred);
  });
});

describe('ref rewriting and read-back', () => {
  const product = (): ProductFile => ({
    key: 'k-1',
    title: 'T',
    gallery: [{ file: 'a.jpg', alt: 'a' }, { mediaId: 5 }],
    detail: {
      unmanagedHtml: '<p>x</p>',
      sections: [
        { layout: 'split', heading: 'h', image: { file: 'b.jpg' } },
        {
          layout: 'gallery',
          images: [
            { file: 'c.jpg', title: 'C' },
            { mediaId: 7, title: 'D' },
          ],
        },
      ],
    },
  });

  it('walks every image ref with the server path names', () => {
    expect(walkImageRefs(product()).map(r => r.path)).toEqual([
      'k-1.gallery[0]',
      'k-1.gallery[1]',
      'k-1.detail.sections[0].image',
      'k-1.detail.sections[1].images[0]',
      'k-1.detail.sections[1].images[1]',
    ]);
  });

  it('validate payload strips only file refs and unmanagedHtml, leaving the original untouched', () => {
    const p = product();
    const { clone, strippedPaths } = stripFileRefsForValidate(p);
    expect([...strippedPaths]).toEqual([
      'k-1.gallery[0]',
      'k-1.detail.sections[0].image',
      'k-1.detail.sections[1].images[0]',
    ]);
    expect(clone.detail?.unmanagedHtml).toBeUndefined();
    expect(clone.gallery?.[1]).toEqual({ mediaId: 5 });
    expect(p.gallery?.[0].file).toBe('a.jpg');
  });

  it('read-back flags differences and ignores omitted fields', () => {
    const local: ProductFile = {
      key: 'k',
      title: 'T',
      status: 'draft',
      specs: [{ key: 'a', value: '1' }],
      detail: { sections: [{ layout: 'text', body: 'b' }] },
    };
    const remote = {
      title: 'T',
      status: 'draft',
      price: { type: 'contact' },
      specs: [{ key: 'a', value: '1' }],
      gallery: [],
      detail: { sections: [{ layout: 'text', body: 'b' }] },
    };
    expect(readbackMismatches(local, remote)).toEqual([]);
    expect(readbackMismatches({ ...local, status: 'publish' }, remote)).toHaveLength(1);
    expect(readbackMismatches(local, { ...remote, detail: { sections: [] } })[0]).toMatch(/sections/);
    expect(readbackMismatches({ ...local, specs: [] }, remote)[0]).toMatch(/specs/);
  });
});

describe('normalizeSiteUrl', () => {
  it('adds https, keeps explicit scheme, drops wp-admin and slashes', () => {
    expect(normalizeSiteUrl('example.com')).toBe('https://example.com');
    expect(normalizeSiteUrl('http://shop.test/')).toBe('http://shop.test');
    expect(normalizeSiteUrl('https://x.com/shop/wp-admin/index.php')).toBe('https://x.com/shop');
  });
});

describe('publish needs the customer asking for it', () => {
  it('accepts explicit publish wording only', () => {
    for (const ok of ['把 PG-500 发布', '上线吧', 'publish it', 'go live with these', 'make it live'])
      expect(PUBLISH_INTENT.test(ok)).toBe(true);
    for (const no of ['改完直接推', '推送到网站', '上传', 'push it', 'update the site', ''])
      expect(PUBLISH_INTENT.test(no)).toBe(false);
  });
  it('refuses without --customer-said before touching any file', async () => {
    const r = (await cmdPublish({ dir: '/nonexistent', flags: new Map(), positional: ['k-1'] })) as { code: string };
    expect(r.code).toBe('needs_publish_request');
  });
});

// ---- templates -------------------------------------------------------------------------------------
import { templateReference, resolveProductId, TargetError } from '../lib/templates';
import { optionalFactPaths, loadSiteSchema, SchemaVersionError, type TradeField } from '../lib/siteSchema';

const SCHEMA3: { tradeFields: TradeField[] } = {
  tradeFields: [
    { path: 'price', kind: 'unitValue', unitType: 'currency', label: 'Price' },
    { path: 'moq', kind: 'unitValue', unitType: 'quantity', label: 'Min. Order' },
    { path: 'leadTime', kind: 'unitValue', unitType: 'time', label: 'Lead Time' },
  ],
};
import { TemplateCtx, applyTemplate } from '../lib/productsCmd';
import type { AgentClient } from '../lib/agentClient';

describe('templateReference', () => {
  const remote: ProductFile = {
    id: 9,
    key: 'pg-500',
    status: 'publish',
    title: 'PG-500 Air Compressor',
    moq: { value: 5, unit: 'sets' },
    leadTime: { min: 10, max: 15, unit: 'days' },
    specs: [{ key: 'Power', value: '5.5 kW' }],
    gallery: [{ mediaId: 3, alt: 'front' }],
    detail: { sections: [{ layout: 'split', heading: 'Quiet', body: 'Runs at 60 dB.', image: { mediaId: 4 } }] },
  };
  const ref = templateReference(remote, SCHEMA3) as Record<string, any>;

  it('hides every number and spec value, keeps units and spec names', () => {
    expect(ref.moq).toEqual({ value: '<from customer>', unit: 'sets' });
    expect(ref.leadTime).toEqual({ min: '<from customer>', max: '<from customer>', unit: 'days' });
    expect(ref.specs).toEqual([{ key: 'Power', value: '<from customer>' }]);
    expect(JSON.stringify(ref)).not.toContain('5.5');
    expect(ref.detail.sections[0].body).toBe('<text from customer facts>');
    expect(ref.title).toBe('<text from customer facts>');
    expect(ref.detail.sections[0].layout).toBe('split');
  });
  it('lists the trade fields the site does not use, and drops identity/images', () => {
    expect(ref.notUsed).toEqual(['price']);
    expect(ref.id ?? ref.key ?? ref.status).toBeUndefined();
    expect(ref.gallery).toEqual([{ file: '<customer photo>' }]);
    expect(ref.detail.sections[0].image).toEqual({ file: '<customer photo>' });
  });
  it('keeps "price on request" as is', () => {
    expect((templateReference({ title: 't', price: { type: 'contact' } }, SCHEMA3) as any).price).toEqual({
      type: 'contact',
    });
  });
});

describe('templates in check', () => {
  const fake = (remote: Record<string, unknown>) =>
    ({ siteUrl: 'http://shop.test', getProduct: vi.fn(async () => remote) }) as unknown as AgentClient;

  it('knows which optional facts a template leaves out (fetched once)', async () => {
    const c = fake({ title: 'T', moq: { value: 1, unit: 'sets' }, specs: [] });
    const tpl = new TemplateCtx(c, { pumps: { id: 9, title: 'T' } }, optionalFactPaths(SCHEMA3));
    expect([...(await tpl.fieldsNotUsed('pumps'))!].sort()).toEqual(['leadTime', 'price', 'specs']);
    await tpl.fieldsNotUsed('pumps');
    expect(c.getProduct).toHaveBeenCalledTimes(1);
    expect(await tpl.fieldsNotUsed('nope')).toBeNull();
  });

  it('requires a template choice when the site has templates, and drops warnings for unused fields', async () => {
    const tpl = new TemplateCtx(
      fake({ title: 'T', moq: { value: 1, unit: 'sets' } }),
      {
        pumps: { id: 9, title: 'T' },
      },
      optionalFactPaths(SCHEMA3),
    );
    const w = (f: string) => ({ path: `p-1.${f}`, code: 'missing_source', message: '', fix: 'user' as const });
    const warnings = [w('price'), w('moq'), w('leadTime')];
    expect((await applyTemplate({ key: 'p-1', title: 'x' }, tpl, warnings)).errors[0].code).toBe('template_required');
    expect((await applyTemplate({ key: 'p-1', title: 'x', template: '' }, tpl, warnings)).warnings).toHaveLength(3);
    const used = await applyTemplate({ key: 'p-1', title: 'x', template: 'pumps' }, tpl, warnings);
    expect(used.errors).toEqual([]);
    expect(used.warnings.map(x => x.path)).toEqual(['p-1.moq']);
    expect((await applyTemplate({ key: 'p-1', title: 'x', template: 'nope' }, tpl, [])).errors[0].code).toBe(
      'unknown_template',
    );
  });
});

describe('resolveProductId', () => {
  const c = {
    siteUrl: 'https://www.shop.test',
    listProducts: vi.fn(async (p: { url?: string; key?: string }) => ({
      items: p.url || p.key === 'k-1' ? [{ id: 42 }] : [],
    })),
  } as unknown as AgentClient;

  it('takes ids, keys and links on the connected site', async () => {
    expect(await resolveProductId(c, '17')).toBe(17);
    expect(await resolveProductId(c, 'k-1')).toBe(42);
    expect(await resolveProductId(c, 'https://shop.test/wp-admin/post.php?post=42&action=edit')).toBe(42);
  });
  it('refuses a link to another site and reports unknown keys', async () => {
    await expect(resolveProductId(c, 'https://other.test/p/x/')).rejects.toMatchObject({ code: 'other_site' });
    await expect(resolveProductId(c, 'nope')).rejects.toBeInstanceOf(TargetError);
  });
});

import { claimWarnings } from '../lib/claims';
describe('claimWarnings', () => {
  it('flags marketing words per field, once each, and leaves plain facts alone', () => {
    const w = claimWarnings({
      key: 'v-1',
      title: 'GV-50 Gate Valve',
      excerpt: 'Durable, robust valve. Durable again.',
      detail: {
        sections: [{ layout: 'text', heading: 'Body', body: 'WCB cast steel body rated PN16; ensures reliability.' }],
      },
    });
    expect(w.map(x => x.path)).toEqual(['v-1.excerpt', 'v-1.detail.sections[0].body']);
    expect(w[0].message).toContain('"durable", "robust"');
    expect(w[1].message).toContain('"ensures", "reliability"');
    expect(claimWarnings({ title: 'Flanged ends bolt onto DN50 pipelines' })).toEqual([]);
    expect(claimWarnings({ title: 't', excerpt: 'Factory tested before shipping.' })[0].message).toContain('"tested"');
  });
});

describe('site schema drives trade fields', () => {
  const CUSTOM: { tradeFields: TradeField[] } = {
    tradeFields: [
      { path: 'trade.payment_terms', kind: 'text', label: 'Payment Terms' },
      { path: 'moq', kind: 'unitValue', unitType: 'quantity', label: 'Min. Order' },
    ],
  };
  it('masks custom trade values and lists unused ones from the schema, not a hard-coded list', () => {
    const ref = templateReference(
      {
        title: 't',
        trade: { payment_terms: 'T/T 30%' },
        price: { value: 9, unit: 'USD' },
        specs: [{ key: 'a', value: 'b' }],
      },
      CUSTOM,
    ) as any;
    expect(ref.trade).toEqual({ payment_terms: '<from customer>' });
    expect(ref.notUsed).toEqual(['moq']);
    expect(optionalFactPaths(CUSTOM)).toEqual(['trade.payment_terms', 'moq', 'specs']);
  });
  it('refuses a site newer than this CLI and falls back to the three built-ins on old plugins', async () => {
    const newer = { schema: async () => ({ schemaVersion: 99 }) } as unknown as AgentClient;
    await expect(loadSiteSchema(newer)).rejects.toBeInstanceOf(SchemaVersionError);
    const old = { schema: async () => ({ layouts: [] }) } as unknown as AgentClient;
    expect((await loadSiteSchema(old)).tradeFields.map(f => f.path)).toEqual(['price', 'moq', 'leadTime']);
  });
  it('read-back compares custom trade values', () => {
    expect(
      readbackMismatches({ title: 't', trade: { payment_terms: 'A' } }, { title: 't', trade: { payment_terms: 'A' } }),
    ).toEqual([]);
    expect(readbackMismatches({ title: 't', trade: { payment_terms: 'A' } }, { title: 't', trade: {} })).toEqual([
      'trade mismatch',
    ]);
    expect(readbackMismatches({ title: 't', trade: { port: '' } }, { title: 't', trade: {} })).toEqual([]);
  });
});
