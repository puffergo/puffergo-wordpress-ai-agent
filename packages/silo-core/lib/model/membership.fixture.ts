/** Test-only fixture shared by the membership tests (selectors / mutations / sync-content). */

import { emptyWorkspace } from './factory';
import type { SiloNode, SiloWorkspace } from './types';

/** 博客 (type-root, categories) → A (#10) → { F (virtual folder), C (category not on WP yet) }; B (#20). */
export const membershipWs = (): SiloWorkspace => {
  const node = (id: string, parentId: string | null, extra: Partial<SiloNode> = {}): SiloNode =>
    ({ id, term: id, kind: parentId ? 'cluster' : 'pillar', parentId, wpCategoryId: null, ...extra }) as SiloNode;
  return {
    ...emptyWorkspace({ name: 'Test Site', url: 'https://example.com' }),
    nodes: [
      node('root', null, { system: true, postType: 'post', taxonomyRestBase: 'categories' }),
      node('A', 'root', { isCategory: true, wpCategoryId: 10, taxonomyRestBase: 'categories' }),
      node('B', 'root', { isCategory: true, wpCategoryId: 20, taxonomyRestBase: 'categories' }),
      node('F', 'A'),
      node('C', 'A', { isCategory: true, taxonomyRestBase: 'categories' }),
    ],
  };
};
