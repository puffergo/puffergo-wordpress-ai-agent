/** Local images inside body Markdown (`![alt](images/x.jpg)`): find them, upload each once (reusing earlier
 *  uploads) and point the Markdown at the site's copy. The HTML counterpart is htmlImages.ts. */

import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { AgentClient } from './agentClient';
import { MissingImageError } from './htmlImages';
import { resolveUpload } from './uploadImage';

/** `![alt](ref)` where ref points at a file on this computer rather than the web. */
const LOCAL_REF = /(!\[[^\]]*\]\(\s*)(?!https?:|\/\/|data:|\/|#)([^)\s]+)/g;

export function localMarkdownImageRefs(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(LOCAL_REF)].map(m => m[2]))];
}

/** The Markdown with its local images uploaded; paths resolve against `baseDir`. Throws MissingImageError. */
export async function uploadMarkdownImages(
  c: AgentClient,
  cache: Record<string, { mediaId: number; url: string }>,
  markdown: string,
  baseDir: string,
): Promise<{ markdown: string; uploaded: string[]; reused: number }> {
  const urls = new Map<string, string>();
  const uploaded: string[] = [];
  let reused = 0;
  for (const ref of localMarkdownImageRefs(markdown)) {
    const abs = isAbsolute(ref) ? ref : resolve(baseDir, decodeURI(ref));
    if (!existsSync(abs)) throw new MissingImageError(ref);
    const up = await resolveUpload(c, cache, abs);
    if (up.reused) reused++;
    else uploaded.push(abs);
    urls.set(ref, up.url);
  }
  return {
    markdown: markdown.replace(LOCAL_REF, (all, pre: string, ref: string) =>
      urls.has(ref) ? pre + urls.get(ref) : all,
    ),
    uploaded,
    reused,
  };
}
