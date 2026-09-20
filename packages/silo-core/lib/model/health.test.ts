/**
 * Unit tests for healthCheck — construct small workspaces with known problems and assert the right
 * issues (code + severity) get detected.
 */

import { describe, expect, it } from 'vitest';
import { emptyWorkspace, createNode, createContent, emptySeo } from './factory';
import { healthCheck, healthByNode } from './health';
import type { SiloWorkspace } from './types';

const baseWs = (): SiloWorkspace => emptyWorkspace({ name: 'Test Site', url: 'https://example.com' });

const codesOf = (ws: SiloWorkspace) => healthCheck(ws).map(i => i.code);

describe('healthCheck — empty workspace', () => {
  it('reports no issues', () => {
    expect(healthCheck(baseWs())).toEqual([]);
  });
});

describe('healthCheck — orphan page', () => {
  it('flags a content item with no internal links either way as critical orphan', () => {
    const node = createNode('n', 'pillar', null);
    const content = createContent(node.id, 'Lonely Page');
    const ws = { ...baseWs(), nodes: [node], contents: [content] };
    const issues = healthCheck(ws);
    const orphan = issues.find(i => i.code === 'orphan');
    expect(orphan).toBeDefined();
    expect(orphan?.severity).toBe('critical');
    expect(orphan?.nodeIds).toEqual([content.id]);
  });

  it('does not flag orphan when the content has at least one internal link', () => {
    const node = createNode('n', 'pillar', null);
    const a = createContent(node.id, 'A');
    const b = createContent(node.id, 'B');
    const ws: SiloWorkspace = {
      ...baseWs(),
      nodes: [node],
      contents: [a, b],
      edges: [{ from: a.id, to: b.id, type: 'internal-link' }],
    };
    expect(codesOf(ws)).not.toContain('orphan');
  });
});

describe('healthCheck — no-focus keyword', () => {
  it('flags content with no core keyword as critical', () => {
    const node = createNode('n', 'pillar', null);
    const content = createContent(node.id, 'No Keyword Page');
    const ws = { ...baseWs(), nodes: [node], contents: [content] };
    const issue = healthCheck(ws).find(i => i.code === 'no-focus');
    expect(issue?.severity).toBe('critical');
  });

  it('does not flag when a non-blank core keyword exists', () => {
    const node = createNode('n', 'pillar', null);
    const content = createContent(node.id, 'Has Keyword', 'post', {
      seo: { ...emptySeo(), coreKeywords: ['solar light'] },
    });
    const ws = { ...baseWs(), nodes: [node], contents: [content] };
    expect(codesOf(ws)).not.toContain('no-focus');
  });
});

describe('healthCheck — missing / truncated SEO meta', () => {
  it('flags blank title and description separately', () => {
    const node = createNode('n', 'pillar', null);
    const content = createContent(node.id, 'Bare Page');
    const ws = { ...baseWs(), nodes: [node], contents: [content] };
    const codes = codesOf(ws);
    expect(codes).toContain('missing-seo-title');
    expect(codes).toContain('missing-seo-desc');
  });

  it('flags an over-length title as meta-truncated (warning)', () => {
    const node = createNode('n', 'pillar', null);
    const content = createContent(node.id, 'Long Title Page', 'post', {
      seo: {
        ...emptySeo(),
        title: 'x'.repeat(61),
        description: 'a fine description that is well within the display limit.',
      },
    });
    const ws = { ...baseWs(), nodes: [node], contents: [content] };
    const issue = healthCheck(ws).find(i => i.code === 'meta-truncated');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('warning');
  });

  it('measures width: 25 Chinese characters (width 50) is a good title, 35 (width 70) is long', () => {
    const node = createNode('n', 'pillar', null);
    const seo = (title: string) => ({ ...emptySeo(), title, description: '说明'.repeat(35) });
    const ok = createContent(node.id, 'A', 'post', { seo: seo('中'.repeat(25)) });
    const long = createContent(node.id, 'B', 'post', { seo: seo('中'.repeat(35)) });
    const issues = healthCheck({ ...baseWs(), nodes: [node], contents: [ok, long] });
    expect(issues.filter(i => i.code === 'meta-truncated' || i.code === 'meta-too-short').map(i => i.nodeIds)).toEqual([
      [long.id],
    ]);
  });

  it("uses the site's limits kept in the workspace (from the last import)", () => {
    const node = createNode('n', 'pillar', null);
    const content = createContent(node.id, 'A', 'post', {
      seo: { ...emptySeo(), title: 'x'.repeat(65), description: 'd'.repeat(130) },
    });
    const limits = {
      titleRecommended: [30, 70] as [number, number],
      descriptionRecommended: [120, 160] as [number, number],
      coreKeywordsMax: 1,
      longTailKeywordsMax: 5,
    };
    try {
      expect(codesOf({ ...baseWs(), nodes: [node], contents: [content], seoLimits: limits })).not.toContain(
        'meta-truncated',
      );
    } finally {
      healthCheck({ ...baseWs(), seoLimits: { ...limits, titleRecommended: [30, 60], longTailKeywordsMax: 4 } });
    }
  });
});

describe('healthCheck — focus keyword not in title', () => {
  it('flags when the core keyword does not appear in a non-blank title', () => {
    const node = createNode('n', 'pillar', null);
    const content = createContent(node.id, 'Page', 'post', {
      seo: { ...emptySeo(), title: 'Everything About Lighting', coreKeywords: ['solar street light'] },
    });
    const ws = { ...baseWs(), nodes: [node], contents: [content] };
    expect(codesOf(ws)).toContain('focus-not-in-title');
  });

  it('does not flag when the title contains the keyword (case-insensitive)', () => {
    const node = createNode('n', 'pillar', null);
    const content = createContent(node.id, 'Page', 'post', {
      seo: { ...emptySeo(), title: 'Best SOLAR STREET LIGHT Guide', coreKeywords: ['solar street light'] },
    });
    const ws = { ...baseWs(), nodes: [node], contents: [content] };
    expect(codesOf(ws)).not.toContain('focus-not-in-title');
  });
});

describe('healthCheck — thin internal links', () => {
  it('flags a non-orphan page (has inbound) with zero outbound links', () => {
    const node = createNode('n', 'pillar', null);
    const a = createContent(node.id, 'A');
    const b = createContent(node.id, 'B');
    // a -> b : a has outbound, b has inbound only (zero outbound) => b is thin, not orphan
    const ws: SiloWorkspace = {
      ...baseWs(),
      nodes: [node],
      contents: [a, b],
      edges: [{ from: a.id, to: b.id, type: 'internal-link' }],
    };
    const issues = healthCheck(ws);
    expect(issues.some(i => i.code === 'thin-internal-links' && i.nodeIds.includes(b.id))).toBe(true);
    expect(issues.some(i => i.code === 'thin-internal-links' && i.nodeIds.includes(a.id))).toBe(false);
  });
});

describe('healthCheck — cannibalization', () => {
  it('flags two pages competing for the same core keyword as a single bundled critical issue', () => {
    const node = createNode('n', 'pillar', null);
    const a = createContent(node.id, 'A', 'post', { seo: { ...emptySeo(), coreKeywords: ['solar light'] } });
    const b = createContent(node.id, 'B', 'post', { seo: { ...emptySeo(), coreKeywords: ['Solar Light'] } });
    const ws = { ...baseWs(), nodes: [node], contents: [a, b] };
    const issues = healthCheck(ws).filter(i => i.code === 'cannibalization');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('critical');
    expect(issues[0].nodeIds.sort()).toEqual([a.id, b.id].sort());
  });

  it('does not flag a single page owning a core keyword', () => {
    const node = createNode('n', 'pillar', null);
    const a = createContent(node.id, 'A', 'post', { seo: { ...emptySeo(), coreKeywords: ['solar light'] } });
    const ws = { ...baseWs(), nodes: [node], contents: [a] };
    expect(codesOf(ws)).not.toContain('cannibalization');
  });
});

describe('healthCheck — empty pillar', () => {
  it('flags a top-level node whose whole subtree has no content', () => {
    const pillar = createNode('p', 'pillar', null);
    const ws = { ...baseWs(), nodes: [pillar] };
    const issue = healthCheck(ws).find(i => i.code === 'empty-pillar');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('warning');
    expect(issue?.nodeIds).toEqual([pillar.id]);
  });

  it('does not flag a pillar whose cluster (not itself) holds content', () => {
    const pillar = createNode('p', 'pillar', null);
    const cluster = createNode('c', 'cluster', pillar.id);
    const content = createContent(cluster.id, 'Under cluster');
    const ws = { ...baseWs(), nodes: [pillar, cluster], contents: [content] };
    expect(codesOf(ws)).not.toContain('empty-pillar');
  });

  it('does not flag system holding nodes', () => {
    const sysNode = createNode('sys', 'pillar', null, { system: true });
    const ws = { ...baseWs(), nodes: [sysNode] };
    expect(codesOf(ws)).not.toContain('empty-pillar');
  });
});

describe('healthCheck — category archive with no SEO', () => {
  it('flags an isCategory node with blank title/description', () => {
    const cat = createNode('cat', 'pillar', null, { isCategory: true, wpCategoryId: 5 });
    const ws = { ...baseWs(), nodes: [cat] };
    const issue = healthCheck(ws).find(i => i.code === 'category-no-seo');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('warning');
  });

  it('does not flag when both title and description are filled', () => {
    const cat = createNode('cat', 'pillar', null, {
      isCategory: true,
      wpCategoryId: 5,
      seo: { ...emptySeo(), title: 'Category Title', description: 'Category description text.' },
    });
    const ws = { ...baseWs(), nodes: [cat] };
    expect(codesOf(ws)).not.toContain('category-no-seo');
  });

  it('does not flag a non-category node even with blank seo', () => {
    const node = createNode('n', 'pillar', null);
    const ws = { ...baseWs(), nodes: [node] };
    expect(codesOf(ws)).not.toContain('category-no-seo');
  });
});

describe('healthCheck — keyword gap', () => {
  it('flags a planned keyword with zero usage anywhere', () => {
    const ws: SiloWorkspace = { ...baseWs(), keywords: [{ id: 'k1', term: 'planned but unwritten', source: 'local' }] };
    const issue = healthCheck(ws).find(i => i.code === 'keyword-gap');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('warning');
    expect(issue?.term).toBe('planned but unwritten');
  });

  it('does not flag a keyword that is used by some content', () => {
    const node = createNode('n', 'pillar', null);
    const content = createContent(node.id, 'A', 'post', { seo: { ...emptySeo(), coreKeywords: ['solar light'] } });
    const ws: SiloWorkspace = {
      ...baseWs(),
      nodes: [node],
      contents: [content],
      keywords: [{ id: 'k1', term: 'solar light', source: 'local' }],
    };
    expect(codesOf(ws)).not.toContain('keyword-gap');
  });
});

describe('healthCheck — unsynced (dirty) content', () => {
  it('flags content with dirtyAt set as an info-level issue', () => {
    const node = createNode('n', 'pillar', null);
    const content = createContent(node.id, 'A', 'post', { dirtyAt: '2026-07-20T00:00:00Z' });
    const ws = { ...baseWs(), nodes: [node], contents: [content] };
    const issue = healthCheck(ws).find(i => i.code === 'unsynced');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('info');
  });
});

describe('healthCheck — stale draft', () => {
  it('flags a pushed draft whose remote copy has not changed in >= 30 days', () => {
    const node = createNode('n', 'pillar', null);
    const oldDate = new Date(Date.now() - 40 * 86_400_000).toISOString();
    const content = createContent(node.id, 'A', 'post', {
      wpPostId: 1,
      wpStatus: 'draft',
      lastModifiedRemote: oldDate,
    });
    const ws = { ...baseWs(), nodes: [node], contents: [content] };
    const issue = healthCheck(ws).find(i => i.code === 'stale-draft');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('info');
  });

  it('does not flag a recently-modified draft', () => {
    const node = createNode('n', 'pillar', null);
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const content = createContent(node.id, 'A', 'post', {
      wpPostId: 1,
      wpStatus: 'draft',
      lastModifiedRemote: recent,
    });
    const ws = { ...baseWs(), nodes: [node], contents: [content] };
    expect(codesOf(ws)).not.toContain('stale-draft');
  });

  it('does not flag a draft that has never been pushed (no wpPostId)', () => {
    const node = createNode('n', 'pillar', null);
    const content = createContent(node.id, 'A', 'post', { wpStatus: 'draft' });
    const ws = { ...baseWs(), nodes: [node], contents: [content] };
    expect(codesOf(ws)).not.toContain('stale-draft');
  });
});

describe('healthCheck — cross-silo link', () => {
  it('bundles cross-pillar internal links into one info-level issue with a count', () => {
    const pillarA = createNode('pa', 'pillar', null);
    const pillarB = createNode('pb', 'pillar', null);
    const a = createContent(pillarA.id, 'A');
    const b = createContent(pillarB.id, 'B');
    const ws: SiloWorkspace = {
      ...baseWs(),
      nodes: [pillarA, pillarB],
      contents: [a, b],
      edges: [{ from: a.id, to: b.id, type: 'internal-link' }],
    };
    const issue = healthCheck(ws).find(i => i.code === 'cross-silo-link');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('info');
    expect(issue?.title).toContain('1');
  });

  it('does not flag links within the same pillar', () => {
    const pillar = createNode('p', 'pillar', null);
    const a = createContent(pillar.id, 'A');
    const b = createContent(pillar.id, 'B');
    const ws: SiloWorkspace = {
      ...baseWs(),
      nodes: [pillar],
      contents: [a, b],
      edges: [{ from: a.id, to: b.id, type: 'internal-link' }],
    };
    expect(codesOf(ws)).not.toContain('cross-silo-link');
  });
});

describe('healthCheck — sort order', () => {
  it('ranks issues critical -> warning -> info', () => {
    const node = createNode('n', 'pillar', null);
    // A lone content: triggers orphan+no-focus (critical) and missing-seo-title/desc (warning).
    const content = createContent(node.id, 'Bare');
    const ws = { ...baseWs(), nodes: [node], contents: [content] };
    const severities = healthCheck(ws).map(i => i.severity);
    const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    for (let i = 1; i < severities.length; i++) {
      expect(order[severities[i]]).toBeGreaterThanOrEqual(order[severities[i - 1]]);
    }
  });
});

describe('healthByNode', () => {
  it('groups issues by node id and tracks the worst severity per node', () => {
    const node = createNode('n', 'pillar', null);
    const content = createContent(node.id, 'Bare'); // orphan(critical) + no-focus(critical) + 2 warnings
    const ws = { ...baseWs(), nodes: [node], contents: [content] };
    const issues = healthCheck(ws);
    const byNode = healthByNode(issues);
    expect(byNode[content.id]).toBeDefined();
    expect(byNode[content.id].worst).toBe('critical');
    expect(byNode[content.id].issues.length).toBeGreaterThan(1);
  });

  it('excludes nodeless issues (e.g. keyword gaps) from the per-node map', () => {
    const ws: SiloWorkspace = { ...baseWs(), keywords: [{ id: 'k1', term: 'gap term', source: 'local' }] };
    const issues = healthCheck(ws);
    const byNode = healthByNode(issues);
    expect(Object.keys(byNode)).toHaveLength(0);
  });
});

describe('healthCheck — meta too short', () => {
  it('flags a non-blank title/description below the min length as warning', () => {
    const node = createNode('n', 'pillar', null);
    const content = createContent(node.id, 'Short Meta', 'post', {
      seo: { ...emptySeo(), title: 'Solar lights', description: 'Cheap solar lights.', coreKeywords: ['solar lights'] },
    });
    const ws = { ...baseWs(), nodes: [node], contents: [content] };
    const issue = healthCheck(ws).find(i => i.code === 'meta-too-short');
    expect(issue?.severity).toBe('warning');
  });

  it('does not flag when title and description are within range', () => {
    const node = createNode('n', 'pillar', null);
    const content = createContent(node.id, 'Good Meta', 'post', {
      seo: {
        ...emptySeo(),
        title: 'Best Solar Street Lights for Off-Grid Rural Roads in 2026',
        description:
          'A practical buyer’s guide to solar street lights for off-grid rural roads: lumens, battery, and how to pick the right model for your budget today.',
        coreKeywords: ['solar street lights'],
      },
    });
    const ws = { ...baseWs(), nodes: [node], contents: [content] };
    expect(codesOf(ws)).not.toContain('meta-too-short');
  });
});

describe('healthCheck — too many focus keywords', () => {
  it('flags more than one core keyword as warning', () => {
    const node = createNode('n', 'pillar', null);
    const content = createContent(node.id, 'Two Cores', 'post', {
      seo: { ...emptySeo(), coreKeywords: ['solar light', 'street light'] },
    });
    const ws = { ...baseWs(), nodes: [node], contents: [content] };
    const issue = healthCheck(ws).find(i => i.code === 'too-many-keywords');
    expect(issue?.severity).toBe('warning');
  });

  it('flags when total focus keywords exceed 5 (1 core + >4 long-tail)', () => {
    const node = createNode('n', 'pillar', null);
    const content = createContent(node.id, 'Overflow', 'post', {
      seo: { ...emptySeo(), coreKeywords: ['a'], longTailKeywords: ['b', 'c', 'd', 'e', 'f'] },
    });
    const ws = { ...baseWs(), nodes: [node], contents: [content] };
    expect(codesOf(ws)).toContain('too-many-keywords');
  });

  it('does not flag exactly 1 core + 4 long-tail', () => {
    const node = createNode('n', 'pillar', null);
    const content = createContent(node.id, 'At Cap', 'post', {
      seo: { ...emptySeo(), coreKeywords: ['a'], longTailKeywords: ['b', 'c', 'd', 'e'] },
    });
    const ws = { ...baseWs(), nodes: [node], contents: [content] };
    expect(codesOf(ws)).not.toContain('too-many-keywords');
  });
});

describe('healthCheck — broken internal links', () => {
  const wsWith = (brokenLinks: SiloWorkspace['brokenLinks']): SiloWorkspace => {
    const node = createNode('n', 'pillar', null);
    const a = createContent(node.id, 'A');
    const b = createContent(node.id, 'B');
    return {
      ...baseWs(),
      nodes: [node],
      contents: [a, b],
      edges: [
        { from: a.id, to: b.id, type: 'internal-link' },
        { from: b.id, to: a.id, type: 'internal-link' },
      ],
      brokenLinks: brokenLinks?.map(l => ({ ...l, from: l.from === 'A' ? a.id : l.from })),
    };
  };

  it('reports nothing when the field is absent — never-checked must not read as none-broken', () => {
    expect(codesOf(wsWith(undefined))).not.toContain('broken-link');
  });

  it('flags a dead link as a warning', () => {
    const issues = healthCheck(
      wsWith([{ from: 'A', href: '/terms', url: 'https://example.com/terms', anchor: 'Terms', status: 404 }]),
    );
    const broken = issues.filter(i => i.code === 'broken-link');
    expect(broken).toHaveLength(1);
    expect(broken[0].severity).toBe('warning');
    expect(broken[0].detail).toContain('404');
  });

  it('groups by target URL so one dead footer link is one issue, listing every affected page', () => {
    const node = createNode('n', 'pillar', null);
    const a = createContent(node.id, 'A');
    const b = createContent(node.id, 'B');
    const url = 'https://example.com/terms';
    const ws: SiloWorkspace = {
      ...baseWs(),
      nodes: [node],
      contents: [a, b],
      brokenLinks: [
        { from: a.id, href: '/terms', url, anchor: 'Terms', placement: 'footer', status: 404 },
        { from: b.id, href: '/terms', url, anchor: 'Terms', placement: 'footer', status: 404 },
      ],
    };
    const broken = healthCheck(ws).filter(i => i.code === 'broken-link');
    expect(broken).toHaveLength(1);
    expect(broken[0].nodeIds.sort()).toEqual([a.id, b.id].sort());
    // Template placement means it is on every page — the title has to say so.
    expect(broken[0].title).toContain('全站');
  });

  it('separates distinct dead targets into distinct issues', () => {
    const node = createNode('n', 'pillar', null);
    const a = createContent(node.id, 'A');
    const ws: SiloWorkspace = {
      ...baseWs(),
      nodes: [node],
      contents: [a],
      brokenLinks: [
        { from: a.id, href: '/terms', url: 'https://example.com/terms', anchor: 'Terms', status: 404 },
        { from: a.id, href: '/privacy', url: 'https://example.com/privacy', anchor: 'Privacy', status: 410 },
      ],
    };
    expect(healthCheck(ws).filter(i => i.code === 'broken-link')).toHaveLength(2);
  });
});
