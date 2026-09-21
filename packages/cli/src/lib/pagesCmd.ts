/**
 * `puffergo pages …` — write a post's blocks (body text as Markdown, Tailwind sections as HTML, components as
 * data) into pages, posts and other content, through the plugin's generic content abilities (list-post-types /
 * find-posts / get-blocks / preview-blocks / create-post / replace-block / update-seo). The plugin turns Markdown
 * into core WordPress blocks and compiles each section; this side reads the block files (see contentBlocks.ts),
 * uploads the local images they reference, and keeps each post's baseModified so a replace never overwrites an
 * edit made in wp-admin in the meantime.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { AgentHttpError, type AgentClient, type SeoInput } from './agentClient';
import { claimWarning } from './claims';
import { configImages, configTexts, isLocalImage, type ConfigSchema } from './configData';
import { openBrowser } from './loginCmd';
import {
  client,
  runWith,
  abilityError,
  errorOutput,
  conflictOutput,
  publishRefusal,
  isLive,
  liveLockedMessage,
  customerSaid,
  UsageError,
  type CmdCtx,
  type Out,
} from './siteCmd';
import { readUploadsCache, writeUploadsCache } from './productFiles';
import { siteState } from './workdirState';
import { editLiveAllowed } from './site';
import { resolveUpload } from './uploadImage';
import { blockFiles, blockWarnings, blocksFromFiles, withFileNames, FileError } from './contentBlocks';
import { readCategoriesFile, syncCategories, categoriesFileFor } from './categories';
import type { ContentBlock } from './productTypes';

interface PostSummary {
  id: number;
  type: string;
  title: string;
  status: string;
  baseModified: string;
  link: string;
  editUrl: string;
  /** The category slugs it is filed under; null for a type filed nowhere (a page). */
  categories: string[] | null;
}

interface BlockInfo {
  path: string;
  name: string;
  kind: 'prose' | 'static' | 'config' | 'native';
  scopeId?: string;
  text?: string;
  innerBlocks?: BlockInfo[];
}

/** Editable here: body text as Markdown, a static block as HTML, a config component as its data. */
const editable = (b: BlockInfo) => b.kind === 'prose' || b.kind === 'static' || b.kind === 'config';

/** The file `get` saves a block in, and `replace` reads it back from: one suffix per kind. */
const SUFFIX_OF_KIND = { prose: '.md', static: '.html', config: '.json' } as const;

/** What `get` saves for a config component: `schema` says what each field is; only `data` is sent back. */
interface ComponentFile {
  component?: string;
  /** How to fill this component, written with it. */
  guide?: string;
  schema?: ConfigSchema;
  data: Record<string, unknown>;
}

/** A config component's new data from its file: local images (paths relative to the workdir) uploaded and
 *  replaced by their URL, and the claims the edit added. Works the same for every component. */
async function componentInput(
  c: AgentClient,
  ctx: CmdCtx,
  file: string,
): Promise<{ data: unknown; uploaded: string[]; warnings: unknown[] }> {
  const name = relative(ctx.dir, file);
  const read = async (f: string): Promise<ComponentFile | null> =>
    existsSync(f) ? (JSON.parse(await readFile(f, 'utf8')) as ComponentFile) : null;
  let cf: ComponentFile | null;
  try {
    cf = await read(file);
  } catch {
    throw new FileError('format', `${name} is not valid JSON.`);
  }
  if (!cf || !cf.data || typeof cf.data !== 'object' || Array.isArray(cf.data))
    throw new FileError(
      'format',
      `${name} must keep the shape \`get\` saved: {"component", "guide", "schema", "data": {…}}.`,
    );
  const cache = await readUploadsCache(ctx.dir, c.siteUrl);
  const uploaded: string[] = [];
  try {
    for (const { value, set } of configImages(cf.data, cf.schema)) {
      if (!isLocalImage(value)) continue;
      // Next to the .json file (as in a .html section), else from the workdir (as in a product file).
      const abs = [resolve(dirname(file), value), resolve(ctx.dir, value)].find(p => existsSync(p));
      if (!abs)
        throw new FileError(
          'image_not_found',
          `${name} uses the image "${value}", which isn't there. Paths are relative to the .json file or the workdir.`,
        );
      const up = await resolveUpload(c, cache, abs);
      if (!up.reused) uploaded.push(value);
      set(up.url);
    }
  } finally {
    await writeUploadsCache(ctx.dir, c.siteUrl, cache);
  }
  const orig = await read(file.replace(/\.json$/i, '.orig.json')).catch(() => null);
  const was = new Map(configTexts(orig?.data, cf.schema).map(t => [t.path, t.value]));
  const warnings = configTexts(cf.data, cf.schema)
    .map(t => claimWarning(`${name}:${t.path}`, t.value, was.get(t.path) ?? ''))
    .filter(Boolean);
  return { data: cf.data, uploaded, warnings };
}

/** Every command runs through the shared error mapping, with this module's own `client`. */
const run = (ctx: CmdCtx, body: Parameters<typeof runWith>[2]): Promise<Out> => runWith(client, ctx, body);

// ---------------------------------------------------------------------------
// What the commands remember per site: each post's baseModified (between `get`/`blocks` and `replace`),
// and which set of section files already became which post (so `create` twice doesn't make a duplicate).
// ---------------------------------------------------------------------------

const bases = siteState<Record<string, string>>('post-bases.json');
const created = siteState<Record<string, number>>('created.json');

async function baseOf(dir: string, siteUrl: string, id: number): Promise<string | undefined> {
  return (await bases.read(dir, siteUrl))[id];
}

async function rememberBase(dir: string, siteUrl: string, post: { id: number; baseModified: string }): Promise<void> {
  await bases.remember(dir, siteUrl, post.id, post.baseModified);
}

// ---------------------------------------------------------------------------
// Block files → blocks (contentBlocks.ts), with this module's component reader
// ---------------------------------------------------------------------------

/** The blocks of these files, a `.json` one read through componentInput (schema, images, claims). */
async function blocksOf(
  c: AgentClient,
  ctx: CmdCtx,
  files: string[],
): Promise<{ blocks: ContentBlock[]; uploaded: string[]; warnings: unknown[] }> {
  const componentWarnings: unknown[] = [];
  const { blocks, uploaded } = await blocksFromFiles(c, ctx, files, async file => {
    const { data, uploaded: up, warnings } = await componentInput(c, ctx, file);
    componentWarnings.push(...warnings);
    const component = JSON.parse(await readFile(file, 'utf8')).component as string | undefined;
    return { component, data, uploaded: up };
  });
  return { blocks, uploaded, warnings: [...(await blockWarnings(ctx.dir, files, blocks)), ...componentWarnings] };
}

// ---------------------------------------------------------------------------
// Targets: an id or any link to the post
// ---------------------------------------------------------------------------

async function resolvePostId(c: AgentClient, target: string | undefined): Promise<number> {
  if (!target) throw new UsageError('Give the page/post id or a link to it.');
  if (/^\d+$/.test(target)) return Number(target);
  if (!/^https?:\/\//i.test(target)) throw new UsageError(`Not an id or a link: ${target}`);
  const host = (u: string) => new URL(u).host.replace(/^www\./, '').toLowerCase();
  if (host(target) !== host(c.siteUrl)) {
    throw new FileError('other_site', `This link is on ${new URL(target).host}, not the connected site ${c.siteUrl}.`);
  }
  const found = await c.findPosts<{ items: PostSummary[] }>({ url: target });
  if (!found.items[0]) throw new FileError('not_found', `No page or post found at ${target}`);
  return found.items[0].id;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export function cmdTypes(ctx: CmdCtx): Promise<Out> {
  return run(ctx, async c => ({ ok: true, ...(await c.postTypes<Record<string, unknown>>()) }));
}

export function cmdFind(ctx: CmdCtx): Promise<Out> {
  return run(ctx, async c => ({
    ok: true,
    ...(await c.findPosts<Record<string, unknown>>({
      type: ctx.flags.get('type'),
      status: ctx.flags.get('status'),
      search: ctx.flags.get('search'),
      url: ctx.flags.get('url'),
      page: Number(ctx.flags.get('page')) || undefined,
    })),
  }));
}

export function cmdBlocks(ctx: CmdCtx): Promise<Out> {
  return run(ctx, async c => {
    const id = await resolvePostId(c, ctx.positional[0]);
    const post = await c.getBlocks<PostSummary & NonBlock & { blocks: BlockInfo[] }>(id);
    await rememberBase(ctx.dir, c.siteUrl, post);
    return notBlockContent(post) ?? { ok: true, ...post };
  });
}

/** Set by the site when the post was made with the classic editor or a page builder. */
interface NonBlock {
  editor?: string;
  editorNote?: string;
}

/** Such a post's content is edited in its own editor, not here; its SEO still can be (`pages seo`). */
function notBlockContent(post: PostSummary & NonBlock): Out | undefined {
  if (!post.editor) return undefined;
  return {
    ok: false,
    code: 'not_block_content',
    fix: 'user',
    editor: post.editor,
    message:
      post.editorNote ?? `This ${post.type} was made with the ${post.editor}; its content can't be changed here.`,
    editUrl: post.editUrl,
  };
}

const BLOCK_PATH = /^[1-9]\d*(\.[1-9]\d*)*$/;

function flatten(blocks: BlockInfo[]): BlockInfo[] {
  return blocks.flatMap(b => [b, ...flatten(b.innerBlocks ?? [])]);
}

/**
 * Saves a block to `pages/<id>/block-<path>.<suffix>` for the AI to edit (plus an untouched `.orig.<suffix>`),
 * then `replace` sends it back: body text as `.md`, a section as `.html`, a component as `.json`. Without a
 * path, every editable block of the page is saved, so the AI can match the rest.
 */
export function cmdGet(ctx: CmdCtx): Promise<Out> {
  return run(ctx, async c => {
    const id = await resolvePostId(c, ctx.positional[0]);
    const want = ctx.positional[1];
    if (want && !BLOCK_PATH.test(want)) throw new UsageError('usage: puffergo pages get <id|link> [block path]');
    let all: BlockInfo[] = [];
    if (!want) {
      const post = await c.getBlocks<PostSummary & NonBlock & { blocks: BlockInfo[] }>(id);
      const other = notBlockContent(post);
      if (other) return other;
      all = flatten(post.blocks);
    }
    const paths = want ? [want] : all.filter(editable).map(b => b.path);

    const saved: { path: string; file: string; text?: string }[] = [];
    let base: PostSummary | undefined;
    for (const path of paths) {
      const res = await c.getBlocks<
        PostSummary & {
          block: BlockInfo & {
            html?: string;
            markdown?: string;
            component?: string;
            guide?: string;
            schema?: unknown;
            data?: unknown;
          };
        }
      >(id, path);
      base = res;
      const { block } = res;
      // What goes in the file, by kind: the body's Markdown, the section's HTML, or the component's data
      // together with how to fill it and the schema saying what each field is.
      const content =
        block.kind === 'prose'
          ? (block.markdown ?? '')
          : block.kind === 'static'
            ? (block.html ?? '')
            : block.data
              ? JSON.stringify(
                  { component: block.component, guide: block.guide, schema: block.schema, data: block.data },
                  null,
                  2,
                ) + '\n'
              : null;
      if (content === null) {
        if (!want) continue; // Reading the whole page: listed in notSaved.
        await rememberBase(ctx.dir, c.siteUrl, res);
        return {
          ok: false,
          code: 'not_editable',
          fix: 'user',
          message:
            block.kind === 'config'
              ? 'This component has no data to edit here; the customer edits it in the WordPress editor.'
              : 'Only body text, PufferGo Tailwind blocks and components can be edited here.',
          block: { path: block.path, name: block.name, text: block.text },
        };
      }
      const suffix = SUFFIX_OF_KIND[block.kind as keyof typeof SUFFIX_OF_KIND];
      const file = join('pages', String(id), `block-${path}${suffix}`);
      await mkdir(join(ctx.dir, 'pages', String(id)), { recursive: true });
      // Ends with a newline, as an editor would leave it; the trailing one is dropped again when it is sent.
      const text = content.endsWith('\n') ? content : content + '\n';
      await writeFile(join(ctx.dir, file), text, 'utf8');
      // The block as it was on the site, to put back with `replace` if the customer changes their mind.
      await writeFile(join(ctx.dir, 'pages', String(id), `block-${path}.orig${suffix}`), text, 'utf8');
      saved.push({ path, file, text: block.text });
    }
    if (!base)
      return {
        ok: false,
        code: 'no_editable_blocks',
        fix: 'user',
        message: 'This page has no body text, PufferGo Tailwind blocks or components to edit here.',
      };
    await rememberBase(ctx.dir, c.siteUrl, base);
    const head = { ok: true, id, title: base.title, status: base.status };
    if (want) {
      return {
        ...head,
        path: want,
        file: saved[0].file,
        original: saved[0].file.replace(/\.(md|html|json)$/, '.orig.$1'),
        text: saved[0].text,
      };
    }
    // Blocks not saved (components, WordPress blocks): their text still tells the AI what sits around its edit.
    const savedPaths = new Set(saved.map(s => s.path));
    const notSaved = all
      .filter(b => !savedPaths.has(b.path) && !b.innerBlocks)
      .map(b => ({ path: b.path, kind: b.kind, name: b.name, text: b.text }));
    return { ...head, saved, notSaved };
  });
}

const IN_PAGE_NOTE =
  'Opened in the browser: the whole page, with this block changed; the live page is unchanged. The customer must be logged in to wp-admin to see it; the link works for 7 days, until the block is previewed again or replaced.';

/**
 * `preview <files|folder…>`: new blocks on their own page in wp-admin.
 * `preview <id|link> <path> <file>`: the edited block in place on the post's own page, every other block as it is now.
 */
export function cmdPreview(ctx: CmdCtx): Promise<Out> {
  return run(ctx, async c => {
    const [target, path, fileArg, ...rest] = ctx.positional;
    const inPage = !!fileArg && !rest.length && BLOCK_PATH.test(path ?? '');
    const files = await blockFiles(ctx.dir, inPage ? [fileArg] : ctx.positional);
    const at = inPage ? { id: await resolvePostId(c, target), path: path! } : undefined;
    const { blocks, uploaded, warnings } = await blocksOf(c, ctx, files);
    try {
      const res = await c.previewBlocks<{ previewUrl: string; expiresIn: number }>(blocks, ctx.flags.get('title'), at);
      openBrowser(res.previewUrl);
      return {
        ok: true,
        previewUrl: res.previewUrl,
        blocks: files.map(f => relative(ctx.dir, f)),
        uploaded,
        warnings,
        note: at
          ? IN_PAGE_NOTE
          : 'Opened in the browser. The customer must be logged in to wp-admin to see it; the link works for 7 days.',
      };
    } catch (e) {
      if (e instanceof AgentHttpError) return withFileNames(abilityError(e), files, ctx.dir);
      throw e;
    }
  });
}

export function cmdCreate(ctx: CmdCtx): Promise<Out> {
  return run(ctx, async c => {
    const type = ctx.flags.get('type');
    const title = ctx.flags.get('title');
    if (!type || !title) {
      throw new UsageError(
        'usage: puffergo pages create --type <type> --title "<title>" [--excerpt "…"] <files|folder…>',
      );
    }
    const seo = seoFlags(ctx);
    const missing = (['slug', 'seoTitle', 'seoDescription', 'focusKeyword'] as const)
      .filter(k => !seo[k])
      .map(flagName);
    if (missing.length) {
      return {
        ok: false,
        code: 'seo_missing',
        fix: 'ai',
        message: `Give ${missing.join(', ')}: every new page gets its address (slug), the SEO title and description search results and shared links show, and the core keyword it should rank for (long-tail ones with --keywords "a, b"). Ask the customer, or agree them with the customer, then run create again.`,
      };
    }
    const files = await blockFiles(ctx.dir, ctx.positional);
    const key = files.map(f => relative(ctx.dir, f)).join('|');
    const earlier = (await created.read(ctx.dir, c.siteUrl))[key];
    if (earlier && ctx.flags.get('new') !== 'true') {
      return {
        ok: false,
        code: 'already_created',
        fix: 'ai',
        id: earlier,
        message: `These files were already made into post ${earlier}. To change it, edit its blocks (\`pages blocks ${earlier}\`, then get / replace). Only if the customer wants one more separate copy, run create again with --new.`,
      };
    }
    const { blocks, uploaded, warnings } = await blocksOf(c, ctx, files);
    const categories = categoryFlag(ctx);
    const featured = await featuredImage(c, ctx);
    if (featured?.uploaded) uploaded.push(featured.uploaded);
    try {
      const excerpt = ctx.flags.get('excerpt');
      const post = await c.createPost<PostSummary & { blocks: number; seo: unknown }>({
        type,
        title,
        blocks,
        ...(excerpt ? { excerpt } : {}),
        ...(seoInput(seo) as SeoInput),
        ...(featured ? { featuredImage: featured.id } : {}),
        ...(categories ? { categories } : {}),
      });
      await rememberBase(ctx.dir, c.siteUrl, post);
      await created.remember(ctx.dir, c.siteUrl, key, post.id);
      return {
        ok: true,
        id: post.id,
        type: post.type,
        status: post.status,
        blocks: post.blocks,
        previewUrl: post.link,
        editUrl: post.editUrl,
        seo: post.seo,
        categories: post.categories,
        uploaded,
        warnings: [...warnings, ...seoWarnings(seo)],
      };
    } catch (e) {
      if (e instanceof AgentHttpError) return withFileNames(abilityError(e), files, ctx.dir);
      throw e;
    }
  });
}

export function cmdReplace(ctx: CmdCtx): Promise<Out> {
  return run(ctx, async c => {
    const [target, path, fileArg] = ctx.positional;
    if (!target || !path || !fileArg)
      throw new UsageError('usage: puffergo pages replace <id|link> <block path> <file>');
    const id = await resolvePostId(c, target);
    const base = await baseOf(ctx.dir, c.siteUrl, id);
    if (!base) {
      return {
        ok: false,
        code: 'get_first',
        fix: 'ai',
        message: `Read the post first (\`puffergo pages get ${id} ${path}\`), then edit the file it saves.`,
      };
    }
    const post = await c.getBlocks<PostSummary>(id);
    if (isLive(post.status) && !customerSaid(ctx) && !(await editLiveAllowed(ctx.dir, c.siteUrl))) {
      return {
        ok: false,
        code: 'live_locked',
        fix: 'ai',
        message: liveLockedMessage('page', 'pages'),
      };
    }
    const files = await blockFiles(ctx.dir, [fileArg]);
    const { blocks, uploaded, warnings } = await blocksOf(c, ctx, files);
    try {
      const updated = await c.replaceBlock<PostSummary & { revision: boolean }>({
        id,
        path,
        block: blocks[0],
        baseModified: base,
      });
      await rememberBase(ctx.dir, c.siteUrl, updated);
      return {
        ok: true,
        id,
        path,
        status: updated.status,
        previewUrl: updated.link,
        editUrl: updated.editUrl,
        uploaded,
        warnings,
        revision: updated.revision,
        ...(isLive(updated.status) ? { note: 'This changed the live page.' } : {}),
      };
    } catch (e) {
      const conflict = conflictOutput(e, `puffergo pages get ${id} ${path}`);
      if (conflict) return conflict;
      if (e instanceof AgentHttpError) return withFileNames(abilityError(e), files, ctx.dir);
      throw e;
    }
  });
}

// ---------------------------------------------------------------------------
// SEO: slug, SEO title / description, featured image
// ---------------------------------------------------------------------------

type SeoFields = Partial<Record<'slug' | 'seoTitle' | 'seoDescription' | 'focusKeyword' | 'keywords', string>>;

const FLAG: Record<keyof SeoFields, string> = {
  slug: 'slug',
  seoTitle: 'seo-title',
  seoDescription: 'seo-description',
  focusKeyword: 'focus-keyword',
  keywords: 'keywords',
};

/** The flags as the abilities take them: `--keywords "a, b"` becomes a list of long-tail keywords. */
function seoInput(seo: SeoFields): Omit<SeoFields, 'keywords'> & { keywords?: string[] } {
  const { keywords, ...rest } = seo;
  return keywords === undefined
    ? rest
    : {
        ...rest,
        keywords: keywords
          .split(',')
          .map(k => k.trim())
          .filter(Boolean),
      };
}

function flagName(k: keyof SeoFields): string {
  return `--${FLAG[k]}`;
}

function seoFlags(ctx: CmdCtx): SeoFields {
  const out: SeoFields = {};
  for (const k of Object.keys(FLAG) as (keyof SeoFields)[]) {
    const v = ctx.flags.get(FLAG[k]);
    if (v && v !== 'true') out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Categories: the one taxonomy a type is filed under (a page is filed nowhere)
// ---------------------------------------------------------------------------

interface Taxonomy {
  slug: string;
  label: string;
  restBase: string;
  categories: { name: string; slug: string; parent: string }[];
}

/** `--category "a, b"`: the slugs, or undefined when the flag is absent (leaving the post's own filing alone). */
function categoryFlag(ctx: CmdCtx): string[] | undefined {
  const raw = ctx.flags.get('category');
  if (!raw || raw === 'true') return undefined;
  return raw
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);
}

/** The taxonomy a type is filed under, as `list-post-types` gives it; null when it is filed nowhere. */
async function taxonomyOf(c: AgentClient, type: string): Promise<Taxonomy | null> {
  const { items } = await c.postTypes<{ items: { type: string; taxonomy: Taxonomy | null }[] }>();
  const found = items.find(i => i.type === type);
  if (!found) throw new UsageError(`No content type "${type}" on this site. Run \`puffergo pages types\` to see them.`);
  return found.taxonomy;
}

/**
 * `pages categories <type> check | push` — the type's category tree, from `<type>-categories.json`, written the
 * same way and through the same sync as the product one (see categories.ts). Its slugs are what `create` and
 * `seo` file a post under, so this runs first and the customer looks the tree over before anything is filed.
 */
export function cmdPageCategories(ctx: CmdCtx): Promise<Out> {
  return run(ctx, async c => {
    const [type, sub] = ctx.positional;
    if (!type || (sub !== 'check' && sub !== 'push'))
      throw new UsageError('usage: puffergo pages categories <type> <check | push>');
    const tax = await taxonomyOf(c, type);
    if (!tax)
      return {
        ok: false,
        code: 'no_categories',
        fix: 'ai',
        message: `Content of type "${type}" is not filed under categories on this site, so it has no tree to write. Pages are filed nowhere; blog posts, case studies and solutions are.`,
      };
    const file = categoriesFileFor(type);
    const tree = await readCategoriesFile(ctx.dir, file);
    if (tree === null)
      return {
        ok: false,
        code: 'no_file',
        fix: 'ai',
        message: `No ${file} in the work folder. Write the customer's ${tax.label} tree there as { "categories": [ { "name": "…", "slug": "…", "children": [ … ] } ] }, show it to them, then run this again.`,
      };
    try {
      return {
        taxonomy: tax.slug,
        ...(await syncCategories(c, {
          tree,
          restBase: tax.restBase,
          file,
          push: sub === 'push',
          editLive: await editLiveAllowed(ctx.dir, c.siteUrl),
          editLiveHint: 'pages edit-live on --customer-said "…"',
        })),
      };
    } catch (e) {
      if (e instanceof SyntaxError) return { ok: false, code: 'invalid_json', message: `${file}: ${e.message}` };
      throw e;
    }
  });
}

/** Marketing words in the SEO title / description the customer likely never said (compared with the old text, if any). */
function seoWarnings(seo: SeoFields, before: SeoFields = {}): unknown[] {
  return (['seoTitle', 'seoDescription'] as const)
    .map(k => claimWarning(flagName(k), seo[k], before[k] ?? ''))
    .filter(w => w !== null);
}

/** `--featured-image <file>`: uploaded once (reusing earlier uploads), as a media id. */
async function featuredImage(c: AgentClient, ctx: CmdCtx): Promise<{ id: number; uploaded?: string } | null> {
  const arg = ctx.flags.get('featured-image');
  if (!arg) return null;
  const abs = resolve(ctx.dir, arg);
  if (!existsSync(abs)) throw new FileError('image_not_found', `The featured image "${arg}" isn't there.`);
  const cache = await readUploadsCache(ctx.dir, c.siteUrl);
  try {
    const up = await resolveUpload(c, cache, abs);
    return { id: up.mediaId, ...(up.reused ? {} : { uploaded: relative(ctx.dir, abs) }) };
  } finally {
    await writeUploadsCache(ctx.dir, c.siteUrl, cache);
  }
}

interface PostSeo {
  slug: string | null;
  focusKeyword: string | null;
  keywords: string[];
  score: number | null;
  checks: unknown[];
  seoTitle: string | null;
  seoDescription: string | null;
  featuredImage: { id: number; url: string } | null;
  plugin: string | null;
  /** The site's SEO rules (recommended lengths as display widths, keyword counts): advice, passed to the AI as is. */
  limits: Record<string, unknown>;
}

/** `publish <id|link> --customer-said "…"`: make a draft public, only when the customer asked to publish it. */
export function cmdPublish(ctx: CmdCtx): Promise<Out> {
  return run(ctx, async c => {
    const id = await resolvePostId(c, ctx.positional[0]);
    const refused = publishRefusal(ctx, 'page');
    if (refused) return refused;
    const base = await baseOf(ctx.dir, c.siteUrl, id);
    if (!base) {
      return {
        ok: false,
        code: 'get_first',
        fix: 'ai',
        message: `Read it first (\`puffergo pages get ${id}\`) and show the customer what goes live, then publish.`,
      };
    }
    try {
      const post = await c.publishPost<PostSummary>({ id, baseModified: base });
      await rememberBase(ctx.dir, c.siteUrl, post);
      return { ok: true, id, status: post.status, link: post.link, editUrl: post.editUrl };
    } catch (e) {
      return conflictOutput(e, `puffergo pages get ${id}`) ?? errorOutput(e);
    }
  });
}

export function cmdSeo(ctx: CmdCtx): Promise<Out> {
  return run(ctx, async c => {
    const id = await resolvePostId(c, ctx.positional[0]);
    const seo = seoFlags(ctx);
    const categories = categoryFlag(ctx);
    const wantsImage = !!ctx.flags.get('featured-image');
    if (!Object.keys(seo).length && !wantsImage && !categories) {
      const post = await c.getBlocks<PostSummary & { seo: PostSeo }>(id);
      await rememberBase(ctx.dir, c.siteUrl, post);
      return {
        ok: true,
        id,
        title: post.title,
        status: post.status,
        link: post.link,
        seo: post.seo,
        categories: post.categories,
      };
    }

    const base = await baseOf(ctx.dir, c.siteUrl, id);
    if (!base) {
      return {
        ok: false,
        code: 'get_first',
        fix: 'ai',
        message: `Read the post's SEO first (\`puffergo pages seo ${id}\`), then change it.`,
      };
    }
    const post = await c.getBlocks<PostSummary & { seo: PostSeo }>(id);
    if (isLive(post.status) && seo.slug && seo.slug !== post.seo.slug) {
      return {
        ok: false,
        code: 'slug_locked',
        fix: 'user',
        message:
          'This page is published, so its address (slug) is not changed here, even when the customer agrees. If the customer really wants a new address, they change it in wp-admin and add a redirect from the old one. The SEO title, description and featured image can still be changed.',
      };
    }
    if (isLive(post.status) && !customerSaid(ctx) && !(await editLiveAllowed(ctx.dir, c.siteUrl))) {
      return {
        ok: false,
        code: 'live_locked',
        fix: 'ai',
        message: liveLockedMessage('page', 'pages'),
      };
    }
    const featured = await featuredImage(c, ctx);
    try {
      const updated = await c.updateSeo<PostSummary & { seo: PostSeo }>({
        id,
        baseModified: base,
        ...seoInput(seo),
        ...(featured ? { featuredImage: featured.id } : {}),
        ...(categories ? { categories } : {}),
      });
      await rememberBase(ctx.dir, c.siteUrl, updated);
      const before: SeoFields = {
        seoTitle: post.seo.seoTitle ?? undefined,
        seoDescription: post.seo.seoDescription ?? undefined,
      };
      return {
        ok: true,
        id,
        status: updated.status,
        link: updated.link,
        editUrl: updated.editUrl,
        seo: updated.seo,
        categories: updated.categories,
        before: post.seo,
        ...(featured?.uploaded ? { uploaded: [featured.uploaded] } : {}),
        warnings: seoWarnings(seo, before),
      };
    } catch (e) {
      return conflictOutput(e, `puffergo pages seo ${id}`) ?? errorOutput(e);
    }
  });
}
