/**
 * The files a page's blocks are written in, and the blocks they become. One suffix, one kind of block:
 *
 *   .md    body text     → { type: 'prose',  markdown }   core WordPress blocks, edited natively in the editor
 *   .html  a section     → { type: 'static', html }       a PufferGo Tailwind block
 *   .json  a component   → { type: 'config', component, data }
 *
 * So `01-intro.md`, `02-comparison.html`, `03-faq.json` in one folder is a post whose body the customer edits
 * with the paragraph toolbar, with PufferGo blocks between its paragraphs. Nothing here parses Markdown: the
 * plugin owns that (one subset, one place). This side only reads the files and uploads the images they use.
 */

import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import type { AgentClient } from './agentClient';
import { claimWarning } from './claims';
import { MissingImageError, uploadHtmlImages } from './htmlImages';
import { uploadMarkdownImages } from './markdownImages';
import { readUploadsCache, writeUploadsCache } from './productFiles';
import type { ContentBlock } from './productTypes';
import { CodedError, UsageError, type CmdCtx, type Out } from './siteCmd';

/** A block file the command can't use; the code tells the AI what to fix. */
export class FileError extends CodedError {}

/** The suffixes a block can be written in, in the order a folder lists them. */
const SUFFIXES = ['.md', '.html', '.json'] as const;

export type BlockSuffix = (typeof SUFFIXES)[number];

export function suffixOf(file: string): BlockSuffix | undefined {
  return SUFFIXES.find(s => file.toLowerCase().endsWith(s));
}

/** `get` keeps an untouched copy next to each file; it is never sent back as a block of its own. */
const isOriginal = (name: string) => /\.orig\.(md|html|json)$/i.test(name);

/**
 * Files and folders → block files in order. A folder contributes its .md / .html / .json files sorted by name
 * (01-intro.md, 02-comparison.html…), so the file names are the order of the page.
 */
export async function blockFiles(dir: string, args: string[]): Promise<string[]> {
  if (!args.length)
    throw new UsageError(
      'Give the block files (.md body text, .html sections, .json components), or a folder of them.',
    );
  const out: string[] = [];
  for (const a of args) {
    const p = resolve(dir, a);
    if (!existsSync(p)) throw new FileError('file_not_found', `Not found: ${a}`);
    if ((await stat(p)).isDirectory()) {
      const names = (await readdir(p)).filter(n => suffixOf(n) && !isOriginal(n)).sort();
      if (!names.length) throw new FileError('file_not_found', `No .md, .html or .json block files in ${a}`);
      out.push(...names.map(n => join(p, n)));
    } else {
      if (!suffixOf(p))
        throw new FileError(
          'format',
          `${a} is not a block file: body text is .md, a section .html, a component .json.`,
        );
      out.push(p);
    }
  }
  return out;
}

/**
 * The blocks these files hold, with the local images they use uploaded and pointed at the site.
 *
 * @param componentData Reads a `.json` component file (its own images resolved), kept out of here so this
 *                      module doesn't depend on the config schema machinery.
 */
export async function blocksFromFiles(
  c: AgentClient,
  ctx: CmdCtx,
  files: string[],
  componentData: (file: string) => Promise<{ component?: string; data: unknown; uploaded: string[] }>,
): Promise<{ blocks: ContentBlock[]; uploaded: string[] }> {
  const cache = await readUploadsCache(ctx.dir, c.siteUrl);
  const uploaded: string[] = [];
  const blocks: ContentBlock[] = [];
  try {
    for (const file of files) {
      const name = relative(ctx.dir, file);
      const suffix = suffixOf(file);
      if (suffix === '.json') {
        const cf = await componentData(file);
        uploaded.push(...cf.uploaded);
        blocks.push({
          type: 'config',
          component: String(cf.component ?? ''),
          data: (cf.data ?? {}) as Record<string, unknown>,
        });
        continue;
      }
      // A file ends with a newline; the block's content does not, so a round trip gives the same bytes back.
      const text = (await readFile(file, 'utf8')).replace(/\n+$/, '');
      try {
        if (suffix === '.md') {
          const up = await uploadMarkdownImages(c, cache, text, dirname(file));
          uploaded.push(...up.uploaded.map(abs => relative(ctx.dir, abs)));
          blocks.push({ type: 'prose', markdown: up.markdown });
        } else {
          const up = await uploadHtmlImages(c, cache, text, dirname(file));
          uploaded.push(...up.uploaded.map(abs => relative(ctx.dir, abs)));
          blocks.push({ type: 'static', html: up.html });
        }
      } catch (e) {
        if (!(e instanceof MissingImageError)) throw e;
        throw new FileError(
          'image_not_found',
          `${name} uses the image "${e.ref}", which isn't there. Paths are relative to the ${suffix} file.`,
        );
      }
    }
  } finally {
    await writeUploadsCache(ctx.dir, c.siteUrl, cache);
  }
  return { blocks, uploaded };
}

/** The words a visitor reads in one block, whatever it is written in: what the claim check looks at. */
export function blockText(block: ContentBlock): string {
  if (block.type === 'prose') return block.markdown;
  if (block.type === 'static') return block.html.replace(/<[^>]*>/g, ' ');
  return '';
}

/**
 * Marketing words the customer likely never said, per file. A block taken with `get` is compared with its
 * `.orig.*` copy, so only words the edit added are flagged.
 */
export async function blockWarnings(dir: string, files: string[], blocks: ContentBlock[]): Promise<unknown[]> {
  const out: unknown[] = [];
  for (const [i, block] of blocks.entries()) {
    const file = files[i];
    if (!file) continue;
    const suffix = suffixOf(file);
    if (suffix === '.json') continue; // Its own claims are checked where its data is read.
    const orig = file.replace(new RegExp(`\\${suffix}$`, 'i'), `.orig${suffix}`);
    // Markdown is already the words; HTML's tags are not words a visitor reads.
    const words = (t: string) => (suffix === '.md' ? t : t.replace(/<[^>]*>/g, ' '));
    const before = existsSync(orig) ? words(await readFile(orig, 'utf8')) : '';
    const w = claimWarning(relative(dir, file), blockText(block), before);
    if (w) out.push(w);
  }
  return out;
}

/**
 * Names block errors by their file: the plugin reports them at `blocks[i].markdown`, and the AI edits files.
 */
export function withFileNames(out: Out, files: string[], dir: string): Out {
  if (!Array.isArray(out.errors)) return out;
  return {
    ...out,
    errors: out.errors.map(e => {
      const at = typeof (e as { path?: string }).path === 'string' ? (e as { path: string }).path : '';
      const i = /^blocks\[(\d+)\]/.exec(at);
      const file = i ? files[Number(i[1])] : undefined;
      return file ? { file: relative(dir, file), ...(e as object) } : e;
    }),
  };
}
