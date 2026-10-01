/**
 * `puffergo site setup` — probe-only by default, install only with the customer's own words, and a
 * manual-install fallback when the account can't touch plugins. Driven through the real command code
 * with a stubbed fetch answering each endpoint by URL.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdSiteSetup } from '../lib/siteSetupCmd';
import { writeActiveDomain } from '../adapters/fileStore';

const SITE = 'http://setup.test';

/** Each endpoint the probe touches, keyed by a substring of its URL. */
interface Answers {
  index?: { namespaces: string[] };
  me?: number; // HTTP status for /wp/v2/users/me
  plugins?: { status: number; body: unknown };
  schema?: { status: number; body: unknown };
  install?: Array<{ url: string; body: unknown }>; // recorded POST bodies
}

function stubEndpoints(a: Answers) {
  const posts: Array<{ url: string; body: unknown }> = [];
  // Stateful: an install POST makes later GETs (the post-install re-probe) see the plugin active,
  // exactly like a real site would.
  const installed = new Set<string>();
  vi.stubGlobal('fetch', async (url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === 'POST') {
      const body = init.body ? (JSON.parse(init.body) as { slug?: string }) : undefined;
      posts.push({ url, body });
      if (body?.slug) installed.add(body.slug);
      return new Response(JSON.stringify({ status: 'active' }), { status: 200 });
    }
    // Most-specific first: every endpoint URL contains `/wp-json/`, so the bare index must be last.
    if (url.includes('get-product-schema')) {
      const s = a.schema ?? { status: 404, body: { code: 'rest_no_route' } };
      if (installed.has('puffergo')) return new Response(JSON.stringify({ schemaVersion: 6 }), { status: 200 });
      return new Response(JSON.stringify(s.body), { status: s.status });
    }
    if (url.includes('/wp/v2/plugins')) {
      const p = a.plugins ?? { status: 403, body: { code: 'rest_forbidden' } };
      if (p.status !== 200) return new Response(JSON.stringify(p.body), { status: p.status });
      const rows = [
        ...(Array.isArray(p.body) ? (p.body as unknown[]) : []),
        ...[...installed].map(slug => ({ plugin: `${slug}/${slug}.php`, textdomain: slug, status: 'active' })),
      ];
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    if (url.includes('/users/me')) return new Response('{}', { status: a.me ?? 200 });
    if (url.includes('/wp-json/')) return new Response(JSON.stringify(a.index ?? { namespaces: [] }));
    return new Response('{}', { status: 404 });
  });
  return posts;
}

async function workdir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pg-setup-'));
  const store = join(dir, 'credentials.json');
  await writeFile(store, JSON.stringify({ sites: { [SITE]: { username: 'u', appPassword: 'p' } } }));
  process.env.PUFFERGO_CONFIG = store;
  await writeActiveDomain(dir, SITE);
  return dir;
}

const ctx = (dir: string, positional: string[] = [], flags: Record<string, string> = {}) => ({
  dir,
  positional,
  flags: new Map(Object.entries(flags)),
});

/** A fully ready site: WP 6.9 abilities, active plugin speaking schema v6, active Rank Math. */
const READY: Answers = {
  index: { namespaces: ['wp/v2', 'wp-abilities/v1', 'rankmath/v1'] },
  plugins: { status: 200, body: [{ plugin: 'puffergo/puffergo.php', status: 'active' }] },
  schema: { status: 200, body: { schemaVersion: 6 } },
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PUFFERGO_CONFIG;
});

describe('puffergo site setup (probe)', () => {
  it('reports a ready site with nothing to install, changing nothing', async () => {
    const dir = await workdir();
    const posts = stubEndpoints(READY);
    const out = await cmdSiteSetup(ctx(dir));
    expect(out).toMatchObject({ ok: true, ready: true, needsInstall: [] });
    expect(posts).toHaveLength(0); // probe-only: no POST ever
  });

  it('reports a missing plugin + missing SEO plugin as needsInstall, ready:false', async () => {
    const dir = await workdir();
    stubEndpoints({
      index: { namespaces: ['wp/v2', 'wp-abilities/v1'] },
      plugins: { status: 200, body: [] },
    });
    const out = (await cmdSiteSetup(ctx(dir))) as Record<string, unknown>;
    expect(out).toMatchObject({ ok: true, ready: false, puffergoPlugin: { state: 'missing' }, seoPlugin: { active: null } });
    expect(out.needsInstall).toEqual(['puffergo', 'seo-by-rank-math']);
    expect(String(out.next)).toContain('install --customer-said');
  });

  it('an old WordPress (no abilities namespace) is reported as a problem the CLI cannot fix', async () => {
    const dir = await workdir();
    stubEndpoints({ index: { namespaces: ['wp/v2'] }, plugins: { status: 200, body: [] } });
    const out = (await cmdSiteSetup(ctx(dir))) as Record<string, unknown>;
    expect(out).toMatchObject({ ok: true, ready: false, wordpress: { abilitiesApi: false } });
    expect(JSON.stringify(out.problems)).toContain('6.9');
  });

  it('a non-admin account (plugin list 403, no abilities) still gets a report, states "unknown"', async () => {
    const dir = await workdir();
    stubEndpoints({ index: { namespaces: ['wp/v2'] } }); // plugins 403, schema 404 by default
    const out = (await cmdSiteSetup(ctx(dir))) as Record<string, unknown>;
    expect(out).toMatchObject({ ok: true, ready: false, puffergoPlugin: { state: 'unknown' } });
  });

  it('a dead Application Password surfaces connected:false with the login hint', async () => {
    const dir = await workdir();
    stubEndpoints({ ...READY, me: 401 });
    const out = (await cmdSiteSetup(ctx(dir))) as Record<string, unknown>;
    expect(out).toMatchObject({ ok: true, connected: false, ready: false });
    expect(JSON.stringify(out.problems)).toContain('login');
  });

  it('an active Yoast counts as an SEO plugin — Rank Math is NOT listed as needed', async () => {
    const dir = await workdir();
    stubEndpoints({
      index: { namespaces: ['wp/v2', 'wp-abilities/v1', 'yoast/v1'] },
      plugins: { status: 200, body: [{ plugin: 'puffergo/puffergo.php', status: 'active' }] },
      schema: { status: 200, body: { schemaVersion: 6 } },
    });
    const out = (await cmdSiteSetup(ctx(dir))) as Record<string, unknown>;
    expect(out).toMatchObject({ ok: true, ready: true, seoPlugin: { active: 'yoast' } });
  });

  it('a too-new plugin schema reports update_plugin-style guidance, ready:false', async () => {
    const dir = await workdir();
    stubEndpoints({
      index: { namespaces: ['wp/v2', 'wp-abilities/v1', 'rankmath/v1'] },
      plugins: { status: 200, body: [{ plugin: 'puffergo/puffergo.php', status: 'active' }] },
      schema: { status: 200, body: { schemaVersion: 99 } },
    });
    const out = (await cmdSiteSetup(ctx(dir))) as Record<string, unknown>;
    expect(out).toMatchObject({ ok: true, ready: false });
    expect(JSON.stringify(out.problems)).toContain('update the PufferGo plugin');
  });
});

describe('puffergo site setup install', () => {
  it('refuses without the customer\'s own words', async () => {
    const dir = await workdir();
    stubEndpoints(READY);
    const out = await cmdSiteSetup(ctx(dir, ['install']));
    expect(out).toMatchObject({ ok: false, code: 'needs_customer_request', fix: 'user' });
  });

  it('installs PufferGo + Rank Math when both are missing and the customer agreed', async () => {
    const dir = await workdir();
    const posts = stubEndpoints({
      index: { namespaces: ['wp/v2', 'wp-abilities/v1'] },
      plugins: { status: 200, body: [] },
    });
    const out = await cmdSiteSetup(ctx(dir, ['install'], { 'customer-said': '装吧，都给我装上' }));
    expect(out).toMatchObject({ ok: true });
    // Two installs (GET plugin list first inside ensurePluginActive, then POST /wp/v2/plugins each).
    const installs = posts.filter(p => p.url.endsWith('/wp-json/wp/v2/plugins'));
    expect(installs).toHaveLength(2);
    expect(installs[0].body).toMatchObject({ slug: 'puffergo', status: 'active' });
    expect(installs[1].body).toMatchObject({ slug: 'seo-by-rank-math', status: 'active' });
  });

  it('skips Rank Math when an SEO plugin is already active', async () => {
    const dir = await workdir();
    const posts = stubEndpoints({
      index: { namespaces: ['wp/v2', 'wp-abilities/v1', 'yoast/v1'] },
      plugins: { status: 200, body: [{ plugin: 'wordpress-seo/wp-seo.php', status: 'active' }] },
    });
    const out = (await cmdSiteSetup(ctx(dir, ['install'], { 'customer-said': 'go ahead' }))) as Record<string, unknown>;
    expect(out.actions).toMatchObject({ rankMath: 'skipped_yoast_active' });
    expect(posts.filter(p => JSON.stringify(p.body).includes('rank-math'))).toHaveLength(0);
  });

  it('a non-admin account gets the manual wp-admin walkthrough, not a half-install', async () => {
    const dir = await workdir();
    stubEndpoints({ index: { namespaces: ['wp/v2'] } }); // plugins 403, schema 404
    const out = (await cmdSiteSetup(ctx(dir, ['install'], { 'customer-said': 'yes install' }))) as Record<
      string,
      unknown
    >;
    expect(out).toMatchObject({ ok: false, code: 'needs_manual_install', fix: 'user' });
    expect(String(out.message)).toContain('wp-admin');
  });

  it('refuses to install anything when the saved credential is dead', async () => {
    const dir = await workdir();
    const posts = stubEndpoints({ ...READY, me: 401 });
    const out = await cmdSiteSetup(ctx(dir, ['install'], { 'customer-said': 'yes' }));
    expect(out).toMatchObject({ ok: false, code: 'not_logged_in' });
    expect(posts).toHaveLength(0);
  });
});

describe('puffergo site setup usage', () => {
  it('an unknown subcommand answers with the usage line', async () => {
    const dir = await workdir();
    stubEndpoints(READY);
    const out = await cmdSiteSetup(ctx(dir, ['bogus']));
    expect(out).toMatchObject({ ok: false, code: 'usage' });
  });

  it('with no logged-in site at all, answers no_site', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pg-setup-empty-'));
    const store = join(dir, 'credentials.json');
    await writeFile(store, JSON.stringify({ sites: {} }));
    process.env.PUFFERGO_CONFIG = store;
    stubEndpoints(READY);
    const out = await cmdSiteSetup(ctx(dir));
    expect(out).toMatchObject({ ok: false, code: 'no_site' });
  });
});
