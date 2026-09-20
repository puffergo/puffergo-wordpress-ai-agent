/**
 * Image size / shape advice against the site's image specs (schema `images`): over the byte limit,
 * wrong ratio for the place it shows in, or too small / needlessly large. Advice only, never blocks —
 * the customer decides, and the crop tool link fixes all three in one go.
 */

export interface PlaceSpec {
  ratio?: string;
  width?: number;
  height?: number;
  cropUrl: string;
}
export interface ImagesSpec {
  maxBytes: number;
  places: Record<string, PlaceSpec>;
}
export interface ImageInfo {
  bytes: number;
  width: number;
  height: number;
}

const RATIO_TOLERANCE = 0.05;
const TOO_LARGE_FACTOR = 1.5;

/** Places outside components; a component's place is `<templateId>|<slotClass>`, named by the component. */
export const PLACE_LABELS: Record<string, string> = {
  productGallery: 'product gallery',
};

function ratioValue(ratio: string): number | null {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(ratio);
  return m ? Number(m[1]) / Number(m[2]) : null;
}

export function ratioFits(info: ImageInfo, spec: PlaceSpec): boolean {
  const target = spec.ratio ? ratioValue(spec.ratio) : null;
  if (!target || !info.height) return true;
  return Math.abs(info.width / info.height / target - 1) <= RATIO_TOLERANCE;
}

/** Problems with this image in this place; empty when it's fine. */
export function placeProblems(info: ImageInfo, place: string, spec: PlaceSpec, maxBytes: number): string[] {
  const out: string[] = [];
  if (info.bytes > maxBytes) out.push(`${Math.round(info.bytes / 1024)}KB, over ${Math.round(maxBytes / 1024)}KB`);
  if (!ratioFits(info, spec)) {
    out.push(
      place === 'productGallery'
        ? `not ${spec.ratio}, so it shows with blank margins`
        : `not ${spec.ratio}, so the site crops it to ${spec.ratio}`,
    );
  }
  if (spec.width && info.width < spec.width)
    out.push(`${info.width}px wide, smaller than ${spec.width}px, may look blurry`);
  else if (spec.width && spec.ratio && info.width > spec.width * TOO_LARGE_FACTOR)
    out.push(`${info.width}x${info.height}, much larger than needed`);
  return out;
}

export function suggestion(spec: PlaceSpec, maxBytes: number): string {
  const size = spec.height
    ? `${spec.width}x${spec.height} (${spec.ratio})`
    : `at least ${spec.width}px wide, any ratio`;
  return `Suggested ${size}, WebP, under ${Math.round(maxBytes / 1024)}KB. Crop and compress here: ${spec.cropUrl}`;
}
