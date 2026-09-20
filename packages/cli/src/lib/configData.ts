/** The data of a config component (its configData), the same for every component, in a product's detail and on
 *  pages alike: walked by its schema (configSchema) when there is one, else by what its values look like. */

import type { DetailBlock, ProductFile } from './productTypes';
import { detailBlocks } from './detailBlocks';

/** One field of a configSchema: its type (text, textarea, richtext, image, select, array…), list rows' fields,
 *  and for an image the slot it fills under which sibling values. */
export interface ConfigField {
  type?: string;
  itemSchema?: ConfigSchema;
  slotWhen?: Array<{ when?: Record<string, string[]>; slotClass?: string }>;
  [k: string]: unknown;
}
export type ConfigSchema = Record<string, ConfigField>;

/** The site's product-detail components (schema `blocks.components`): templateId → name, how to fill it (`guide`,
 *  written with the component) and its data fields. */
export type Components = Record<string, { name?: string; guide?: string; schema?: ConfigSchema }>;

export interface ConfigLeaf {
  /** e.g. `data.sections[1].images[0].image` */
  path: string;
  value: string;
  field?: ConfigField;
  /** The object holding this value (its siblings decide an image's slot). */
  row: Record<string, unknown>;
  set: (next: string) => void;
}

const TEXT_TYPES = new Set(['text', 'textarea', 'richtext']);
const IMAGE_FILE = /\.(jpe?g|png|webp|gif|avif)$/i;

export const isUrl = (v: string) => /^(https?:)?\/\//i.test(v);
/** A local image path (relative to the workdir) the CLI uploads and swaps for its URL. */
export const isLocalImage = (v: string) => IMAGE_FILE.test(v) && !isUrl(v);

/** Every string in the data, with its schema field when the schema has one. */
export function configLeaves(data: unknown, schema: ConfigSchema | undefined, path = 'data'): ConfigLeaf[] {
  const out: ConfigLeaf[] = [];
  const walk = (obj: Record<string, unknown>, fields: ConfigSchema | undefined, at: string) => {
    for (const [key, value] of Object.entries(obj)) {
      const field = fields?.[key];
      if (typeof value === 'string') {
        out.push({ path: `${at}.${key}`, value, field, row: obj, set: next => (obj[key] = next) });
      } else if (Array.isArray(value)) {
        value.forEach((row, i) => {
          if (row && typeof row === 'object')
            walk(row as Record<string, unknown>, field?.itemSchema, `${at}.${key}[${i}]`);
        });
      } else if (value && typeof value === 'object') {
        walk(value as Record<string, unknown>, field?.itemSchema, `${at}.${key}`);
      }
    }
  };
  if (data && typeof data === 'object' && !Array.isArray(data)) walk(data as Record<string, unknown>, schema, path);
  return out;
}

/** Text a visitor reads: text fields by the schema; without one, every string that isn't a link or an image path. */
export function configTexts(data: unknown, schema?: ConfigSchema, path?: string): ConfigLeaf[] {
  return configLeaves(data, schema, path).filter(l =>
    l.field ? TEXT_TYPES.has(l.field.type ?? '') : !isUrl(l.value) && !isLocalImage(l.value),
  );
}

/** Image fields by the schema; without one, every local image path. */
export function configImages(data: unknown, schema?: ConfigSchema, path?: string): ConfigLeaf[] {
  return configLeaves(data, schema, path).filter(l => (l.field ? l.field.type === 'image' : isLocalImage(l.value)));
}

/** The slot an image fills: the first slotWhen rule whose `when` matches its siblings. */
export function slotClass(leaf: ConfigLeaf): string | undefined {
  return leaf.field?.slotWhen?.find(rule =>
    Object.entries(rule.when ?? {}).every(([k, allowed]) => allowed.includes(String(leaf.row[k] ?? ''))),
  )?.slotClass;
}

export interface WalkedConfigImage extends ConfigLeaf {
  /** `<templateId>|<slotClass>`: the key of its spec in schema `images.places`. */
  place: string;
}

/** Every image in the detail's config components, with the path the server uses. */
export function walkConfigImages(product: ProductFile, ident: string, components?: Components): WalkedConfigImage[] {
  return detailBlocks(product, ident).flatMap(({ path, block }) => {
    if (block.type !== 'config') return [];
    return configImages(block.data, components?.[block.component]?.schema, `${path}.data`).map(leaf => ({
      ...leaf,
      place: `${block.component}|${slotClass(leaf) ?? ''}`,
    }));
  });
}

export type ConfigBlock = Extract<DetailBlock, { type: 'config' }>;
