/**
 * Turning a PLAIN note (no `silo:` frontmatter yet) into Silo-managed content — "adopt" it. The
 * Obsidian plugin drives this from the note's own folder location (see
 * pages/obsidian/src/vault/adopt.ts); this file holds only the pure, reusable piece: resolving a chain
 * of human-readable terms (e.g. a folder path) to pillar→cluster `SiloNode`s, reusing whatever already
 * matches and creating only what's missing. Framework-agnostic so a future CLI `silo adopt` (or any
 * other host) can share it too.
 */

import type { NodeKind, SiloWorkspace } from '../model/types';
import { addNode } from '../model/mutations';

const norm = (s: string): string => s.trim().toLowerCase();

/**
 * Finds-or-creates a pillar→cluster chain matching `terms` (e.g. `['Solar Street Light', 'How It
 * Works']` from a note's folder path) and returns the LEAF node's id. Matching is case-insensitive on
 * the term text under the same parent — so a note dropped into a folder that happens to share a name
 * with an existing keyword node joins that node rather than creating a near-duplicate.
 *
 * `terms` with only blank/whitespace entries (e.g. a note sitting at the vault root, `parent.path ===
 * ''`) resolves to `nodeId: null` — the caller decides how to handle "nowhere to put this" (today:
 * refuse and ask the user to move the note into a folder first).
 */
export function ensureNodePathByTerms(
  ws: SiloWorkspace,
  terms: string[],
): { ws: SiloWorkspace; nodeId: string | null } {
  let current = ws;
  let parentId: string | null = null;
  let leafId: string | null = null;

  for (let i = 0; i < terms.length; i++) {
    const term = terms[i].trim();
    if (!term) continue;
    const kind: NodeKind = leafId === null ? 'pillar' : 'cluster';
    const existing = current.nodes.find(n => n.parentId === parentId && norm(n.term) === norm(term));
    if (existing) {
      leafId = existing.id;
      parentId = existing.id;
      continue;
    }
    const { ws: next, node } = addNode(current, term, kind, parentId);
    current = next;
    leafId = node.id;
    parentId = node.id;
  }

  return { ws: current, nodeId: leafId };
}
