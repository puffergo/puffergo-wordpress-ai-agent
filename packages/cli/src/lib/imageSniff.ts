/**
 * Local image checks for `puffergo products check` (spec section 5's CLI-side checks): identify the
 * real format by magic bytes (never trust the file extension), parse pixel dimensions without any
 * native dependency, and enforce the size cap. Formats: jpeg, png, webp, gif.
 */

export type SniffedFormat = 'jpeg' | 'png' | 'webp' | 'gif' | null;

export interface SniffResult {
  format: SniffedFormat;
  width: number | null;
  height: number | null;
}

const MAX_BYTES = 10 * 1024 * 1024;
export { MAX_BYTES };

function readUInt16BE(buf: Uint8Array, off: number): number {
  return (buf[off]! << 8) | buf[off + 1]!;
}
function readUInt32BE(buf: Uint8Array, off: number): number {
  return ((buf[off]! << 24) | (buf[off + 1]! << 16) | (buf[off + 2]! << 8) | buf[off + 3]!) >>> 0;
}
function sniffFormat(buf: Uint8Array): SniffedFormat {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  )
    return 'png';
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  )
    return 'webp';
  if (
    buf.length >= 6 &&
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  )
    return 'gif';
  return null;
}

function pngDims(buf: Uint8Array): { width: number; height: number } | null {
  // IHDR is always the first chunk, right after the 8-byte signature + 4-byte length + "IHDR".
  if (buf.length < 24) return null;
  return { width: readUInt32BE(buf, 16), height: readUInt32BE(buf, 20) };
}

function gifDims(buf: Uint8Array): { width: number; height: number } | null {
  if (buf.length < 10) return null;
  return { width: buf[6]! | (buf[7]! << 8), height: buf[8]! | (buf[9]! << 8) };
}

function jpegDims(buf: Uint8Array): { width: number; height: number } | null {
  let off = 2; // skip SOI
  const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (off + 9 < buf.length) {
    if (buf[off] !== 0xff) {
      off++;
      continue;
    }
    const marker = buf[off + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      off += 2;
      continue;
    }
    if (marker === 0xd9) break; // EOI
    const len = readUInt16BE(buf, off + 2);
    if (SOF_MARKERS.has(marker)) {
      const height = readUInt16BE(buf, off + 5);
      const width = readUInt16BE(buf, off + 7);
      return { width, height };
    }
    off += 2 + len;
  }
  return null;
}

function webpDims(buf: Uint8Array): { width: number; height: number } | null {
  if (buf.length < 30) return null;
  const chunkId = String.fromCharCode(buf[12]!, buf[13]!, buf[14]!, buf[15]!);
  if (chunkId === 'VP8 ') {
    // Lossy: dims are 16-bit LE at offset 26/28, top 2 bits are scaling flags.
    const width = (buf[26]! | (buf[27]! << 8)) & 0x3fff;
    const height = (buf[28]! | (buf[29]! << 8)) & 0x3fff;
    return { width, height };
  }
  if (chunkId === 'VP8L') {
    const b0 = buf[21]!,
      b1 = buf[22]!,
      b2 = buf[23]!,
      b3 = buf[24]!;
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { width, height };
  }
  if (chunkId === 'VP8X') {
    const width = 1 + (buf[24]! | (buf[25]! << 8) | (buf[26]! << 16));
    const height = 1 + (buf[27]! | (buf[28]! << 8) | (buf[29]! << 16));
    return { width, height };
  }
  return null;
}

/** Sniff format by magic bytes and parse pixel dimensions. `buf` need only contain a leading slice of
 *  the file (a few KB is enough for every format here) — callers may read the whole file too. */
export function sniffImage(buf: Uint8Array): SniffResult {
  const format = sniffFormat(buf);
  let dims: { width: number; height: number } | null = null;
  try {
    if (format === 'jpeg') dims = jpegDims(buf);
    else if (format === 'png') dims = pngDims(buf);
    else if (format === 'gif') dims = gifDims(buf);
    else if (format === 'webp') dims = webpDims(buf);
  } catch {
    dims = null;
  }
  return { format, width: dims?.width ?? null, height: dims?.height ?? null };
}
