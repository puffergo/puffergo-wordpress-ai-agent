import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentHttpError, type AgentClient } from '../lib/agentClient';
import type * as SiteCmd from '../lib/siteCmd';

const fake: { current: AgentClient | null } = { current: null };
vi.mock('../lib/siteCmd', async orig => ({
  ...(await orig<typeof SiteCmd>()),
  client: async () => fake.current,
}));
process.env.PUFFERGO_NO_BROWSER = '1';

const { cmdPreview, cmdBlocks, cmdGet, cmdReplace, cmdCreate, cmdSeo, cmdPageCategories } = await import(
  '../lib/pagesCmd'
);
const { blockFiles } = await import('../lib/contentBlocks');
const { localImageRefs } = await import('../lib/htmlImages');
const { localMarkdownImageRefs } = await import('../lib/markdownImages');

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

describe('block files', () => {
  it('finds local image refs, not web ones', () => {
    const html =
      '<img src="images/a.png"><img src="https://x.com/b.png"><img src="//cdn/c.png"><img src="/wp-content/d.png">' +
      '<div style="background-image:url(\'images/e.jpg\')"></div><img src="data:image/png;base64,xx"><img src="images/a.png">';
    expect(localImageRefs(html)).toEqual(['images/a.png', 'images/e.jpg']);
  });

  it('finds local image refs in Markdown, not web ones', () => {
    const md =
      '![a](images/a.png) ![b](https://x.com/b.png) ![c](//cdn/c.png) ![d](/wp-content/d.png) ![e](images/a.png)';
    expect(localMarkdownImageRefs(md)).toEqual(['images/a.png']);
  });

  it('a folder gives its block files in name order, whatever they are written in', async () => {
    const dir = await workdir();
    await mkdir(join(dir, 'pages/home'), { recursive: true });
    for (const n of ['02-body.md', '01-hero.html', '03-faq.json', '10-cta.html', 'block-1.orig.md', 'notes.txt'])
      await writeFile(join(dir, 'pages/home', n), 'x');
    const files = await blockFiles(dir, ['pages/home']);
    expect(files.map(f => f.split('/').pop())).toEqual(['01-hero.html', '02-body.md', '03-faq.json', '10-cta.html']);
  });

  it('a file that is not a block file is refused', async () => {
    const dir = await workdir();
    await writeFile(join(dir, 'notes.txt'), 'x');
    await expect(blockFiles(dir, ['notes.txt'])).rejects.toMatchObject({ code: 'format' });
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
      [
        {
          type: 'static',
          html: '<section><img src="http://site.test/uploads/hero.png" alt="Hero"></section>',
        },
        { type: 'static', html: '<section><p>b</p></section>' },
      ],
      'Home',
      undefined,
    );

    await cmdPreview(ctx(dir, ['pages/home']));
    expect(uploadMedia).toHaveBeenCalledTimes(1); // second run reuses the upload
  });

  it('names block errors by file', async () => {
    fake.current = {
      siteUrl: SITE,
      mediaLookup: async () => ({ found: true, mediaId: 7, url: `${SITE}/uploads/hero.png` }),
      createPost: async () => {
        throw new AgentHttpError(400, {
          code: 'invalid_blocks',
          message: "Some blocks can't be used; see errors.",
          data: {
            status: 400,
            errors: [{ path: 'blocks[1].html', code: 'width_missing', message: 'Wrap…', fix: 'ai' }],
          },
        });
      },
    } as unknown as AgentClient;
    const out = await cmdCreate(ctx(dir, ['pages/home'], { type: 'page', title: 'Home', ...SEO }));
    expect(out).toMatchObject({
      ok: false,
      code: 'invalid_blocks',
      fix: 'ai',
      errors: [{ file: 'pages/home/02-body.html', path: 'blocks[1].html', code: 'width_missing' }],
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

/** The post shape the abilities return, for the get / replace tests. */
const post = (status: string, baseModified: string) => ({
  id: 5,
  type: 'page',
  title: 'About',
  status,
  baseModified,
  link: `${SITE}/?page_id=5`,
  editUrl: `${SITE}/wp-admin/post.php?post=5&action=edit`,
});

describe('body text in .md files', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await workdir();
    await mkdir(join(dir, 'pages/post/images'), { recursive: true });
    await writeFile(join(dir, 'pages/post/images/gear.png'), PNG);
  });

  it('a .md file is body text, a .html file a section, a .json file a component', async () => {
    await writeFile(join(dir, 'pages/post/01-intro.md'), '## What is a gear motor\n\nA motor with a gearbox.');
    await writeFile(join(dir, 'pages/post/02-compare.html'), '<section><p>table</p></section>');
    await writeFile(
      join(dir, 'pages/post/03-faq.json'),
      JSON.stringify({ component: 'faq', data: { items: [{ q: 'Why?' }] } }),
    );
    const previewBlocks = vi.fn(async () => ({ previewUrl: 'p', expiresIn: 3600 }));
    fake.current = { siteUrl: SITE, previewBlocks } as unknown as AgentClient;

    await cmdPreview(ctx(dir, ['pages/post']));
    expect(previewBlocks).toHaveBeenCalledWith(
      [
        { type: 'prose', markdown: '## What is a gear motor\n\nA motor with a gearbox.' },
        { type: 'static', html: '<section><p>table</p></section>' },
        { type: 'config', component: 'faq', data: { items: [{ q: 'Why?' }] } },
      ],
      undefined,
      undefined,
    );
  });

  it('uploads a local image the Markdown uses and points it at the site', async () => {
    await writeFile(join(dir, 'pages/post/01-intro.md'), 'A photo:\n\n![A gear motor](images/gear.png)');
    const previewBlocks = vi.fn(async () => ({ previewUrl: 'p', expiresIn: 3600 }));
    fake.current = {
      siteUrl: SITE,
      mediaLookup: async () => ({ found: false }),
      uploadMedia: async () => ({ id: 7, url: `${SITE}/uploads/gear.png` }),
      previewBlocks,
    } as unknown as AgentClient;

    const out = await cmdPreview(ctx(dir, ['pages/post']));
    expect(out).toMatchObject({ ok: true, uploaded: ['pages/post/images/gear.png'] });
    expect(previewBlocks).toHaveBeenCalledWith(
      [{ type: 'prose', markdown: 'A photo:\n\n![A gear motor](http://site.test/uploads/gear.png)' }],
      undefined,
      undefined,
    );
  });

  it('an image the Markdown names but is not there names the file', async () => {
    await writeFile(join(dir, 'pages/post/01-intro.md'), '![Missing](images/nope.png)');
    fake.current = { siteUrl: SITE } as unknown as AgentClient;
    expect(await cmdPreview(ctx(dir, ['pages/post']))).toMatchObject({ ok: false, code: 'image_not_found' });
  });

  it('create sends the blocks in file order', async () => {
    await writeFile(join(dir, 'pages/post/01-intro.md'), 'First line.');
    await writeFile(join(dir, 'pages/post/02-cta.html'), '<section><p>cta</p></section>');
    const createPost = vi.fn(async () => ({
      id: 9,
      type: 'post',
      status: 'draft',
      baseModified: 'T1',
      title: 'P',
      link: 'l',
      editUrl: 'e',
      blocks: 2,
      seo: {},
    }));
    fake.current = { siteUrl: SITE, createPost } as unknown as AgentClient;
    const out = await cmdCreate(ctx(dir, ['pages/post'], { type: 'post', title: 'Gear motors', ...SEO }));
    expect(out).toMatchObject({ ok: true, id: 9, blocks: 2 });
    expect(createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        blocks: [
          { type: 'prose', markdown: 'First line.' },
          { type: 'static', html: '<section><p>cta</p></section>' },
        ],
      }),
    );
  });

  it('get saves body text as .md, replace sends it back as Markdown', async () => {
    const replaceBlock = vi.fn(async () => post('draft', 'T2'));
    fake.current = {
      siteUrl: SITE,
      getBlocks: vi.fn(async (_id: number, path?: string) =>
        path
          ? {
              ...post('draft', 'T1'),
              block: { path: '2', name: 'body text', kind: 'prose', markdown: '## Old\n\nText.' },
            }
          : post('draft', 'T1'),
      ),
      replaceBlock,
    } as unknown as AgentClient;

    const got = await cmdGet(ctx(dir, ['5', '2']));
    expect(got).toMatchObject({ ok: true, file: 'pages/5/block-2.md', original: 'pages/5/block-2.orig.md' });
    // The file ends with a newline, the block's content does not.
    expect(await readFile(join(dir, 'pages/5/block-2.md'), 'utf8')).toBe('## Old\n\nText.\n');
    expect(await readFile(join(dir, 'pages/5/block-2.orig.md'), 'utf8')).toBe('## Old\n\nText.\n');

    await writeFile(join(dir, 'pages/5/block-2.md'), '## New\n\nText.\n\nOne more line.\n');
    expect(await cmdReplace(ctx(dir, ['5', '2', 'pages/5/block-2.md']))).toMatchObject({ ok: true, path: '2' });
    expect(replaceBlock).toHaveBeenCalledWith({
      id: 5,
      path: '2',
      block: { type: 'prose', markdown: '## New\n\nText.\n\nOne more line.' },
      baseModified: 'T1',
    });
  });

  it('edited body text is warned only about marketing words the edit added', async () => {
    fake.current = {
      siteUrl: SITE,
      getBlocks: async () => ({
        ...post('draft', 'T1'),
        block: { path: '1', name: 'body text', kind: 'prose', markdown: 'ISO 9001 certification.' },
      }),
      previewBlocks: async () => ({ previewUrl: 'p', expiresIn: 3600 }),
    } as unknown as AgentClient;
    await cmdGet(ctx(dir, ['5', '1']));
    await writeFile(join(dir, 'pages/5/block-1.md'), 'ISO 9001 certification. Premium valves.');
    const out = await cmdPreview(ctx(dir, ['pages/5/block-1.md']));
    expect(JSON.stringify(out.warnings)).toContain('premium');
    expect(JSON.stringify(out.warnings)).not.toContain('certification');
  });

  it('get without a path saves body text next to the sections', async () => {
    fake.current = {
      siteUrl: SITE,
      getBlocks: vi.fn(async (_id: number, path?: string) => {
        if (!path)
          return {
            ...post('draft', 'T1'),
            blocks: [
              { path: '1', name: 'puffergo/tailwind-container', kind: 'static' },
              { path: '2', name: 'body text', kind: 'prose' },
              { path: '3', name: 'core/embed', kind: 'native', text: 'A video' },
            ],
          };
        return {
          ...post('draft', 'T1'),
          block:
            path === '1'
              ? { path, name: 'puffergo/tailwind-container', kind: 'static', html: '<section>hero</section>' }
              : { path, name: 'body text', kind: 'prose', markdown: 'Body.' },
        };
      }),
    } as unknown as AgentClient;
    const got = await cmdGet(ctx(dir, ['5']));
    expect(got).toMatchObject({
      ok: true,
      saved: [
        { path: '1', file: 'pages/5/block-1.html' },
        { path: '2', file: 'pages/5/block-2.md' },
      ],
      notSaved: [{ path: '3', kind: 'native', text: 'A video' }],
    });
    expect(await readFile(join(dir, 'pages/5/block-2.md'), 'utf8')).toBe('Body.\n');
  });
});

describe('pages get / replace', () => {
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
    expect(await readFile(join(dir, 'pages/5/block-2.html'), 'utf8')).toBe('<p>old</p>\n');
    expect(await readFile(join(dir, 'pages/5/block-2.orig.html'), 'utf8')).toBe('<p>old</p>\n');

    await writeFile(join(dir, 'pages/5/block-2.html'), '<p>new</p>');
    expect(await cmdReplace(ctx(dir, ['5', '2', 'pages/5/block-2.html']))).toMatchObject({ ok: true, path: '2' });
    expect(replaceBlock).toHaveBeenCalledWith({
      id: 5,
      path: '2',
      block: { type: 'static', html: '<p>new</p>' },
      baseModified: 'T1',
    });

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
    expect(await cmdGet(ctx(dir, ['5', '3']))).toMatchObject({ ok: false, code: 'not_editable', fix: 'user' });
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
                  kind: 'native',
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
    expect(await readFile(join(dir, 'pages/5/block-2.1.orig.html'), 'utf8')).toBe('<p>b</p>\n');

    const out = await cmdPreview(ctx(dir, ['5', '2.1', 'pages/5/block-2.1.html']));
    expect(out).toMatchObject({ ok: true, previewUrl: 'http://s.test/about/?puffergo_ai_preview=2.1' });
    expect(previewBlocks).toHaveBeenCalledWith([{ type: 'static', html: '<p>b</p>' }], undefined, {
      id: 5,
      path: '2.1',
    });
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

// ---------------------------------------------------------------------------
// categories — the tree, and filing a post under it
// ---------------------------------------------------------------------------

/** `list-post-types`: a post is filed under one taxonomy, a page under none. */
const POST_TYPES = {
  items: [
    {
      type: 'post',
      taxonomy: {
        slug: 'category',
        label: '分类',
        restBase: 'categories',
        categories: [{ name: 'Valves', slug: 'valves', parent: '' }],
      },
    },
    { type: 'page', taxonomy: null },
  ],
};

describe('pages categories', () => {
  let dir = '';
  beforeEach(async () => {
    dir = await workdir();
  });

  const tree = { categories: [{ name: 'Valves', slug: 'valves', children: [{ name: 'Gate', slug: 'gate' }] }] };

  it('pushes the tree through the type’s own route, parents before children', async () => {
    await writeFile(join(dir, 'post-categories.json'), JSON.stringify(tree));
    const saveCategoryTerm = vi.fn(async () => ({ id: 42 }));
    fake.current = {
      siteUrl: SITE,
      postTypes: async () => POST_TYPES,
      listCategoryTerms: async () => [{ id: 7, name: 'Valves', slug: 'valves', description: '', parent: 0 }],
      saveCategoryTerm,
    } as unknown as AgentClient;
    const out = await cmdPageCategories(ctx(dir, ['post', 'push']));
    expect(out).toMatchObject({ ok: true, taxonomy: 'category', changes: [{ op: 'create', slug: 'gate' }] });
    // Only the missing one is written, and it is written under the id the site already had for its parent.
    expect(saveCategoryTerm).toHaveBeenCalledTimes(1);
    expect(saveCategoryTerm).toHaveBeenCalledWith(
      'categories',
      null,
      expect.objectContaining({ slug: 'gate', parent: 7 }),
    );
  });

  it('check writes nothing', async () => {
    await writeFile(join(dir, 'post-categories.json'), JSON.stringify(tree));
    const saveCategoryTerm = vi.fn();
    fake.current = {
      siteUrl: SITE,
      postTypes: async () => POST_TYPES,
      listCategoryTerms: async () => [],
      saveCategoryTerm,
    } as unknown as AgentClient;
    expect(await cmdPageCategories(ctx(dir, ['post', 'check']))).toMatchObject({
      ok: true,
      changes: [
        { op: 'create', slug: 'valves' },
        { op: 'create', slug: 'gate' },
      ],
    });
    expect(saveCategoryTerm).not.toHaveBeenCalled();
  });

  it('refuses an order: nothing sorts these by it', async () => {
    await writeFile(
      join(dir, 'post-categories.json'),
      JSON.stringify({ categories: [{ name: 'Valves', slug: 'valves', order: 1 }] }),
    );
    fake.current = {
      siteUrl: SITE,
      postTypes: async () => POST_TYPES,
      listCategoryTerms: async () => [],
    } as unknown as AgentClient;
    const out = (await cmdPageCategories(ctx(dir, ['post', 'push']))) as unknown as { code: string; errors: string[] };
    expect(out.code).toBe('invalid');
    expect(out.errors[0]).toContain('order is only for product categories');
  });

  it('a type filed nowhere has no tree to write', async () => {
    fake.current = { siteUrl: SITE, postTypes: async () => POST_TYPES } as unknown as AgentClient;
    expect(await cmdPageCategories(ctx(dir, ['page', 'push']))).toMatchObject({ ok: false, code: 'no_categories' });
  });

  it('create and seo file the post under the slugs of --category', async () => {
    await mkdir(join(dir, 'pages/post'), { recursive: true });
    await writeFile(join(dir, 'pages/post/01-intro.md'), 'First line.');
    const created = {
      id: 9,
      type: 'post',
      status: 'draft',
      baseModified: 'T1',
      title: 'P',
      link: 'l',
      editUrl: 'e',
      blocks: 1,
      seo: {},
      categories: ['gate'],
    };
    const createPost = vi.fn(async () => created);
    const updateSeo = vi.fn(async () => ({ ...created, categories: ['valves'] }));
    fake.current = {
      siteUrl: SITE,
      createPost,
      updateSeo,
      getBlocks: async () => ({ ...created, seo: { slug: 'p' } }),
    } as unknown as AgentClient;
    const made = await cmdCreate(
      ctx(dir, ['pages/post'], { type: 'post', title: 'Gear motors', category: 'gate, valves', ...SEO }),
    );
    expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ categories: ['gate', 'valves'] }));
    // Read back, so the AI can tell the customer where it actually landed.
    expect(made).toMatchObject({ categories: ['gate'] });
    // A category on its own is change enough for `seo`, which otherwise just reads the post back.
    expect(await cmdSeo(ctx(dir, ['9'], {}))).toMatchObject({ categories: ['gate'] });
    expect(await cmdSeo(ctx(dir, ['9'], { category: 'valves' }))).toMatchObject({ categories: ['valves'] });
    expect(updateSeo).toHaveBeenCalledWith(expect.objectContaining({ categories: ['valves'] }));
  });
});
