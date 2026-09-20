/** Local images inside Tailwind HTML (page sections, a product's static detail blocks): find them, upload each once
 *  (reusing earlier uploads) and point the HTML at the site's copy. */

import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { AgentClient } from './agentClient';
import { resolveUpload } from './uploadImage';

/** src="…" and url(…) values that point at a file on this computer rather than the web. */
const LOCAL_REF = /(\bsrc\s*=\s*["']|url\(\s*["']?)(?!https?:|\/\/|data:|\/|#)([^"')\s]+)/gi;

export function localImageRefs(html: string): string[] {
  return [...new Set([...html.matchAll(LOCAL_REF)].map(m => m[2]))];
}

/** A local image the HTML uses that isn't on disk. */
export class MissingImageError extends Error {
  constructor(readonly ref: string) {
    super(`The image "${ref}" isn't there.`);
  }
}

/** The HTML with its local images uploaded; paths resolve against `baseDir`. Throws MissingImageError. */
export async function uploadHtmlImages(
  c: AgentClient,
  cache: Record<string, { mediaId: number; url: string }>,
  html: string,
  baseDir: string,
): Promise<{ html: string; uploaded: string[]; reused: number }> {
  const urls = new Map<string, string>();
  const uploaded: string[] = [];
  let reused = 0;
  for (const ref of localImageRefs(html)) {
    const abs = isAbsolute(ref) ? ref : resolve(baseDir, decodeURI(ref));
    if (!existsSync(abs)) throw new MissingImageError(ref);
    const up = await resolveUpload(c, cache, abs);
    if (up.reused) reused++;
    else uploaded.push(abs);
    urls.set(ref, up.url);
  }
  return {
    html: html.replace(LOCAL_REF, (all, pre: string, ref: string) => (urls.has(ref) ? pre + urls.get(ref) : all)),
    uploaded,
    reused,
  };
}
