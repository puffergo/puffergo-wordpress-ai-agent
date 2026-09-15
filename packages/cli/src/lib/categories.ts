/**
 * Product categories from `categories.json`: a tree the agent writes from the customer's material,
 * synced to the site through WordPress's own term REST route (`/wp/v2/puffergo_product_cat`).
 * Matched by slug; existing terms are updated, missing ones created, nothing is ever deleted.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface CategoryNode {
  name: string;
  slug: string;
  description?: string;
  children?: CategoryNode[];
}

export interface RemoteTerm {
  id: number;
  name: string;
  slug: string;
  description: string;
  parent: number;
}

export type CategoryOp =
  | { op: 'create'; slug: string; name: string; description?: string; parentSlug: string }
  | { op: 'update'; id: number; slug: string; name: string; description?: string; parentSlug: string }
  | { op: 'keep'; id: number; slug: string };

export const CATEGORIES_FILE = 'categories.json';
export const MAX_SUGGESTED_DEPTH = 3;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function readCategoriesFile(dir: string): Promise<unknown> {
  const path = join(dir, CATEGORIES_FILE);
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8'));
}

/** Validate the tree and work out what to do against the site's current terms (parents before children). */
export function planCategories(
  file: unknown,
  remote: RemoteTerm[],
): { errors: string[]; warnings: string[]; ops: CategoryOp[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ops: CategoryOp[] = [];
  const roots = (file as { categories?: unknown })?.categories;
  if (!Array.isArray(roots)) return { errors: [`${CATEGORIES_FILE} must be { "categories": [ … ] }`], warnings, ops };

  const bySlug = new Map(remote.map(t => [t.slug, t]));
  const byId = new Map(remote.map(t => [t.id, t]));
  const seen = new Set<string>();

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

      if (name && SLUG_RE.test(slug)) {
        const description = typeof n.description === 'string' ? n.description : undefined;
        const existing = bySlug.get(slug);
        if (!existing) {
          ops.push({ op: 'create', slug, name, description, parentSlug });
        } else {
          const currentParent = existing.parent ? (byId.get(existing.parent)?.slug ?? '') : '';
          const changed =
            existing.name !== name ||
            currentParent !== parentSlug ||
            (description !== undefined && existing.description !== description);
          ops.push(
            changed
              ? { op: 'update', id: existing.id, slug, name, description, parentSlug }
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
