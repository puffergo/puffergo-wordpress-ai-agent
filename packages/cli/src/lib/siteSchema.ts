/**
 * The site's product-file rules, read from the `puffergo/get-product-schema` ability — the plugin is the only
 * place that defines which trade fields exist (price/moq/leadTime can be switched off, custom text fields added
 * under `trade.<key>`). Nothing in the CLI or the Skill hard-codes that list; it all goes through here.
 */

import { AgentHttpError, type AgentClient } from './agentClient';
import type { Components } from './configData';

/** The product-file shape this CLI understands. A newer plugin needs a newer Skill/CLI. */
export const SUPPORTED_SCHEMA_VERSION = 6;
/** An older plugin would misread what this CLI sends (`seo` came in version 3; a component's data as its own
 *  configData in 5; body text as a `prose` block, and `blocks` / `block` in place of `sections` / `html` / `data`,
 *  in 6). */
export const MIN_SCHEMA_VERSION = 6;

export interface TradeField {
  /** Where the value sits in a product file: `price`, `moq`, `leadTime`, or `trade.<key>`. */
  path: string;
  kind: 'unitValue' | 'text';
  unitType?: string;
  label: string;
}

export interface SiteSchema {
  schemaVersion: number;
  tradeFields: TradeField[];
  /** What detail.blocks can hold: config components by templateId (with their guide and data fields), the one a
   *  detail uses by default, native block types. */
  blocks?: { components?: Components; default?: string; native?: string[] };
  [k: string]: unknown;
}

export class SchemaVersionError extends Error {
  constructor(readonly siteVersion: number) {
    super(
      `The site's PufferGo plugin uses product-file version ${siteVersion}; this Skill understands up to ${SUPPORTED_SCHEMA_VERSION}. Update the Skill (download the latest wordpress-bulk-product-upload) and try again.`,
    );
  }
}

/** The site has no `puffergo/*` abilities: WordPress older than 6.9, or a PufferGo plugin from before them. */
export class PluginOutdatedError extends Error {
  constructor() {
    super(
      "This site's PufferGo plugin (or WordPress) is too old for this Skill. In wp-admin, update the PufferGo plugin to the latest version and WordPress to 6.9 or newer, then try again.",
    );
  }
}

export const ABILITIES_MISSING = new Set(['rest_no_route', 'rest_ability_not_found']);

const cache = new WeakMap<AgentClient, Promise<SiteSchema>>();

/** Fetched once per client; throws SchemaVersionError when the site is newer than this CLI and
 *  PluginOutdatedError when it is older. */
export function loadSiteSchema(c: AgentClient): Promise<SiteSchema> {
  if (!cache.has(c)) {
    cache.set(
      c,
      c
        .schema<SiteSchema>()
        .catch(e => {
          const code = e instanceof AgentHttpError ? (e.body as { code?: string } | undefined)?.code : undefined;
          throw code && ABILITIES_MISSING.has(code) ? new PluginOutdatedError() : e;
        })
        .then(raw => {
          if (raw.schemaVersion > SUPPORTED_SCHEMA_VERSION) throw new SchemaVersionError(raw.schemaVersion);
          if (!(raw.schemaVersion >= MIN_SCHEMA_VERSION)) throw new PluginOutdatedError();
          return raw;
        }),
    );
  }
  return cache.get(c)!;
}

/** Facts a product may leave out on purpose (a sample that doesn't use them): the trade fields + specs. */
export function optionalFactPaths(schema: Pick<SiteSchema, 'tradeFields'>): string[] {
  return [...schema.tradeFields.map(f => f.path), 'specs'];
}

export function getPath(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

export function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (!o[k] || typeof o[k] !== 'object') o[k] = {};
    o = o[k] as Record<string, unknown>;
  }
  o[keys[keys.length - 1]] = value;
}

export function isEmptyValue(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}
