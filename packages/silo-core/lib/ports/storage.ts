/**
 * StoragePort — the persistence seam. `silo-core` never touches chrome.storage or the filesystem
 * directly; each host injects an adapter. Extension → chrome.storage.local; Obsidian → vault/saveData.
 *
 * Security note: the WpConnection (incl. Application Password) lives inside SiloWorkspace and is
 * persisted only through this port, i.e. only ever locally. It must never be sent to our servers.
 */

import type { SiloWorkspace } from '../model/types';

export interface StoragePort {
  /** Load the persisted workspace, or `null` if none saved yet. */
  load(): Promise<SiloWorkspace | null>;
  /** Persist the whole workspace. */
  save(ws: SiloWorkspace): Promise<void>;
}
