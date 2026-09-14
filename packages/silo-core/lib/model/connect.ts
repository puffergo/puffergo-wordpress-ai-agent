/**
 * applyConnection — resolve where a just-verified WP connection lands in the multi-site store. This is
 * the ONLY place a workspace changes its domain key, so it lives here as a pure, exhaustively-testable
 * function rather than tangled inside the React component.
 *
 * The guiding rule: NEVER hijack an established site. Re-keying (moving a workspace to a new domain)
 * is only ever done to the throwaway `__local__` seed on its first connect. Connecting a different
 * domain while sitting on a real site creates a SEPARATE site and switches to it.
 */

import type { SiloStore, SiloWorkspace, WpConnection } from './types';
import { LOCAL_SITE_KEY, SILO_STORE_VERSION } from './types';
import { emptyWorkspace } from './factory';
import { siteKey } from './migrate';

export type ConnectOutcome = 'reconnect' | 'adopt-existing' | 'rekey-local' | 'new-site';

export interface ConnectResult {
  store: SiloStore;
  /** The domain now active (always `siteKey(url)`). */
  activeDomain: string;
  outcome: ConnectOutcome;
}

/**
 * @param store   current multi-site store
 * @param url     the connected site URL (its canonical host becomes the site key)
 * @param connection the verified WpConnection to store on the target workspace
 * @param intent  'current' = the connect modal was opened for the active site; 'new' = the user chose
 *                "＋ connect a new site" and must never re-key the current one.
 */
export function applyConnection(
  store: SiloStore,
  url: string,
  connection: WpConnection,
  intent: 'current' | 'new',
): ConnectResult {
  const oldKey = store.activeDomain;
  const newKey = siteKey(url);
  const sites = { ...store.sites };
  const withConn = (ws: SiloWorkspace): SiloWorkspace => ({ ...ws, connection, profile: { ...ws.profile, url } });

  let outcome: ConnectOutcome;
  if (newKey === oldKey && sites[oldKey]) {
    // Reconnecting the same site → just refresh its connection.
    sites[newKey] = withConn(sites[oldKey]);
    outcome = 'reconnect';
  } else if (sites[newKey]) {
    // The target domain already has a Silo → adopt the connection and switch there. Never overwrite
    // the existing site's nodes/contents; leave the old workspace untouched.
    sites[newKey] = withConn(sites[newKey]);
    outcome = 'adopt-existing';
  } else if (intent === 'current' && oldKey === LOCAL_SITE_KEY && sites[oldKey]) {
    // The fresh, unconnected local seed becomes its real domain → move/re-key it (nothing lost).
    sites[newKey] = withConn(sites[oldKey]);
    delete sites[oldKey];
    outcome = 'rekey-local';
  } else {
    // A different, brand-new domain while on an established site (or an explicit "new site"): create a
    // SEPARATE workspace and switch to it. The current site is never modified.
    sites[newKey] = { ...emptyWorkspace({ name: '', url }), connection };
    outcome = 'new-site';
  }

  // Connecting/adding a domain always un-hides it.
  const hiddenDomains = (store.hiddenDomains ?? []).filter(d => d !== newKey);
  return {
    store: { storeVersion: store.storeVersion ?? SILO_STORE_VERSION, sites, activeDomain: newKey, hiddenDomains },
    activeDomain: newKey,
    outcome,
  };
}
