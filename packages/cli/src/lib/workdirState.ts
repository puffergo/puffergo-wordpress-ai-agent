/**
 * The little things the CLI remembers between runs, in `.puffergo/sites/<domain>/<name>.json`: uploaded
 * media, each post's baseModified, which section files became which post, the samples to follow. One file
 * per site (not a `{siteUrl: …}` dict any more), so pointing a work folder at another site never reuses
 * the first site's ids and a write only ever touches that site's own file.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { siteKey, siteStatePath } from '@puffergo/silo-core';

/** One site's `<name>.json` value. A missing or broken file reads as empty — these are caches, not data. */
export interface SiteState<V> {
  read(dir: string, siteUrl: string): Promise<V>;
  write(dir: string, siteUrl: string, value: V): Promise<void>;
  /** Merge one key into the site's record (the common case: one post, one upload). */
  remember<T>(dir: string, siteUrl: string, key: string | number, entry: T): Promise<void>;
}

export function siteState<V extends object>(fileName: string): SiteState<V> {
  const path = (dir: string, siteUrl: string) => join(dir, siteStatePath(siteKey(siteUrl), fileName));
  const readOne = async (dir: string, siteUrl: string): Promise<V> => {
    const p = path(dir, siteUrl);
    if (!existsSync(p)) return {} as V;
    try {
      return JSON.parse(await readFile(p, 'utf8')) as V;
    } catch {
      return {} as V;
    }
  };
  const writeOne = async (dir: string, siteUrl: string, value: V): Promise<void> => {
    const p = path(dir, siteUrl);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, JSON.stringify(value, null, 2) + '\n', 'utf8');
  };
  return {
    read: readOne,
    write: writeOne,
    async remember(dir, siteUrl, key, entry) {
      const cur = await readOne(dir, siteUrl);
      await writeOne(dir, siteUrl, { ...cur, [key]: entry } as V);
    },
  };
}
