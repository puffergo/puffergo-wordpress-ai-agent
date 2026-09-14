/**
 * Region attribution in parseLinks — the part that decides whether a link counts as an in-context
 * body link or as template boilerplate. Getting this wrong is silent and consequential: mislabelling
 * a body link as nav buries a real relationship under 30% opacity.
 */

import { describe, it, expect } from 'vitest';
import { parseLinks, isFallbackPermalink } from './parse-links';

const SITE = 'https://example.com';
const at = (html: string, href: string) => parseLinks(html, SITE, `${SITE}/post/`).internal.find(l => l.href === href);

describe('parseLinks — placement', () => {
  it('treats a bare content fragment as all body (no template markup exists there)', () => {
    const links = parseLinks('<p>see <a href="/a/">A</a> and <a href="/b/">B</a></p>', SITE, `${SITE}/post/`).internal;
    expect(links.map(l => l.placement)).toEqual(['body', 'body']);
  });

  it('attributes header / nav / footer / body from semantic landmarks', () => {
    const html = `
      <header><a href="/logo/">Home</a><nav><a href="/nav/">Products</a></nav></header>
      <main><p><a href="/body/">in context</a></p></main>
      <footer><a href="/foot/">Privacy</a></footer>`;
    expect(at(html, '/logo/')?.placement).toBe('nav');
    expect(at(html, '/nav/')?.placement).toBe('nav');
    expect(at(html, '/body/')?.placement).toBe('body');
    expect(at(html, '/foot/')?.placement).toBe('footer');
  });

  it('keeps the outer region when a nav is nested inside a header', () => {
    // The inner </nav> must not end the header early, or everything after it becomes 'body'.
    const html = `<header><nav><a href="/x/">X</a></nav><a href="/y/">Y</a></header><p><a href="/z/">Z</a></p>`;
    expect(at(html, '/x/')?.placement).toBe('nav');
    expect(at(html, '/y/')?.placement).toBe('nav');
    expect(at(html, '/z/')?.placement).toBe('body');
  });

  it('handles sibling navs (a second nav must reopen a region)', () => {
    const html = `<nav><a href="/n1/">1</a></nav><p><a href="/b/">b</a></p><nav><a href="/n2/">2</a></nav>`;
    expect(at(html, '/n1/')?.placement).toBe('nav');
    expect(at(html, '/b/')?.placement).toBe('body');
    expect(at(html, '/n2/')?.placement).toBe('nav');
  });

  it('falls back to WP-standard ids when the theme has no landmarks, clipped by the next region', () => {
    const html = `
      <div id="masthead"><a href="/m/">Menu</a></div>
      <footer><a href="/f/">Footer</a></footer>`;
    expect(at(html, '/m/')?.placement).toBe('nav');
    expect(at(html, '/f/')?.placement).toBe('footer');
  });

  it('degrades to body for a theme using none of the known markers', () => {
    const html = `<div class="mystery-topbar"><a href="/t/">Top</a></div><p><a href="/b/">b</a></p>`;
    expect(at(html, '/t/')?.placement).toBe('body');
    expect(at(html, '/b/')?.placement).toBe('body');
  });

  it('still splits internal vs external and reads nofollow inside a template region', () => {
    const html = `<footer><a href="https://other.com/" rel="nofollow">Partner</a></footer>`;
    const { external } = parseLinks(html, SITE, `${SITE}/post/`);
    expect(external).toHaveLength(1);
    expect(external[0].dofollow).toBe(false);
    expect(external[0].placement).toBe('footer');
  });
});

describe('parseLinks — non-markup is not a link', () => {
  it('ignores anchors built inside inline script/style/template/noscript', () => {
    // Taken from a real site, whose inline JS produced three phantom links before this was masked.
    const html = `
      <script>const waUrl = '<a href="https://wa.me/123">chat</a>'; document.write(waUrl);</script>
      <template><a href="/tmpl/">never rendered</a></template>
      <noscript><a href="/nos/">fallback</a></noscript>
      <p><a href="/real/">real</a></p>`;
    const { internal, external } = parseLinks(html, SITE, `${SITE}/post/`);
    expect(internal.map(l => l.href)).toEqual(['/real/']);
    expect(external).toHaveLength(0);
  });

  it('keeps byte offsets intact so masking does not shift placement', () => {
    const html = `<header><script>var x = 1;</script><a href="/nav/">N</a></header><p><a href="/b/">B</a></p>`;
    expect(at(html, '/nav/')?.placement).toBe('nav');
    expect(at(html, '/b/')?.placement).toBe('body');
  });
});

describe('isFallbackPermalink', () => {
  it('flags the ugly permalinks WordPress serves for slugless posts', () => {
    expect(isFallbackPermalink(`${SITE}/?page_id=42`)).toBe(true);
    expect(isFallbackPermalink(`${SITE}/?p=7`)).toBe(true);
    expect(isFallbackPermalink('/?page_id=42', SITE)).toBe(true);
  });

  it('leaves real URLs alone — including a `p` param that is just pagination', () => {
    expect(isFallbackPermalink(`${SITE}/about-us/`)).toBe(false);
    // Non-empty path: canon() keeps it distinct from the site root, so it needs no id lookup.
    expect(isFallbackPermalink(`${SITE}/blog/?p=2`)).toBe(false);
    expect(isFallbackPermalink(`${SITE}/`)).toBe(false);
    expect(isFallbackPermalink('not a url')).toBe(false);
  });
});
