/** sha256 → `.puffergo/uploads.json` cache → the puffergo/find-media ability → else upload to /wp/v2/media,
 *  per spec section 7's push flow. Returns the resolved mediaId + whether a fresh upload happened. */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { sniffImage } from './imageSniff';
import type { AgentClient } from './agentClient';
import type { UploadCache } from './productFiles';

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export interface ResolvedUpload {
  mediaId: number;
  url: string;
  sha256: string;
  reused: boolean;
}

/** Resolve one local file to a mediaId, uploading only if it isn't already known (cache or site). */
export async function resolveUpload(client: AgentClient, cache: UploadCache, absPath: string): Promise<ResolvedUpload> {
  const bytes = await readFile(absPath);
  const sha256 = sha256Hex(bytes);

  const cached = cache[sha256];
  if (cached) return { mediaId: cached.mediaId, url: cached.url, sha256, reused: true };

  const lookup = await client.mediaLookup<{ found: boolean; mediaId?: number; url?: string }>(sha256);
  if (lookup.found && lookup.mediaId) {
    cache[sha256] = { mediaId: lookup.mediaId, url: lookup.url ?? '' };
    return { mediaId: lookup.mediaId, url: lookup.url ?? '', sha256, reused: true };
  }

  const filename = basename(absPath);
  // MIME from the real content (check already rejected non-images), never from the extension.
  const format = sniffImage(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)).format ?? 'jpeg';
  const mime = `image/${format}`;
  const { id, url } = await client.uploadMedia(new Uint8Array(bytes), filename, mime);
  cache[sha256] = { mediaId: id, url };
  return { mediaId: id, url, sha256, reused: false };
}
