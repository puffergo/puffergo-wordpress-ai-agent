/** CLI-side checks (spec section 5's last paragraph): file exists, real image format by magic bytes,
 *  ≤10MB, shortest edge <600px is a warning only. Runs against every `file` ref found via walkImageRefs.
 *  Also flags marketing claims in the copy (claims.ts). */

import { stat, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { sniffImage, MAX_BYTES } from './imageSniff';
import type { ProductFile } from './productTypes';
import type { ValidationError } from './productTypes';
import { walkImageRefs, identOf } from './imageRefs';
import { detailWarnings } from './detailBlocks';
import { claimWarnings } from './claims';
import { placeProblems, suggestion, PLACE_LABELS, type ImagesSpec } from './imageAdvice';
import { walkConfigImages, isLocalImage, type Components } from './configData';

export interface LocalCheckOutcome {
  errors: ValidationError[];
  warnings: ValidationError[];
}

/** Check every local `file` ref in one product. `baseDir` resolves relative file paths. */
export async function localCheckProduct(
  product: ProductFile,
  baseDir: string,
  images?: ImagesSpec,
  components?: Components,
): Promise<LocalCheckOutcome> {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const ident = identOf(product);
  // Local images: refs with `file`, and a component's image fields holding a local path.
  const locals = [
    ...walkImageRefs(product).flatMap(({ path, ref, place }) => (ref.file ? [{ path, place, file: ref.file }] : [])),
    ...walkConfigImages(product, ident, components)
      .filter(l => isLocalImage(l.value))
      .map(({ path, place, value }) => ({ path, place, file: value })),
  ];

  for (const { path, place, file } of locals) {
    const ref = { file };
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
          message: `${ref.file} in the ${PLACE_LABELS[place] ?? `${components?.[place.split('|')[0]]?.name ?? place.split('|')[0]} component`}: ${problems.join('; ')}. ${suggestion(spec, images!.maxBytes)}`,
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

  warnings.push(...claimWarnings(product), ...detailWarnings(product, ident));
  return { errors, warnings };
}
