/**
 * CLI AssetUploader: resolves a local image reference (as written in a note) to a file on disk, uploads
 * it to the WP media library via WpClient, and returns the hosted URL. This is the platform-specific
 * half of asset handling — the pure extract/rewrite/orchestration lives in silo-core's body-codec.
 *
 * Refs resolve against the note's own folder first, then the vault root (covers both `./img.png` next to
 * the note and a shared `attachments/` at the top). Uploads are cached per ref so one image isn't sent
 * twice in a run; a missing file / failed upload resolves to null (the ref is left untouched).
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, basename, extname } from 'node:path';
import type { AssetUploader, WpClient } from '@puffergo/silo-core';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

const mimeOf = (filename: string): string | undefined => MIME_BY_EXT[extname(filename).toLowerCase()];

/** Build an AssetUploader that reads from `baseDirs` (in order) and uploads via `client`. */
export function wpAssetUploader(client: WpClient, baseDirs: string[]): AssetUploader {
  const cache = new Map<string, string | null>();
  return {
    async upload(ref: string): Promise<string | null> {
      if (cache.has(ref)) return cache.get(ref) ?? null;
      let url: string | null = null;
      try {
        // Decode %20 etc. and try each base dir until the file is found.
        const rel = decodeURIComponent(ref);
        const abs = baseDirs.map(d => resolve(d, rel)).find(existsSync);
        const mime = abs && mimeOf(abs);
        if (abs && mime) {
          const bytes = await readFile(abs);
          const { url: hosted } = await client.uploadMedia(new Uint8Array(bytes), basename(abs), mime);
          url = hosted;
        }
      } catch {
        url = null; // unreadable / upload failed → leave the ref as-is
      }
      cache.set(ref, url);
      return url;
    },
  };
}
