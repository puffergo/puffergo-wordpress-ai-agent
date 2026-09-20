import { describe, it, expect } from 'vitest';
import { planCategories, CAT_ORDER_META, type RemoteTerm } from '../lib/categories';

const tree = {
  categories: [
    {
      name: 'Micro AC Gear Motors',
      slug: 'micro-ac-gear-motors',
      children: [{ name: 'Variable Speed Motors', slug: 'micro-ac-variable-speed-motors' }],
    },
  ],
};

describe('planCategories', () => {
  it('creates missing categories, parents first', () => {
    const { errors, ops } = planCategories(tree, []);
    expect(errors).toEqual([]);
    expect(ops.map(o => [o.op, o.slug, 'parentSlug' in o ? o.parentSlug : ''])).toEqual([
      ['create', 'micro-ac-gear-motors', ''],
      ['create', 'micro-ac-variable-speed-motors', 'micro-ac-gear-motors'],
    ]);
  });

  it('matches by slug: unchanged kept, renamed or moved updated', () => {
    const remote: RemoteTerm[] = [
      { id: 1, name: 'Micro AC Gear Motors', slug: 'micro-ac-gear-motors', description: '', parent: 0 },
      { id: 2, name: 'Speed Motors', slug: 'micro-ac-variable-speed-motors', description: '', parent: 0 },
    ];
    const { ops } = planCategories(tree, remote);
    expect(ops.map(o => o.op)).toEqual(['keep', 'update']);
  });

  it('rejects bad and duplicate slugs', () => {
    const { errors } = planCategories(
      {
        categories: [
          { name: 'A', slug: 'KOL 产品' },
          { name: 'B', slug: 'b' },
          { name: 'C', slug: 'b' },
        ],
      },
      [],
    );
    expect(errors).toHaveLength(2);
  });

  it('warns past three levels without refusing', () => {
    const deep = {
      categories: [
        {
          name: 'L1',
          slug: 'l1',
          children: [
            { name: 'L2', slug: 'l2', children: [{ name: 'L3', slug: 'l3', children: [{ name: 'L4', slug: 'l4' }] }] },
          ],
        },
      ],
    };
    const { errors, warnings, ops } = planCategories(deep, []);
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(ops).toHaveLength(4);
  });

  it('carries order through, and only updates when it differs from the site', () => {
    const remote: RemoteTerm[] = [
      { id: 1, name: 'A', slug: 'a', description: '', parent: 0, meta: { [CAT_ORDER_META]: 2 } },
      { id: 2, name: 'B', slug: 'b', description: '', parent: 0, meta: { [CAT_ORDER_META]: 9 } },
    ];
    const { errors, ops } = planCategories(
      {
        categories: [
          { name: 'A', slug: 'a', order: 2 },
          { name: 'B', slug: 'b', order: 1 },
          { name: 'C', slug: 'c', order: 3 },
        ],
      },
      remote,
    );
    expect(errors).toEqual([]);
    expect(ops).toEqual([
      { op: 'keep', id: 1, slug: 'a' },
      { op: 'update', id: 2, slug: 'b', name: 'B', description: undefined, order: 1, parentSlug: '' },
      { op: 'create', slug: 'c', name: 'C', description: undefined, order: 3, parentSlug: '' },
    ]);
  });

  it('rejects a non-positive order and warns about a duplicate among siblings', () => {
    expect(planCategories({ categories: [{ name: 'A', slug: 'a', order: 0 }] }, []).errors).toHaveLength(1);
    const { errors, warnings } = planCategories(
      {
        categories: [
          { name: 'A', slug: 'a', order: 1 },
          { name: 'B', slug: 'b', order: 1 },
        ],
      },
      [],
    );
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it('treats a term from an older plugin (no meta) as unordered', () => {
    const remote: RemoteTerm[] = [{ id: 1, name: 'A', slug: 'a', description: '', parent: 0 }];
    const { ops } = planCategories({ categories: [{ name: 'A', slug: 'a', order: 1 }] }, remote);
    expect(ops.map(o => o.op)).toEqual(['update']);
  });

  it('needs the categories array', () => {
    expect(planCategories({}, []).errors).toHaveLength(1);
  });
});
