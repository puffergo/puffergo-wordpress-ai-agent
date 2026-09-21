/**
 * A category tree the agent writes from the customer's material, synced to the site through WordPress's own term
 * REST route. Matched by slug; existing terms are updated, missing ones created, nothing is ever deleted.
 *
 * The same tree and the same sync serve products (`products categories`, `categories.json`) and the article
 * types a post is filed under (`pages categories`, `<type>-categories.json`): one shape for the AI to write and
 * one for it to read, whichever it is filing. Only products take `order` — the manual sort meta is registered
 * for their taxonomy alone and only their front end reads it, so a number nothing reads is not offered
 * elsewhere.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { AgentClient } from './agentClient';

/** The term meta the plugin sorts categories by when the site's category order is set to manual. */
export const CAT_ORDER_META = '_puffergo_cat_order';

export interface CategoryNode {
  name: string;
  slug: string;
  description?: string;
  /** Manual sort position among its siblings; 1 first. Omitted/0 puts the category last. */
  order?: number;
  children?: CategoryNode[];
}

export interface RemoteTerm {
  id: number;
  name: string;
  slug: string;
  description: string;
  parent: number;
  meta?: Record<string, unknown>;
}

export type CategoryOp =
  | { op: 'create'; slug: string; name: string; description?: string; order?: number; parentSlug: string }
  | { op: 'update'; id: number; slug: string; name: string; description?: string; order?: number; parentSlug: string }
  | { op: 'keep'; id: number; slug: string };

/** A term's stored manual order (0 / missing / not exposed by an older plugin all read as 0). */
export function remoteOrder(term: RemoteTerm): number {
  const raw = term.meta?.[CAT_ORDER_META];
  return typeof raw === 'number' ? raw : Number(raw ?? 0) || 0;
}

export const CATEGORIES_FILE = 'categories.json';
/** The product taxonomy's REST route (the article types' comes from `pages types`). */
export const PRODUCT_CAT_REST_BASE = 'puffergo_product_cat';
/** The article types' file, one per type: `post-categories.json`, `puffergo_case-categories.json`… */
export function categoriesFileFor(type: string): string {
  return `${type}-categories.json`;
}
export const MAX_SUGGESTED_DEPTH = 3;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function readCategoriesFile(dir: string, file = CATEGORIES_FILE): Promise<unknown> {
  const path = join(dir, file);
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8'));
}

/** Validate the tree and work out what to do against the site's current terms (parents before children). */
export function planCategories(
  tree: unknown,
  remote: RemoteTerm[],
  opts: { file?: string; order?: boolean } = {},
): { errors: string[]; warnings: string[]; ops: CategoryOp[] } {
  const { file = CATEGORIES_FILE, order: takesOrder = true } = opts;
  const errors: string[] = [];
  const warnings: string[] = [];
  const ops: CategoryOp[] = [];
  const roots = (tree as { categories?: unknown })?.categories;
  if (!Array.isArray(roots)) return { errors: [`${file} must be { "categories": [ … ] }`], warnings, ops };

  const bySlug = new Map(remote.map(t => [t.slug, t]));
  const byId = new Map(remote.map(t => [t.id, t]));
  const seen = new Set<string>();
  const ordersByParent = new Map<string, Set<number>>();

  const walk = (nodes: unknown[], parentSlug: string, depth: number, path: string) => {
    nodes.forEach((raw, i) => {
      const n = raw as CategoryNode;
      const at = `${path}[${i}]`;
      const name = typeof n?.name === 'string' ? n.name.trim() : '';
      const slug = typeof n?.slug === 'string' ? n.slug.trim() : '';
      if (!name) errors.push(`${at}: name is required`);
      if (!SLUG_RE.test(slug))
        errors.push(`${at}: slug "${slug}" must be lowercase English letters, digits and hyphens`);
      else if (seen.has(slug)) errors.push(`${at}: slug "${slug}" is used twice`);
      seen.add(slug);
      if (depth === MAX_SUGGESTED_DEPTH + 1)
        warnings.push(
          `"${name}" is level ${depth}. Suggest the customer keep categories to ${MAX_SUGGESTED_DEPTH} levels.`,
        );

      let order: number | undefined;
      if (n?.order !== undefined) {
        // Refused rather than ignored where nothing sorts by it: a number written and never used would have the
        // AI telling the customer the order is set while the site goes on sorting by name.
        if (!takesOrder)
          errors.push(`${at}: order is only for product categories; these are sorted by name. Leave it out.`);
        else if (typeof n.order !== 'number' || !Number.isInteger(n.order) || n.order < 1)
          errors.push(`${at}: order must be a whole number ≥ 1 (leave it out to put the category last)`);
        else order = n.order;
      }
      if (order !== undefined) {
        const siblings = ordersByParent.get(parentSlug) ?? new Set<number>();
        if (siblings.has(order))
          warnings.push(`Two categories under "${parentSlug || 'the top level'}" both have order ${order}.`);
        siblings.add(order);
        ordersByParent.set(parentSlug, siblings);
      }

      if (name && SLUG_RE.test(slug)) {
        const description = typeof n.description === 'string' ? n.description : undefined;
        const existing = bySlug.get(slug);
        if (!existing) {
          ops.push({ op: 'create', slug, name, description, order, parentSlug });
        } else {
          const currentParent = existing.parent ? (byId.get(existing.parent)?.slug ?? '') : '';
          const changed =
            existing.name !== name ||
            currentParent !== parentSlug ||
            (description !== undefined && existing.description !== description) ||
            (order !== undefined && remoteOrder(existing) !== order);
          ops.push(
            changed
              ? { op: 'update', id: existing.id, slug, name, description, order, parentSlug }
              : { op: 'keep', id: existing.id, slug },
          );
        }
      }
      if (n?.children !== undefined) {
        if (Array.isArray(n.children)) walk(n.children, slug, depth + 1, `${at}.children`);
        else errors.push(`${at}.children must be an array`);
      }
    });
  };
  walk(roots, '', 1, 'categories');
  return { errors, warnings, ops };
}

/**
 * Plan the tree against the site and, when pushing, write it: parents before children, so a child's parent id
 * is known by the time it is created. Existing categories are left alone unless the customer turned on editing
 * live content — the tree is theirs, and a category already on the site may have been renamed there on purpose.
 *
 * @param editLiveHint How the caller's own skill turns editing live content on, named in the note the AI reads.
 * @returns The outcome to print, or the errors that stopped it.
 */
export async function syncCategories(
  c: AgentClient,
  opts: {
    tree: unknown;
    restBase: string;
    file: string;
    push: boolean;
    editLive: boolean;
    editLiveHint: string;
    language?: string;
    /**
     * How this taxonomy is sorted, when it is sortable at all: undefined for one that is not (only product
     * categories are), null when the site's plugin is too old to set it, else the site's current setting.
     */
    order?: { orderby: string } | null;
  },
): Promise<{ ok: boolean; [k: string]: unknown }> {
  const remote = await c.listCategoryTerms<RemoteTerm>(opts.restBase, opts.language ?? '');
  const sortable = 'order' in opts;
  const { errors, warnings, ops } = planCategories(opts.tree, remote, { file: opts.file, order: sortable });
  if (errors.length) return { ok: false, code: 'invalid', errors, warnings };

  // An order only reaches the site through the term meta the plugin registers, and only shows on the front end
  // when the site is set to sort by it — say so rather than write a number the customer will not see take effect.
  const wantsOrder = ops.some(o => o.op !== 'keep' && o.order !== undefined);
  if (wantsOrder && opts.order === null)
    return {
      ok: false,
      code: 'update_plugin',
      message:
        "This site's PufferGo plugin is too old to set category order from here. Ask the customer to update the plugin, or to fill in Order on each category in wp-admin.",
    };
  if (wantsOrder && opts.order && opts.order.orderby !== 'manual')
    warnings.push(
      `Category order is written, but the site sorts these categories by "${opts.order.orderby}", so it has no visible effect yet. Ask the customer to set 产品设置 → 分类排序 to 手动 (Manual).`,
    );

  const todo = ops.filter(o => o.op === 'create' || (o.op === 'update' && opts.editLive));
  const leftAlone = opts.editLive ? [] : ops.filter(o => o.op === 'update').map(o => o.slug);
  const out = {
    ok: true,
    changes: todo.map(o => ({ op: o.op, slug: o.slug })),
    ...(leftAlone.length
      ? {
          leftAlone,
          leftAloneNote: `These categories already exist on the site and differ from ${opts.file}; they were not changed. The customer can change them in wp-admin, or tell you to turn on editing live content (\`${opts.editLiveHint}\`).`,
        }
      : {}),
    warnings,
  };
  if (!opts.push) return out;

  const idBySlug = new Map(remote.map(t => [t.slug, t.id]));
  for (const o of todo) {
    if (o.op === 'keep') continue;
    const body: Record<string, unknown> = {
      name: o.name,
      slug: o.slug,
      parent: o.parentSlug ? (idBySlug.get(o.parentSlug) ?? 0) : 0,
      ...(o.description !== undefined ? { description: o.description } : {}),
      ...(o.order !== undefined ? { meta: { [CAT_ORDER_META]: o.order } } : {}),
    };
    const saved = await c.saveCategoryTerm<{ id: number }>(opts.restBase, o.op === 'update' ? o.id : null, body);
    idBySlug.set(o.slug, saved.id);
  }
  return out;
}
