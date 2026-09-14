/**
 * Unit tests for the factory helpers: id generation and empty-shape constructors.
 */

import { describe, expect, it } from 'vitest';
import { newId, emptySeo, emptyWorkspace, createNode, createContent } from './factory';
import { SILO_WORKSPACE_VERSION } from './types';

describe('newId', () => {
  it('prefixes the id with the given prefix', () => {
    expect(newId('n')).toMatch(/^n_/);
    expect(newId('k')).toMatch(/^k_/);
  });

  it('generates distinct ids on successive calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newId('x')));
    expect(ids.size).toBe(50);
  });
});

describe('emptySeo', () => {
  it('returns blank strings and empty keyword arrays', () => {
    expect(emptySeo()).toEqual({ title: '', description: '', coreKeywords: [], longTailKeywords: [] });
  });

  it('returns a fresh object each call (no shared array refs)', () => {
    const a = emptySeo();
    const b = emptySeo();
    expect(a).not.toBe(b);
    expect(a.coreKeywords).not.toBe(b.coreKeywords);
  });
});

describe('emptyWorkspace', () => {
  it('creates a workspace at the current schema version with empty collections', () => {
    const profile = { name: 'Test', url: 'https://example.com' };
    const ws = emptyWorkspace(profile);
    expect(ws.version).toBe(SILO_WORKSPACE_VERSION);
    expect(ws.profile).toBe(profile);
    expect(ws.nodes).toEqual([]);
    expect(ws.contents).toEqual([]);
    expect(ws.edges).toEqual([]);
    expect(ws.keywords).toEqual([]);
  });
});

describe('createNode', () => {
  it('defaults wpCategoryId to null and assigns a fresh id', () => {
    const n = createNode('solar light', 'pillar', null);
    expect(n.wpCategoryId).toBeNull();
    expect(n.id).toMatch(/^n_/);
    expect(n.term).toBe('solar light');
    expect(n.kind).toBe('pillar');
    expect(n.parentId).toBeNull();
  });

  it('lets extra fields override the defaults', () => {
    const n = createNode('cat', 'pillar', null, { wpCategoryId: 7, isCategory: true });
    expect(n.wpCategoryId).toBe(7);
    expect(n.isCategory).toBe(true);
  });
});

describe('createContent', () => {
  it('defaults postType to "post" and sync/remote fields to null', () => {
    const c = createContent('n1', 'My Post');
    expect(c.postType).toBe('post');
    expect(c.wpPostId).toBeNull();
    expect(c.seoSyncedAt).toBeNull();
    expect(c.lastModifiedRemote).toBeNull();
    expect(c.seo).toEqual(emptySeo());
  });

  it('honors an explicit postType and extra overrides', () => {
    const c = createContent('n1', 'My Product', 'product', { wpPostId: 99 });
    expect(c.postType).toBe('product');
    expect(c.wpPostId).toBe(99);
  });
});
