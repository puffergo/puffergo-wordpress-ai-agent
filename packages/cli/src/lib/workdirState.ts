/**
 * The little things the CLI remembers between runs, in `<workdir>/.puffergo/<name>.json`: uploaded media,
 * each post's baseModified, which section files became which post, the samples to follow. All of them are
 * kept per site, so pointing a work folder at another site never reuses the first site's ids.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** On disk: `{ "<siteUrl>": <value> }`. A missing or broken file reads as empty — these are caches, not data. */
export interface SiteState<V> {
  read(dir: string, siteUrl: string): Promise<V>;
  write(dir: string, siteUrl: string, value: V): Promise<void>;
  /** Merge one key into the site's record (the common case: one post, one upload). */
  remember<T>(dir: string, siteUrl: string, key: string | number, entry: T): Promise<void>;
}

export function siteState<V extends object>(fileName: string): SiteState<V> {
  const path = (dir: string) => join(dir, '.puffergo', fileName);
  const readAll = async (dir: string): Promise<Record<string, V>> => {
    if (!existsSync(path(dir))) return {};
    try {
      return JSON.parse(await readFile(path(dir), 'utf8')) as Record<string, V>;
    } catch {
      return {};
    }
  };
  const writeAll = async (dir: string, all: Record<string, V>): Promise<void> => {
    await mkdir(join(dir, '.puffergo'), { recursive: true });
    await writeFile(path(dir), JSON.stringify(all, null, 2) + '\n', 'utf8');
  };
  return {
    async read(dir, siteUrl) {
      return ((await readAll(dir))[siteUrl] ?? {}) as V;
    },
    async write(dir, siteUrl, value) {
      const all = await readAll(dir);
      all[siteUrl] = value;
      await writeAll(dir, all);
    },
    async remember(dir, siteUrl, key, entry) {
      const all = await readAll(dir);
      all[siteUrl] = { ...(all[siteUrl] ?? {}), [key]: entry } as V;
      await writeAll(dir, all);
    },
  };
}
