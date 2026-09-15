import { describe, expect, it } from 'vitest';
import { emptyWorkspace, createNode, createContent } from '../model/factory';
import {
  slugify,
  contentDirSegments,
  contentFileBaseName,
  contentFileFallbackName,
  renderFrontmatter,
  parseFrontmatterEdits,
  wikilinkTarget,
  splitFrontmatter,
  siloIdOf,
  applyFrontmatterEdits,
} from './frontmatter';

describe('slugify', () => {
  it('lowercases, replaces non-alphanumerics with hyphens, trims edge hyphens', () => {
    expect(slugify('How Do Solar Street Lights Work?')).toBe('how-do-solar-street-lights-work');
  });
  it('falls back to "untitled" for a string with no letters/digits', () => {
    expect(slugify('   ???   ')).toBe('untitled');
  });
});

function buildWorkspace() {
  let ws = emptyWorkspace({ name: 'My Site', url: 'https://x.test' });
  const pillar = createNode('Solar Street Light', 'pillar', null);
  const cluster = createNode('How It Works', 'cluster', pillar.id);
  ws = { ...ws, nodes: [pillar, cluster] };
  const content = createContent(cluster.id, 'How Do Solar Street Lights Work?', 'post', {
    slug: 'how-do-solar-street-lights-work',
    seo: { title: 'T', description: 'D', coreKeywords: ['k'], longTailKeywords: [] },
  });
  ws = { ...ws, contents: [content] };
  return { ws, pillar, cluster, content };
}

describe('contentDirSegments / contentFileBaseName', () => {
  it('mirrors the pillar→cluster path as slugified folder segments', () => {
    const { ws, content } = buildWorkspace();
    expect(contentDirSegments(ws, content)).toEqual(['solar-street-light', 'how-it-works']);
  });

  it('names a note after its title, with characters Obsidian forbids swapped for full-width look-alikes', () => {
    const { content } = buildWorkspace();
    expect(contentFileBaseName(content)).toBe('How Do Solar Street Lights Work？');
    expect(contentFileBaseName({ ...content, title: 'WordPress 收不到邮件？SMTP: A/B | C' })).toBe(
      'WordPress 收不到邮件？SMTP： A／B ｜ C',
    );
    expect(contentFileBaseName({ ...content, title: '首页 &#8211; English' })).toBe('首页 – English');
  });

  it('falls back to slug, then id, when the title is empty', () => {
    const { content } = buildWorkspace();
    expect(contentFileBaseName({ ...content, title: '  ' })).toBe('how-do-solar-street-lights-work');
    expect(contentFileBaseName({ ...content, title: '', slug: undefined })).toBe(content.id);
    expect(contentFileFallbackName(content)).toBe('how-do-solar-street-lights-work');
  });
});

describe('renderFrontmatter aliases', () => {
  it('emits the slug as an Obsidian alias so [[slug]] links resolve to a title-named note', () => {
    const { ws, content } = buildWorkspace();
    const fm = splitFrontmatter(renderFrontmatter(ws, content, [], [])).fm;
    expect(fm).toContain('aliases:\n  - "how-do-solar-street-lights-work"');
    expect(renderFrontmatter(ws, { ...content, slug: undefined }, [], [])).not.toContain('aliases:');
  });
});

describe('renderFrontmatter + parseFrontmatterEdits round-trip', () => {
  it('round-trips every editable field through render → split → parse', () => {
    const { ws, content } = buildWorkspace();
    const fmText = renderFrontmatter(
      ws,
      content,
      ['[[sibling-slug]]'],
      ['https://example.org/standard'],
      'why this page exists',
    );
    const { fm } = splitFrontmatter(fmText + '\nBody text.\n');
    const edits = parseFrontmatterEdits(fm);

    expect(edits).toEqual({
      title: content.title,
      slug: content.slug,
      purpose: 'why this page exists',
      seoTitle: 'T',
      seoDescription: 'D',
      coreKeywords: ['k'],
      longTailKeywords: [],
      internalLinks: ['[[sibling-slug]]'],
      externalLinks: ['https://example.org/standard'],
    });
  });

  it('keeps silo:/wp: nested and out of the editable-fields parse (system-owned, read-only)', () => {
    const { ws, content } = buildWorkspace();
    const withWp = { ...content, wpPostId: 42, wpLink: 'https://x.test/?p=42' };
    const fmText = renderFrontmatter(ws, withWp, [], []);
    const edits = parseFrontmatterEdits(splitFrontmatter(fmText).fm);
    expect(edits).not.toHaveProperty('silo');
    expect(edits).not.toHaveProperty('wp');
  });
});

describe('splitFrontmatter / siloIdOf', () => {
  it('separates the frontmatter block from the body', () => {
    const raw = '---\nsilo:\n  id: c_abc123\n---\nHello body.\n';
    const { fm, body } = splitFrontmatter(raw);
    expect(fm).toBe('silo:\n  id: c_abc123');
    expect(body).toBe('Hello body.\n');
  });

  it('treats a file with no frontmatter block as pure body', () => {
    expect(splitFrontmatter('just a note, no frontmatter')).toEqual({ fm: '', body: 'just a note, no frontmatter' });
  });

  it('extracts the silo content id from the id: line under silo:', () => {
    expect(siloIdOf('silo:\n  id: c_a1b2c3\n  node: "x"')).toBe('c_a1b2c3');
    expect(siloIdOf('title: no silo block here')).toBeNull();
  });
});

describe('wikilinkTarget', () => {
  it('strips [[...]] and any #heading/|alias suffix down to the bare slug', () => {
    expect(wikilinkTarget('[[my-slug]]')).toBe('my-slug');
    expect(wikilinkTarget('[[my-slug|Display Text]]')).toBe('my-slug');
    expect(wikilinkTarget('[[my-slug#section]]')).toBe('my-slug');
  });
});

describe('applyFrontmatterEdits', () => {
  it('applies a changed SEO field and reports it as changed', () => {
    const { ws, content } = buildWorkspace();
    const fm = 'seoTitle: "New Title"\nseoDescription: "D"\ncoreKeywords: ["k"]\nlongTailKeywords: []\n';
    const { ws: next, changed } = applyFrontmatterEdits(ws, new Map([[content.id, { fm }]]));

    expect(changed).toBe(1);
    expect(next.contents[0].seo.title).toBe('New Title');
  });

  it('is a no-op (changed: 0) when the frontmatter matches the model exactly', () => {
    const { ws, content } = buildWorkspace();
    const fm = `seoTitle: "${content.seo.title}"\nseoDescription: "${content.seo.description}"\ncoreKeywords: ["k"]\nlongTailKeywords: []\n`;
    const { changed } = applyFrontmatterEdits(ws, new Map([[content.id, { fm }]]));
    expect(changed).toBe(0);
  });

  it('skips a note whose YAML fails to parse, keeping the model value', () => {
    const { ws, content } = buildWorkspace();
    const { ws: next, changed } = applyFrontmatterEdits(ws, new Map([[content.id, { fm: 'seoTitle: "unterminated' }]]));
    expect(changed).toBe(0);
    expect(next.contents[0].seo.title).toBe(content.seo.title);
  });

  it('resolves an internal [[wikilink]] to the sibling content id as an edge', () => {
    const { ws, content } = buildWorkspace();
    const sibling = createContent(content.siloNodeId, 'Sibling', 'post', { slug: 'sibling-slug' });
    const ws2 = { ...ws, contents: [...ws.contents, sibling] };
    const fm = `internalLinks: ["[[sibling-slug]]"]\n`;
    const { ws: next } = applyFrontmatterEdits(ws2, new Map([[content.id, { fm }]]));
    expect(next.edges).toContainEqual({ from: content.id, to: sibling.id, type: 'internal-link' });
  });

  it('resolves an internal link written with the note file name (the scanned path wins over the title)', () => {
    const { ws, content } = buildWorkspace();
    const sibling = createContent(content.siloNodeId, 'Sibling', 'post', { slug: 'sibling-slug' });
    const ws2 = { ...ws, contents: [...ws.contents, sibling] };
    const fm = `internalLinks: ["[[Sibling renamed]]"]\n`;
    const scanned = new Map([
      [content.id, { fm }],
      [sibling.id, { fm: '', path: 'site/docs/Sibling renamed.md' }],
    ]);
    const { ws: next } = applyFrontmatterEdits(ws2, scanned);
    expect(next.edges).toContainEqual({ from: content.id, to: sibling.id, type: 'internal-link' });
  });
});
