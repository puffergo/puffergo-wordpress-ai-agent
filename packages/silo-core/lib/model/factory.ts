/**
 * Factory + mutation helpers for the Silo model. Pure functions — no I/O — so they are trivially
 * testable and reusable across hosts.
 */

import type { ContentItem, PostType, Seo, SiloNode, SiloWorkspace, SiteProfile, NodeKind } from './types';
import { SILO_WORKSPACE_VERSION } from './types';

/** Collision-resistant id without pulling a uuid dependency. */
export const newId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const emptySeo = (): Seo => ({ title: '', description: '', coreKeywords: [], longTailKeywords: [] });

export const emptyWorkspace = (profile: SiteProfile): SiloWorkspace => ({
  version: SILO_WORKSPACE_VERSION,
  profile,
  nodes: [],
  contents: [],
  edges: [],
  keywords: [],
});

export const createNode = (
  term: string,
  kind: NodeKind,
  parentId: string | null,
  extra?: Partial<SiloNode>,
): SiloNode => ({
  id: newId('n'),
  term,
  kind,
  parentId,
  wpCategoryId: null,
  ...extra,
});

export const createContent = (
  siloNodeId: string,
  title: string,
  postType: PostType = 'post',
  extra?: Partial<ContentItem>,
): ContentItem => ({
  id: newId('c'),
  siloNodeId,
  postType,
  title,
  seo: emptySeo(),
  wpPostId: null,
  seoSyncedAt: null,
  lastModifiedRemote: null,
  ...extra,
});
