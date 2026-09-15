/** CLI-side checks (spec section 5's last paragraph): file exists, real image format by magic bytes,
 *  ≤10MB, shortest edge <600px is a warning only. Runs against every `file` ref found via walkImageRefs.
 *  Also flags marketing claims in the copy (claims.ts). */

import { stat, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { sniffImage, MAX_BYTES } from './imageSniff';
import type { ProductFile } from './productTypes';
import type { ValidationError } from './productTypes';
import { walkImageRefs } from './imageRefs';
import { claimWarnings } from './claims';
import { placeProblems, suggestion, PLACE_LABELS, type ImagesSpec } from './imageAdvice';

export interface LocalCheckOutcome {
  errors: ValidationError[];
  warnings: ValidationError[];
}

/** Check every local `file` ref in one product. `baseDir` resolves relative file paths. */
export async function localCheckProduct(
  product: ProductFile,
  baseDir: string,
  images?: ImagesSpec,
): Promise<LocalCheckOutcome> {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  for (const { path, ref, place } of walkImageRefs(product)) {
    if (!ref.file) continue;
    const abs = resolve(baseDir, ref.file);
    if (!existsSync(abs)) {
      errors.push({ path, code: 'not_found', message: `File not found: ${ref.file}`, fix: 'ai' });
      continue;
    }
    const st = await stat(abs);
    if (st.size > MAX_BYTES) {
      errors.push({
        path,
        code: 'format',
        message: `File too large (${(st.size / 1024 / 1024).toFixed(1)}MB > 10MB): ${ref.file}`,
        fix: 'ai',
      });
      continue;
    }
    const bytes = await readFile(abs);
    const { format, width, height } = sniffImage(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    if (!format) {
      errors.push({
        path,
        code: 'format',
        message: `Not a recognized image (jpeg/png/webp/gif) by file content: ${ref.file}`,
        fix: 'ai',
      });
      continue;
    }
    const spec = images?.places[place];
    if (spec && width != null && height != null) {
      const problems = placeProblems({ bytes: st.size, width, height }, place, spec, images!.maxBytes);
      if (problems.length) {
        warnings.push({
          path,
          code: 'image_advice',
          message: `${ref.file} in the ${PLACE_LABELS[place] ?? place}: ${problems.join('; ')}. ${suggestion(spec, images!.maxBytes)}`,
          fix: 'user',
        });
      }
    } else if (width != null && height != null) {
      const shortest = Math.min(width, height);
      if (shortest < 600) {
        warnings.push({
          path,
          code: 'format',
          message: `Image is small (${width}x${height}, shortest edge ${shortest}px < 600px): ${ref.file}`,
          fix: 'user',
        });
      }
    }
  }

  warnings.push(...claimWarnings(product));
  return { errors, warnings };
}
