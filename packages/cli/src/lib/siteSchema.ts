/**
 * The site's product-file rules, read from `GET /agent/products/schema` — the plugin is the only place
 * that defines which trade fields exist (price/moq/leadTime can be switched off, custom text fields added
 * under `trade.<key>`). Nothing in the CLI or the Skill hard-codes that list; it all goes through here.
 */

import type { AgentClient } from './agentClient';

/** The product-file shape this CLI understands. A newer plugin needs a newer Skill/CLI. */
export const SUPPORTED_SCHEMA_VERSION = 2;

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
  [k: string]: unknown;
}

/** Plugins from before the field table (no schemaVersion) always had these three. */
const LEGACY_TRADE_FIELDS: TradeField[] = [
  { path: 'price', kind: 'unitValue', unitType: 'currency', label: 'Price' },
  { path: 'moq', kind: 'unitValue', unitType: 'quantity', label: 'Min. Order' },
  { path: 'leadTime', kind: 'unitValue', unitType: 'time', label: 'Lead Time' },
];

export class SchemaVersionError extends Error {
  constructor(readonly siteVersion: number) {
    super(
      `The site's PufferGo plugin uses product-file version ${siteVersion}; this Skill understands up to ${SUPPORTED_SCHEMA_VERSION}. Update the Skill (download the latest wordpress-bulk-product-upload) and try again.`,
    );
  }
}

const cache = new WeakMap<AgentClient, Promise<SiteSchema>>();

/** Fetched once per client; throws SchemaVersionError when the site is newer than this CLI. */
export function loadSiteSchema(c: AgentClient): Promise<SiteSchema> {
  if (!cache.has(c)) {
    cache.set(
      c,
      c.schema<Record<string, unknown>>().then(raw => {
        const schemaVersion = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1;
        if (schemaVersion > SUPPORTED_SCHEMA_VERSION) throw new SchemaVersionError(schemaVersion);
        const tradeFields = Array.isArray(raw.tradeFields) ? (raw.tradeFields as TradeField[]) : LEGACY_TRADE_FIELDS;
        return { ...raw, schemaVersion, tradeFields };
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
