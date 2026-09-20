import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentHttpError, type AgentClient } from '../lib/agentClient';

const fake: { current: AgentClient | null } = { current: null };
vi.mock('../lib/siteCmd', async orig => ({
  ...(await orig<typeof import('../lib/siteCmd')>()),
  client: async () => fake.current,
}));
process.env.PUFFERGO_NO_BROWSER = '1';

const { sectionFiles, cmdPreview, cmdBlocks, cmdGet, cmdReplace, cmdCreate, cmdSeo } = await import('../lib/pagesCmd');
const { localImageRefs } = await import('../lib/htmlImages');

const SEO = {
  slug: 'home',
  'seo-title': 'Home',
  'seo-description': 'About our valves.',
  'focus-keyword': 'gate valve',
};
const { writeWorkdirConfig } = await import('../lib/site');

const SITE = 'http://site.test';
// 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

async function workdir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pg-pages-'));
  await writeWorkdirConfig(dir, { siteUrl: SITE });
  return dir;
}

const ctx = (dir: string, positional: string[], flags: Record<string, string> = {}) => ({
  dir,
  positional,
  flags: new Map(Object.entries(flags)),
});

describe('section files', () => {
  it('finds local image refs, not web ones', () => {
    const html =
      '<img src="images/a.png"><img src="https://x.com/b.png"><img src="//cdn/c.png"><img src="/wp-content/d.png">' +
      '<div style="background-image:url(\'images/e.jpg\')"></div><img src="data:image/png;base64,xx"><img src="images/a.png">';
    expect(localImageRefs(html)).toEqual(['images/a.png', 'images/e.jpg']);
  });

  it('a folder gives its .html files in name order', async () => {
    const dir = await workdir();
    await mkdir(join(dir, 'pages/home'), { recursive: true });
    for (const n of ['02-b.html', '01-a.html', 'notes.md', '10-c.html', 'block-1.orig.html'])
      await writeFile(join(dir, 'pages/home', n), 'x');
    const files = await sectionFiles(dir, ['pages/home']);
    expect(files.map(f => f.split('/').pop())).toEqual(['01-a.html', '02-b.html', '10-c.html']);
  });
});

describe('pages preview / create', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await workdir();
    await mkdir(join(dir, 'pages/home/images'), { recursive: true });
    await writeFile(join(dir, 'pages/home/images/hero.png'), PNG);
    await writeFile(join(dir, 'pages/home/01-hero.html'), '<section><img src="images/hero.png" alt="Hero"></section>');
    await writeFile(join(dir, 'pages/home/02-body.html'), '<section><p>b</p></section>');
  });

  it('flags marketing words in the visible text, not in class names', async () => {
    await writeFile(
      join(dir, 'pages/home/02-body.html'),
      '<section class="leading-7"><p>A state-of-the-art factory.</p></section>',
    );
    fake.current = {
      siteUrl: SITE,
      mediaLookup: async () => ({ found: true, mediaId: 7, url: 'u' }),
      previewBlocks: async () => ({ previewUrl: 'p', expiresIn: 3600 }),
    } as unknown as AgentClient;
    const out = await cmdPreview(ctx(dir, ['pages/home']));
    expect(out.warnings).toEqual([
      expect.objectContaining({ path: 'pages/home/02-body.html', code: 'unsupported_claim' }),
    ]);
    expect(JSON.stringify(out.warnings)).not.toContain('"leading"');
  });

  it('uploads a local image once and sends its site URL', async () => {
    const previewBlocks = vi.fn(async () => ({
      previewUrl: `${SITE}/wp-admin/admin.php?page=x&token=t`,
      expiresIn: 3600,
    }));
    const uploadMedia = vi.fn(async () => ({ id: 7, url: `${SITE}/uploads/hero.png` }));
    fake.current = {
      siteUrl: SITE,
      mediaLookup: async () => ({ found: false }),
      uploadMedia,
      previewBlocks,
    } as unknown as AgentClient;

    const out = await cmdPreview(ctx(dir, ['pages/home'], { title: 'Home' }));
    expect(out).toMatchObject({ ok: true, uploaded: ['pages/home/images/hero.png'] });
    expect(previewBlocks).toHaveBeenCalledWith(
      ['<section><img src="http://site.test/uploads/hero.png" alt="Hero"></section>', '<section><p>b</p></section>'],
      'Home',
      undefined,
    );

    await cmdPreview(ctx(dir, ['pages/home']));
    expect(uploadMedia).toHaveBeenCalledTimes(1); // second run reuses the upload
  });

  it('names section errors by file', async () => {
    fake.current = {
      siteUrl: SITE,
      mediaLookup: async () => ({ found: true, mediaId: 7, url: `${SITE}/uploads/hero.png` }),
      createPost: async () => {
        throw new AgentHttpError(400, {
          code: 'invalid_sections',
          message: 'Some sections need fixing; nothing was written.',
          data: { status: 400, errors: [{ section: 2, code: 'width_missing', message: 'Wrap…', fix: 'ai' }] },
        });
      },
    } as unknown as AgentClient;
    const out = await cmdCreate(ctx(dir, ['pages/home'], { type: 'page', title: 'Home', ...SEO }));
    expect(out).toMatchObject({
      ok: false,
      code: 'invalid_sections',
      fix: 'ai',
      errors: [{ file: 'pages/home/02-body.html', section: 2, code: 'width_missing' }],
    });
  });

  it('the same files are not created twice unless --new', async () => {
    const createPost = vi.fn(async () => ({
      id: 9,
      type: 'page',
      status: 'draft',
      blocks: 2,
      baseModified: 'T',
      link: 'l',
      editUrl: 'e',
    }));
    fake.current = {
      siteUrl: SITE,
      mediaLookup: async () => ({ found: true, mediaId: 7, url: 'u' }),
      createPost,
    } as unknown as AgentClient;
    const args = ctx(dir, ['pages/home'], { type: 'page', title: 'Home', ...SEO });
    expect(await cmdCreate(args)).toMatchObject({ ok: true, id: 9 });
    expect(await cmdCreate(args)).toMatchObject({ ok: false, code: 'already_created', id: 9 });
    expect(createPost).toHaveBeenCalledTimes(1);
    expect(
      await cmdCreate(ctx(dir, ['pages/home'], { type: 'page', title: 'Home', new: 'true', ...SEO })),
    ).toMatchObject({
      ok: true,
    });
    expect(createPost).toHaveBeenCalledTimes(2);
  });

  it('a missing image is the AI’s to fix, before anything is sent', async () => {
    await writeFile(join(dir, 'pages/home/02-body.html'), '<img src="images/nope.png">');
    const createPost = vi.fn();
    fake.current = {
      siteUrl: SITE,
      mediaLookup: async () => ({ found: true, mediaId: 7, url: 'u' }),
      createPost,
    } as unknown as AgentClient;
    const out = await cmdCreate(ctx(dir, ['pages/home'], { type: 'page', title: 'Home', ...SEO }));
    expect(out).toMatchObject({ ok: false, code: 'image_not_found', fix: 'ai' });
    expect(createPost).not.toHaveBeenCalled();
  });
});

describe('pages get / replace', () => {
  const post = (status: string, baseModified: string) => ({
    id: 5,
    type: 'page',
    title: 'About',
    status,
    baseModified,
    link: `${SITE}/?page_id=5`,
    editUrl: `${SITE}/wp-admin/post.php?post=5&action=edit`,
  });

  it('refuses to replace before get', async () => {
    const dir = await workdir();
    fake.current = { siteUrl: SITE } as unknown as AgentClient;
    await writeFile(join(dir, 'b.html'), 'x');
    expect(await cmdReplace(ctx(dir, ['5', '2', 'b.html']))).toMatchObject({ ok: false, code: 'get_first' });
  });

  it('get saves the block, replace sends it back with the remembered baseModified', async () => {
    const dir = await workdir();
    const replaceBlock = vi.fn(async () => post('draft', 'T2'));
    fake.current = {
      siteUrl: SITE,
      getBlocks: vi.fn(async (_id: number, path?: string) =>
        path
          ? {
              ...post('draft', 'T1'),
              block: { path: '2', name: 'puffergo/tailwind-container', kind: 'static', html: '<p>old</p>' },
            }
          : post('draft', 'T1'),
      ),
      replaceBlock,
    } as unknown as AgentClient;

    const got = await cmdGet(ctx(dir, ['5', '2']));
    expect(got).toMatchObject({ ok: true, file: 'pages/5/block-2.html' });
    expect(await readFile(join(dir, 'pages/5/block-2.html'), 'utf8')).toBe('<p>old</p>');
    expect(await readFile(join(dir, 'pages/5/block-2.orig.html'), 'utf8')).toBe('<p>old</p>');

    await writeFile(join(dir, 'pages/5/block-2.html'), '<p>new</p>');
    expect(await cmdReplace(ctx(dir, ['5', '2', 'pages/5/block-2.html']))).toMatchObject({ ok: true, path: '2' });
    expect(replaceBlock).toHaveBeenCalledWith({ id: 5, path: '2', html: '<p>new</p>', baseModified: 'T1' });

    // The next replace on the same post carries the new baseModified.
    await cmdReplace(ctx(dir, ['5', '2', 'pages/5/block-2.html']));
    expect(replaceBlock).toHaveBeenLastCalledWith(expect.objectContaining({ baseModified: 'T2' }));
  });

  it('an edited block is warned only about marketing words the edit added', async () => {
    const dir = await workdir();
    fake.current = {
      siteUrl: SITE,
      getBlocks: async () => ({
        ...post('draft', 'T1'),
        block: {
          path: '1',
          name: 'puffergo/tailwind-container',
          kind: 'static',
          html: '<p>ISO 9001 certification</p>',
        },
      }),
      previewBlocks: async () => ({ previewUrl: 'p', expiresIn: 3600 }),
    } as unknown as AgentClient;
    await cmdGet(ctx(dir, ['5', '1']));
    await writeFile(join(dir, 'pages/5/block-1.html'), '<p>ISO 9001 certification. Premium valves.</p>');
    const out = await cmdPreview(ctx(dir, ['pages/5/block-1.html']));
    expect(JSON.stringify(out.warnings)).toContain('premium');
    expect(JSON.stringify(out.warnings)).not.toContain('certification');
  });

  it("a published page stays unchanged without the customer's go-ahead", async () => {
    const dir = await workdir();
    const replaceBlock = vi.fn(async () => post('publish', 'T2'));
    fake.current = {
      siteUrl: SITE,
      getBlocks: vi.fn(async (_id: number, path?: string) =>
        path
          ? {
              ...post('publish', 'T1'),
              block: { path: '1', name: 'puffergo/tailwind-container', kind: 'static', html: 'x' },
            }
          : post('publish', 'T1'),
      ),
      replaceBlock,
    } as unknown as AgentClient;
    await cmdGet(ctx(dir, ['5', '1']));
    expect(await cmdReplace(ctx(dir, ['5', '1', 'pages/5/block-1.html']))).toMatchObject({
      ok: false,
      code: 'live_locked',
    });
    expect(replaceBlock).not.toHaveBeenCalled();

    // the customer's go-ahead for this one change
    expect(
      await cmdReplace(ctx(dir, ['5', '1', 'pages/5/block-1.html'], { 'customer-said': '可以，换上去吧' })),
    ).toMatchObject({ ok: true, note: 'This changed the live page.' });
    expect(replaceBlock).toHaveBeenCalledTimes(1);

    // or the switch, for many in a row
    await writeWorkdirConfig(dir, { siteUrl: SITE, editLive: { on: true, customerSaid: '改一下首页', at: 'x' } });
    expect(await cmdReplace(ctx(dir, ['5', '1', 'pages/5/block-1.html']))).toMatchObject({
      ok: true,
      note: 'This changed the live page.',
    });
  });

  it('a component block is left to the WordPress editor', async () => {
    const dir = await workdir();
    fake.current = {
      siteUrl: SITE,
      getBlocks: async () => ({
        ...post('draft', 'T1'),
        block: { path: '3', name: 'puffergo/tailwind-container', kind: 'config' },
      }),
    } as unknown as AgentClient;
    expect(await cmdGet(ctx(dir, ['5', '3']))).toMatchObject({ ok: false, code: 'not_static', fix: 'user' });
  });

  it('a classic-editor or page-builder page: its content is left to its own editor', async () => {
    const dir = await workdir();
    const note = "This page was made with the Elementor page builder, so its content can't be changed here.";
    fake.current = {
      siteUrl: SITE,
      getBlocks: async () => ({ ...post('publish', 'T1'), blocks: [], editor: 'Elementor', editorNote: note }),
    } as unknown as AgentClient;
    const expected = { ok: false, code: 'not_block_content', fix: 'user', editor: 'Elementor', message: note };
    expect(await cmdBlocks(ctx(dir, ['5']))).toMatchObject(expected);
    expect(await cmdGet(ctx(dir, ['5']))).toMatchObject(expected);
  });

  it('get without a path saves every static block; preview <id> <path> <file> shows it in its page', async () => {
    const dir = await workdir();
    const html: Record<string, string> = { '1': '<p>a</p>', '2.1': '<p>b</p>' };
    const previewBlocks = vi.fn(async () => ({ previewUrl: 'http://s.test/about/?puffergo_ai_preview=2.1' }));
    fake.current = {
      siteUrl: SITE,
      getBlocks: async (_id: number, path?: string) =>
        path
          ? {
              ...post('publish', 'T1'),
              block:
                path === '3'
                  ? { path, name: 'puffergo/tailwind-container', kind: 'config', text: 'Slider' } // no data to edit
                  : { path, name: 'puffergo/tailwind-container', kind: 'static', html: html[path] },
            }
          : {
              ...post('publish', 'T1'),
              blocks: [
                { path: '1', name: 'puffergo/tailwind-container', kind: 'static' },
                {
                  path: '2',
                  name: 'core/group',
                  kind: 'other',
                  innerBlocks: [{ path: '2.1', name: 'puffergo/tailwind-container', kind: 'static' }],
                },
                { path: '3', name: 'puffergo/tailwind-container', kind: 'config', text: 'Slider' },
              ],
            },
      previewBlocks,
    } as unknown as AgentClient;

    const got = await cmdGet(ctx(dir, ['5']));
    expect(got).toMatchObject({
      ok: true,
      saved: [{ path: '1' }, { path: '2.1' }],
      notSaved: [{ path: '3', kind: 'config', text: 'Slider' }],
    });
    expect(await readFile(join(dir, 'pages/5/block-2.1.orig.html'), 'utf8')).toBe('<p>b</p>');

    const out = await cmdPreview(ctx(dir, ['5', '2.1', 'pages/5/block-2.1.html']));
    expect(out).toMatchObject({ ok: true, previewUrl: 'http://s.test/about/?puffergo_ai_preview=2.1' });
    expect(previewBlocks).toHaveBeenCalledWith(['<p>b</p>'], undefined, { id: 5, path: '2.1' });
  });

  it('a stale post is a conflict to redo', async () => {
    const dir = await workdir();
    fake.current = {
      siteUrl: SITE,
      getBlocks: async (_id: number, path?: string) =>
        path ? { ...post('draft', 'T1'), block: { path: '1', kind: 'static', html: 'x' } } : post('draft', 'T1'),
      replaceBlock: async () => {
        throw new AgentHttpError(409, { code: 'conflict', message: 'changed', data: { status: 409 } });
      },
    } as unknown as AgentClient;
    await cmdGet(ctx(dir, ['5', '1']));
    expect(await cmdReplace(ctx(dir, ['5', '1', 'pages/5/block-1.html']))).toMatchObject({
      ok: false,
      code: 'conflict',
      fix: 'ai',
    });
  });
});

describe('pages SEO', () => {
  const seo = { slug: 'about', seoTitle: 'About', seoDescription: 'Old.', featuredImage: null, plugin: 'rank-math' };
  const post = (status: string, baseModified: string, over = {}) => ({
    id: 5,
    type: 'post',
    title: 'About',
    status,
    baseModified,
    link: `${SITE}/about/`,
    editUrl: 'e',
    seo: { ...seo, ...over },
  });

  it('create needs the slug and SEO title / description before anything is sent', async () => {
    const dir = await workdir();
    const createPost = vi.fn();
    fake.current = { siteUrl: SITE, createPost } as unknown as AgentClient;
    const out = await cmdCreate(ctx(dir, ['x'], { type: 'page', title: 'Home', slug: 'home' }));
    expect(out).toMatchObject({ ok: false, code: 'seo_missing', fix: 'ai' });
    expect(String(out.message)).toContain('--seo-title, --seo-description');
    expect(createPost).not.toHaveBeenCalled();
  });

  it('sends the core keyword and --keywords "a, b" as a list of long-tail keywords', async () => {
    const dir = await workdir();
    await mkdir(join(dir, 'p'), { recursive: true });
    await writeFile(join(dir, 'p/01.html'), '<section><p>x</p></section>');
    const createPost = vi.fn(async () => ({
      id: 3,
      status: 'draft',
      baseModified: 'T',
      link: 'l',
      editUrl: 'e',
      seo: {},
    }));
    fake.current = { siteUrl: SITE, createPost } as unknown as AgentClient;
    await cmdCreate(
      ctx(dir, ['p'], { type: 'page', title: 'Home', ...SEO, keywords: 'gate valve supplier,  water plant valves ' }),
    );
    expect(createPost).toHaveBeenCalledWith(
      expect.objectContaining({ focusKeyword: 'gate valve', keywords: ['gate valve supplier', 'water plant valves'] }),
    );
  });

  it("shows, then changes; a live post only with the customer's go-ahead, and never its slug", async () => {
    const dir = await workdir();
    const updateSeo = vi.fn(async () => post('publish', 'T2', { seoTitle: 'Durable valves' }));
    fake.current = { siteUrl: SITE, getBlocks: async () => post('publish', 'T1'), updateSeo } as unknown as AgentClient;

    expect(await cmdSeo(ctx(dir, ['5'], { 'seo-title': 'x' }))).toMatchObject({ ok: false, code: 'get_first' });
    expect(await cmdSeo(ctx(dir, ['5']))).toMatchObject({ ok: true, seo: { slug: 'about' } });
    expect(await cmdSeo(ctx(dir, ['5'], { 'seo-title': 'x' }))).toMatchObject({ ok: false, code: 'live_locked' });
    expect(await cmdSeo(ctx(dir, ['5'], { slug: 'about-us', 'customer-said': '网址也改一下' }))).toMatchObject({
      ok: false,
      code: 'slug_locked',
    });

    await writeWorkdirConfig(dir, { siteUrl: SITE, editLive: { on: true, customerSaid: '改一下标题', at: 'x' } });
    expect(await cmdSeo(ctx(dir, ['5'], { slug: 'about-us' }))).toMatchObject({
      ok: false,
      code: 'slug_locked',
      fix: 'user',
    });
    expect(updateSeo).not.toHaveBeenCalled();

    const out = await cmdSeo(ctx(dir, ['5'], { slug: 'about', 'seo-title': 'Durable valves' }));
    expect(updateSeo).toHaveBeenCalledWith({ id: 5, baseModified: 'T1', slug: 'about', seoTitle: 'Durable valves' });
    expect(out).toMatchObject({ ok: true, before: { seoTitle: 'About' } });
    expect(JSON.stringify(out.warnings)).toContain('durable');
  });
});
