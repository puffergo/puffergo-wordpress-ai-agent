import { describe, it, expect } from 'vitest';
import { planCategories, type RemoteTerm } from '../lib/categories';

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

  it('needs the categories array', () => {
    expect(planCategories({}, []).errors).toHaveLength(1);
  });
});
