/** Reading/writing `products/*.json` and `.puffergo/uploads.json` in the working directory. */

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { siteState } from './workdirState';
import { join } from 'node:path';
import type { ProductFile } from './productTypes';

export function productsDir(dir: string): string {
  return join(dir, 'products');
}

export function productFilePath(dir: string, key: string): string {
  return join(productsDir(dir), `${key}.json`);
}

export interface LoadedProduct {
  /** The file's key on disk (from filename), even if the JSON itself doesn't carry `key` yet. */
  fileKey: string;
  path: string;
  product: ProductFile;
  /** Set when the file isn't valid JSON — reported as a `format` error instead of crashing the command. */
  parseError?: string;
}

/** List every `products/*.json`, or just the given keys/`--only` filter. */
export async function loadProducts(dir: string, only?: string[]): Promise<LoadedProduct[]> {
  const dirPath = productsDir(dir);
  if (!existsSync(dirPath)) return [];
  let files: string[];
  if (only && only.length) {
    files = only.map(k => `${k}.json`);
  } else {
    files = (await readdir(dirPath)).filter(f => f.endsWith('.json'));
  }
  const out: LoadedProduct[] = [];
  for (const f of files) {
    const path = join(dirPath, f);
    if (!existsSync(path)) continue;
    const raw = await readFile(path, 'utf8');
    const fileKey = f.replace(/\.json$/, '');
    try {
      out.push({ fileKey, path, product: JSON.parse(raw) as ProductFile });
    } catch (e) {
      out.push({ fileKey, path, product: { title: '' }, parseError: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

export async function writeProduct(dir: string, key: string, product: ProductFile): Promise<void> {
  await mkdir(productsDir(dir), { recursive: true });
  await writeFile(productFilePath(dir, key), JSON.stringify(product, null, 2) + '\n', 'utf8');
}

export interface UploadCacheEntry {
  mediaId: number;
  url: string;
}
export type UploadCache = Record<string, UploadCacheEntry>;
/** `{ "<sha256>": {mediaId,url} }` per site, so switching a workdir to another site never reuses its media ids. */
const uploadsState = siteState<UploadCache>('uploads.json');

export async function readUploadsCache(dir: string, siteUrl: string): Promise<UploadCache> {
  return uploadsState.read(dir, siteUrl);
}

export async function writeUploadsCache(dir: string, siteUrl: string, cache: UploadCache): Promise<void> {
  return uploadsState.write(dir, siteUrl, cache);
}
