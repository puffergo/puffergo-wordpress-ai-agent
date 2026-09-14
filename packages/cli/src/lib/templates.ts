/**
 * Product templates: products the customer made (or approved) that new products should follow in
 * STRUCTURE — which trade fields the site shows, spec names and order, detail layouts. Stored as
 * name → product id in `.puffergo/templates.json`, per site; the content is fetched fresh every time, so
 * edits made in wp-admin take effect on the next run.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentClient } from './agentClient';
import { walkImageRefs } from './imageRefs';
import type { ProductFile, UnitValue } from './productTypes';
import { getPath, setPath, isEmptyValue, optionalFactPaths, type SiteSchema } from './siteSchema';

export interface TemplateEntry {
  id: number;
  title: string;
}
type TemplatesFile = Record<string, Record<string, TemplateEntry>>;

const templatesPath = (dir: string): string => join(dir, '.puffergo', 'templates.json');

async function readAll(dir: string): Promise<TemplatesFile> {
  if (!existsSync(templatesPath(dir))) return {};
  try {
    return JSON.parse(await readFile(templatesPath(dir), 'utf8')) as TemplatesFile;
  } catch {
    return {};
  }
}

export async function readTemplates(dir: string, siteUrl: string): Promise<Record<string, TemplateEntry>> {
  return (await readAll(dir))[siteUrl] ?? {};
}

export async function writeTemplates(
  dir: string,
  siteUrl: string,
  templates: Record<string, TemplateEntry>,
): Promise<void> {
  const all = await readAll(dir);
  all[siteUrl] = templates;
  await mkdir(join(dir, '.puffergo'), { recursive: true });
  await writeFile(templatesPath(dir), JSON.stringify(all, null, 2) + '\n', 'utf8');
}

export class TargetError extends Error {
  constructor(
    readonly code: 'not_found' | 'other_site',
    message: string,
  ) {
    super(message);
  }
}

/** A product id, a product key, or any link to the product the customer pasted (edit screen, preview, page). */
export async function resolveProductId(c: AgentClient, target: string): Promise<number> {
  if (/^\d+$/.test(target)) return Number(target);
  if (/^https?:\/\//i.test(target)) {
    const host = (u: string) => new URL(u).host.replace(/^www\./, '').toLowerCase();
    if (host(target) !== host(c.siteUrl)) {
      throw new TargetError(
        'other_site',
        `This link is on ${new URL(target).host}, not the connected site ${c.siteUrl}.`,
      );
    }
    const list = await c.listProducts<{ items: Array<{ id: number }> }>({ url: target });
    if (!list.items[0]) throw new TargetError('not_found', `No product found at ${target}`);
    return list.items[0].id;
  }
  const list = await c.listProducts<{ items: Array<{ id: number }> }>({ key: target });
  if (!list.items[0]) throw new TargetError('not_found', `No product with key "${target}"`);
  return list.items[0].id;
}

const FROM_CUSTOMER = '<from customer>';
const TEXT = '<text from customer facts>';

function maskUnitValue(v: UnitValue | undefined): unknown {
  if (!v || v.type === 'contact') return v;
  const out: Record<string, unknown> = {};
  for (const k of ['value', 'min', 'max'] as const) if (v[k] !== undefined) out[k] = FROM_CUSTOMER;
  if (v.unit) out.unit = v.unit;
  return out;
}

/**
 * The template as a structure reference: which fields it uses, units, spec names and order, section layouts
 * and where images go. Values, spec values, every piece of text and images become placeholders, so nothing
 * of the template product itself can leak into a new one. Trade fields come from the site's schema.
 */
export function templateReference(
  remote: ProductFile,
  schema: Pick<SiteSchema, 'tradeFields'>,
): Record<string, unknown> {
  const p: ProductFile = JSON.parse(JSON.stringify(remote));
  for (const k of ['id', 'key', 'baseModified', 'status'] as const) delete p[k];
  if (p.detail) delete p.detail.unmanagedHtml;
  for (const { ref } of walkImageRefs(p)) {
    for (const k of Object.keys(ref)) delete (ref as Record<string, unknown>)[k];
    ref.file = '<customer photo>';
  }
  const out = p as unknown as Record<string, unknown>;
  for (const f of schema.tradeFields) {
    const v = getPath(out, f.path);
    if (isEmptyValue(v)) continue;
    setPath(out, f.path, f.kind === 'unitValue' ? maskUnitValue(v as UnitValue) : FROM_CUSTOMER);
  }
  if (p.specs) out.specs = p.specs.map(s => ({ key: s.key, value: FROM_CUSTOMER }));
  // Any sentence of the template carries that product's own facts (sizes, uses, materials) — models copy
  // them even when told not to. Keep only where text goes; no length either, or models pad it with claims.
  const shape = (t: string | undefined) => (t?.trim() ? TEXT : t);
  p.title = shape(p.title)!;
  p.excerpt = shape(p.excerpt);
  if (p.detail) {
    for (const k of ['title', 'subtitle', 'intro'] as const) p.detail[k] = shape(p.detail[k]);
    for (const s of p.detail.sections ?? []) {
      s.heading = shape(s.heading);
      s.body = shape(s.body);
      for (const img of s.images ?? []) {
        img.title = shape(img.title);
        img.text = shape(img.text);
      }
    }
  }
  // Same rule as the check command's TemplateCtx, so what the AI is told matches what check enforces.
  out.notUsed = optionalFactPaths(schema).filter(path => isEmptyValue(getPath(remote, path)));
  return out;
}
