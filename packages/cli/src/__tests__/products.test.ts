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
