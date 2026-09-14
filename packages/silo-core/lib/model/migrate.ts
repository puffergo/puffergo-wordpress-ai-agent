/**
 * Store loading + canonical site key. The feature is PRE-LAUNCH, so there is deliberately NO
 * historical-version migration here — the on-disk shape is always current. These functions only do
 * DEFENSIVE normalization (persisted JSON may be empty on first run, or hand-edited) so the rest of
 * the app only ever sees a well-formed store; they never throw.
 */

import type { SiloStore, SiloWorkspace } from './types';
import { SILO_WORKSPACE_VERSION, SILO_STORE_VERSION, LOCAL_SITE_KEY } from './types';
import { reconcileKeywords } from './keywords';

/**
 * Canonical site key from a URL: lowercased host without `www.`, no protocol/path. This is how a
 * Silo workspace is matched to a 建站-tab site record (both keyed by domain). Empty/invalid → the
 * `__local__` placeholder so a not-yet-connected workspace still has a stable slot.
 */
export function siteKey(url: string | undefined | null): string {
  const raw = (url ?? '').trim();
  if (!raw) return LOCAL_SITE_KEY;
  try {
    const host = new URL(raw.includes('://') ? raw : `https://${raw}`).host.toLowerCase();
    return host.replace(/^www\./, '') || LOCAL_SITE_KEY;
  } catch {
    return raw.toLowerCase().replace(/^www\./, '') || LOCAL_SITE_KEY;
  }
}

/** Defensively coerce one workspace blob into the current shape (arrays present, profile present). */
function normalizeWorkspace(raw: unknown): SiloWorkspace {
  const w = (raw ?? {}) as Partial<SiloWorkspace>;
  const base: SiloWorkspace = {
    version: SILO_WORKSPACE_VERSION,
    profile: w.profile ?? { name: '', url: '' },
    connection: w.connection,
    nodes: Array.isArray(w.nodes) ? w.nodes : [],
    contents: Array.isArray(w.contents) ? w.contents : [],
    edges: Array.isArray(w.edges) ? w.edges : [],
    keywords: Array.isArray(w.keywords) ? w.keywords : [],
  };
  // Keep the managed keyword vocabulary covering every term used in SEO (adopts words from a store that
  // predates the keyword list, and any term added straight through a SEO field). Non-destructive.
  return { ...base, keywords: reconcileKeywords(base) };
}

/**
 * Load the top-level persisted blob into a well-formed store. Accepts a SiloStore or null/garbage;
 * anything without a `sites` map yields an empty store. Never mutates input; never throws.
 */
export function migrateStore(raw: unknown): SiloStore {
  const r = (raw ?? {}) as Partial<SiloStore>;
  if (r.sites && typeof r.sites === 'object') {
    const sites: Record<string, SiloWorkspace> = {};
    for (const [key, ws] of Object.entries(r.sites)) sites[key] = normalizeWorkspace(ws);
    const keys = Object.keys(sites);
    const activeDomain = r.activeDomain && sites[r.activeDomain] ? r.activeDomain : (keys[0] ?? '');
    const hiddenDomains = Array.isArray(r.hiddenDomains)
      ? r.hiddenDomains.filter(d => typeof d === 'string')
      : undefined;
    return { storeVersion: SILO_STORE_VERSION, sites, activeDomain, ...(hiddenDomains ? { hiddenDomains } : {}) };
  }
  return { storeVersion: SILO_STORE_VERSION, sites: {}, activeDomain: '' };
}
