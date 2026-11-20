/**
 * `puffergo site setup` — probe-only by default, install only with the customer's own words, and a
 * manual-install fallback when the account can't touch plugins. Driven through the real command code
 * with a stubbed fetch answering each endpoint by URL.
 *
 * The install phase has three moving parts that the tests pin down one by one:
 *   1. PufferGo itself — synchronous, everything else depends on it
 *   2. `POST /puffergo/v1/setup` — the plugin's own init (theme, siteurl/home, design tokens), which is
 *      what was missing before: sites came back "ready" while still on WordPress's default theme
 *   3. Rank Math / FluentSMTP — a detached job, so the customer isn't kept waiting on them
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { cmdSiteSetup, cmdBgInstall } from '../lib/siteSetupCmd';
import { writeActiveDomain } from '../adapters/fileStore';

// The background installer spawns a detached copy of this script. Keep vitest from doing that for real:
// the spawn is asserted on, the job logic itself is exercised by calling `cmdBgInstall` directly.
vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: vi.fn(() => ({ unref: () => {}, on: () => {} })) };
});

const SITE = 'http://setup.test';

/** Each endpoint the probe touches, keyed by a substring of its URL. */
interface Answers {
  index?: { namespaces: string[] };
  me?: number; // HTTP status for /wp/v2/users/me
  /** capabilities returned by /users/me?context=edit; omit to model a site that hides them. */
  meCaps?: Record<string, boolean>;
  /** `context=edit` blocked by a security plugin while the password itself is fine. */
  meEditForbidden?: boolean;
  plugins?: { status: number; body: unknown };
  /** PufferGo's own plugin catalogue (`/puffergo/v1/plugin-setup/config`) — the mail plugin's state. */
  catalog?: { status: number; body: unknown };
  schema?: { status: number; body: unknown };
  /** Theme directory the front page references. Defaults to generatepress (a PufferGo site). */
  theme?: string | null;
  /** `POST /puffergo/v1/setup` answer; defaults to "theme activated, urls updated". */
  setup?: { status: number; body?: unknown };
  install?: Array<{ url: string; body: unknown }>; // recorded POST bodies
}

function stubEndpoints(a: Answers) {
  const posts: Array<{ url: string; body: unknown }> = [];
  // Stateful: an install POST makes later GETs (the post-install re-probe) see the plugin active,
  // exactly like a real site would.
  const installed = new Set<string>();
  vi.stubGlobal('fetch', async (url: string, init?: { method?: string; body?: string }) => {
    const body = init?.body ? (JSON.parse(init.body) as { slug?: string; url?: string }) : undefined;
    // The plugin's init endpoint — its own answer shape, not a plugin install.
    if (init?.method === 'POST' && url.includes('/puffergo/v1/setup')) {
      posts.push({ url, body });
      const s = a.setup ?? { status: 200 };
      return new Response(
        JSON.stringify(
          s.body ?? {
            theme: { activated: true, was_present: false },
            urls: { updated: true, siteurl: body?.url, home: body?.url },
          },
        ),
        { status: s.status },
      );
    }
    if (init?.method === 'POST') {
      posts.push({ url, body });
      if (body?.slug) installed.add(body.slug);
      return new Response(JSON.stringify({ status: 'active' }), { status: 200 });
    }
    // The front page carries the theme directory — the permission-free way to see the active theme.
    if (url.includes('puffergo-probe=theme')) {
      const theme = a.theme === undefined ? 'generatepress' : a.theme;
      const html = theme ? `<html><head><link href="${SITE}/wp-content/themes/${theme}/style.css"></head></html>` : '<html></html>';
      return new Response(html, { status: 200 });
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
    if (url.includes('/users/me')) {
      const status = a.me ?? 200;
      if (status !== 200) return new Response('{}', { status });
      const wantsCaps = url.includes('context=edit');
      if (wantsCaps && a.meEditForbidden)
        return new Response(JSON.stringify({ code: 'rest_forbidden' }), { status: 403 });
      // WordPress only returns `capabilities` in the edit context — a bare /users/me must not carry them.
      return new Response(JSON.stringify(wantsCaps && a.meCaps ? { id: 1, capabilities: a.meCaps } : { id: 1 }), {
        status: 200,
      });
    }
    if (url.includes('/puffergo/v1/plugin-setup/config')) {
      const c = a.catalog ?? { status: 404, body: { code: 'rest_no_route' } };
      return new Response(JSON.stringify(c.body), { status: c.status });
    }
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

/** A fully ready site: WP 6.9 abilities, active plugin speaking schema v6, active Rank Math, GeneratePress. */
const READY: Answers = {
  index: { namespaces: ['wp/v2', 'wp-abilities/v1', 'rankmath/v1'] },
  plugins: { status: 200, body: [{ plugin: 'puffergo/puffergo.php', status: 'active' }] },
  schema: { status: 200, body: { schemaVersion: 6 } },
  theme: 'generatepress',
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PUFFERGO_CONFIG;
  vi.mocked(spawn).mockClear();
});

describe('puffergo site setup (probe)', () => {
  it('reports a ready site with nothing to install, changing nothing', async () => {
    const dir = await workdir();
    const posts = stubEndpoints(READY);
    const out = await cmdSiteSetup(ctx(dir));
    expect(out).toMatchObject({ ok: true, ready: true, coreReady: true, needsInstall: [] });
    expect(posts).toHaveLength(0); // probe-only: no POST ever
  });

  it('reports the mail plugin from the PufferGo catalogue, separately from SEO', async () => {
    const dir = await workdir();
    stubEndpoints({
      ...READY,
      catalog: {
        status: 200,
        body: { data: { plugins: [{ slug: 'fluent-smtp', install_status: 'not_installed' }] } },
      },
    });
    const out = (await cmdSiteSetup(ctx(dir))) as Record<string, unknown>;
    expect(out).toMatchObject({ mailPlugin: { state: 'missing' } });
    expect(JSON.stringify(out.mailPlugin)).toContain('plugins install fluent-smtp');
    // A missing mail plugin is not a reason to call the site unready — PufferGo works without it.
    expect(out.ready).toBe(true);
  });

  it('an active mail plugin is reported as active, with the "still needs SMTP" caveat', async () => {
    const dir = await workdir();
    stubEndpoints({
      ...READY,
      catalog: {
        status: 200,
        body: { data: { plugins: [{ slug: 'fluent-smtp', install_status: 'activated' }] } },
      },
    });
    const out = (await cmdSiteSetup(ctx(dir))) as Record<string, unknown>;
    expect(out).toMatchObject({ mailPlugin: { state: 'active' } });
    expect(JSON.stringify(out.mailPlugin)).toContain('SMTP');
  });

  it('says "unknown" rather than "missing" when the catalogue cannot be read', async () => {
    const dir = await workdir();
    stubEndpoints(READY); // catalogue defaults to 404
    const out = (await cmdSiteSetup(ctx(dir))) as Record<string, unknown>;
    expect(out).toMatchObject({ mailPlugin: { state: 'unknown' } });
  });

  it('reports a missing plugin + missing SEO plugin as needsInstall, ready:false', async () => {
    const dir = await workdir();
    stubEndpoints({
      index: { namespaces: ['wp/v2', 'wp-abilities/v1'] },
      plugins: { status: 200, body: [] },
    });
    const out = (await cmdSiteSetup(ctx(dir))) as Record<string, unknown>;
    expect(out).toMatchObject({
      ok: true,
      ready: false,
      puffergoPlugin: { state: 'missing' },
      seoPlugin: { active: null },
    });
    expect(out.needsInstall).toEqual(['puffergo', 'seo-by-rank-math']);
    expect(String(out.next)).toContain('install --customer-said');
  });

  it('a site still on a stock WordPress theme is NOT ready — that is what made pages render unstyled', async () => {
    const dir = await workdir();
    stubEndpoints({ ...READY, theme: 'twentytwentyfive' });
    const out = (await cmdSiteSetup(ctx(dir))) as Record<string, unknown>;
    expect(out).toMatchObject({ theme: { active: 'twentytwentyfive', state: 'default' }, coreReady: false, ready: false });
    expect(JSON.stringify(out.problems)).toContain('default theme');
    expect(String(out.next)).toContain('install --customer-said');
  });

  it("a site running someone's own theme is ready, and says the theme was left alone", async () => {
    const dir = await workdir();
    stubEndpoints({ ...READY, theme: 'astra' });
    const out = (await cmdSiteSetup(ctx(dir))) as Record<string, unknown>;
    expect(out).toMatchObject({ theme: { active: 'astra', state: 'custom' }, ready: true });
    expect(JSON.stringify(out.theme)).toContain('left alone');
  });

  it('an unreadable front page reports the theme as unknown instead of guessing', async () => {
    const dir = await workdir();
    stubEndpoints({ ...READY, theme: null });
    const out = (await cmdSiteSetup(ctx(dir))) as Record<string, unknown>;
    expect(out).toMatchObject({ theme: { active: null, state: 'unknown' } });
    expect(out.ready).toBe(true); // no evidence of a problem — do not invent one
  });

  it('reports whether the design tokens exist', async () => {
    const dir = await workdir();
    stubEndpoints(READY); // /design-system falls through to the index stub → no schemes
    const missing = (await cmdSiteSetup(ctx(dir))) as Record<string, unknown>;
    expect(missing).toMatchObject({ designTokens: { state: 'missing' } });
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
      theme: 'generatepress',
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

describe("wp-admin links follow the account's capabilities", () => {
  const ADMIN = { edit_posts: true, manage_options: true, install_plugins: true, activate_plugins: true };
  const EDITOR = { edit_posts: true, manage_options: false, install_plugins: false, activate_plugins: false };
  interface LinksOut extends Record<string, unknown> {
    wpAdmin: { links: Record<string, string>; reachableFor: string; note?: string };
    account?: { reach: string; canManageOptions: boolean; canInstallPlugins: boolean };
  }

  it('an administrator gets the builder, the site profile and the settings links', async () => {
    const dir = await workdir();
    stubEndpoints({ ...READY, meCaps: ADMIN });
    const out = (await cmdSiteSetup(ctx(dir))) as unknown as LinksOut;
    expect(out.account).toMatchObject({ reach: 'administrator', canManageOptions: true, canInstallPlugins: true });
    expect(out.wpAdmin.reachableFor).toBe('administrator');
    expect(Object.keys(out.wpAdmin.links).sort()).toEqual(['aiSiteBuilder', 'settings', 'siteProfile']);
    expect(out.wpAdmin.links.settings).toBe(`${SITE}/wp-admin/admin.php?page=puffergo-settings`);
  });

  it('an editor only gets the AI site builder link — a manage_options page would 403 on them', async () => {
    const dir = await workdir();
    stubEndpoints({ ...READY, meCaps: EDITOR });
    const out = (await cmdSiteSetup(ctx(dir))) as unknown as LinksOut;
    expect(out.account).toMatchObject({ reach: 'editor', canManageOptions: false });
    expect(out.wpAdmin.reachableFor).toBe('editor');
    expect(Object.keys(out.wpAdmin.links)).toEqual(['aiSiteBuilder']);
  });

  it('an editor who is missing the plugin is told an administrator has to install it', async () => {
    const dir = await workdir();
    stubEndpoints({
      index: { namespaces: ['wp/v2', 'wp-abilities/v1', 'rankmath/v1'] },
      plugins: { status: 200, body: [] },
      meCaps: EDITOR,
    });
    const out = (await cmdSiteSetup(ctx(dir))) as Record<string, unknown>;
    expect(out.needsInstall).toEqual(['puffergo']);
    expect(JSON.stringify(out.problems)).toContain('administrator');
  });

  it('a site that hides capabilities still yields the builder link, reach unknown', async () => {
    const dir = await workdir();
    stubEndpoints(READY); // no meCaps → WordPress returns no `capabilities` field
    const out = (await cmdSiteSetup(ctx(dir))) as unknown as LinksOut;
    expect(out.account).toBeUndefined();
    expect(out.wpAdmin.reachableFor).toBe('unknown');
    expect(Object.keys(out.wpAdmin.links)).toEqual(['aiSiteBuilder']);
    expect(String(out.wpAdmin.note)).toContain('did not disclose');
  });

  it('a blocked context=edit is not mistaken for a dead Application Password', async () => {
    const dir = await workdir();
    stubEndpoints({ ...READY, meEditForbidden: true });
    const out = (await cmdSiteSetup(ctx(dir))) as unknown as LinksOut;
    expect(out.connected).toBe(true); // the plain /users/me still answers
    expect(out.account).toBeUndefined();
    expect(out.wpAdmin.links.aiSiteBuilder).toContain('/wp-admin/admin.php?page=puffergo-ai-site-builder');
  });
});

describe('puffergo site setup install', () => {
  it("refuses without the customer's own words", async () => {
    const dir = await workdir();
    stubEndpoints(READY);
    const out = await cmdSiteSetup(ctx(dir, ['install']));
    expect(out).toMatchObject({ ok: false, code: 'needs_customer_request', fix: 'user' });
  });

  it('runs the plugin setup (theme + address + design tokens) before anything else', async () => {
    const dir = await workdir();
    const posts = stubEndpoints({
      index: { namespaces: ['wp/v2', 'wp-abilities/v1', 'rankmath/v1'] },
      plugins: { status: 200, body: [{ plugin: 'puffergo/puffergo.php', status: 'active' }] },
      schema: { status: 200, body: { schemaVersion: 6 } },
      theme: 'twentytwentyfive',
    });
    const out = (await cmdSiteSetup(ctx(dir, ['install'], { 'customer-said': '好，装吧' }))) as Record<string, unknown>;
    const init = posts.filter(p => p.url.includes('/puffergo/v1/setup'));
    expect(init).toHaveLength(1);
    // 默认就导样板：客户第一眼看到的是演示站，不是 Hello world 博客流。
    expect(init[0]!.body).toMatchObject({ url: SITE, import_sample_data: true });
    expect(out).toMatchObject({ siteInit: { ran: true, theme: { state: 'active', activeBefore: 'twentytwentyfive' } } });
  });

  it('--no-sample-data is the only way to skip it, and says the site is bare on purpose', async () => {
    const dir = await workdir();
    const posts = stubEndpoints({ ...READY, setup: { status: 200, body: { theme: { activated: true }, urls: { updated: true } } } });
    const out = (await cmdSiteSetup(
      ctx(dir, ['install'], { 'customer-said': '站上已经有我的内容了', 'no-sample-data': 'true' }),
    )) as Record<string, unknown>;
    const init = posts.filter(p => p.url.includes('/puffergo/v1/setup'));
    expect(init[0]!.body).toMatchObject({ import_sample_data: false });
    expect(out.siteInit).not.toHaveProperty('sampleData');
    expect(String(out.next)).toContain('skipped on purpose');
  });

  it('--sample-data=false is accepted as the same opt-out', async () => {
    const dir = await workdir();
    const posts = stubEndpoints({ ...READY, setup: { status: 200, body: { theme: { activated: true }, urls: { updated: true } } } });
    await cmdSiteSetup(ctx(dir, ['install'], { 'customer-said': '别放样板', 'sample-data': 'false' }));
    const init = posts.filter(p => p.url.includes('/puffergo/v1/setup'));
    expect(init[0]!.body).toMatchObject({ import_sample_data: false });
  });

  it('--sample-data imports the demo content and reports exactly what landed', async () => {
    const dir = await workdir();
    const posts = stubEndpoints({
      ...READY,
      setup: {
        status: 200,
        body: {
          theme: { activated: true, was_present: false },
          urls: { updated: true, siteurl: SITE, home: SITE },
          sample_data: {
            imported: true,
            counts: { puffergo_product: 3, puffergo_solution: 2, puffergo_case: 2, puffergo_testimonial: 0, post: 5 },
          },
        },
      },
    });
    const out = (await cmdSiteSetup(
      ctx(dir, ['install'], { 'customer-said': '先放点样板看看', 'sample-data': 'true' }),
    )) as Record<string, unknown>;
    const init = posts.filter(p => p.url.includes('/puffergo/v1/setup'));
    expect(init[0]!.body).toMatchObject({ import_sample_data: true });
    expect(out).toMatchObject({
      siteInit: { sampleData: { imported: true, reused: false, counts: { puffergo_case: 2 } } },
    });
    const next = String(out.next);
    expect(next).toContain('2 case studies');
    expect(next).toContain('Delete Sample Data');
    expect(next).not.toContain('0 testimonials'); // 零条的 CPT 不摆出来凑数
  });

  it('a site that already had demo content is not seeded twice — and says so', async () => {
    const dir = await workdir();
    stubEndpoints({
      ...READY,
      setup: {
        status: 200,
        body: {
          theme: { activated: true, was_present: true },
          urls: { updated: true, siteurl: SITE, home: SITE },
          sample_data: { imported: true }, // 没 counts = 本次没建 CPT，只补了首页/菜单
        },
      },
    });
    const out = (await cmdSiteSetup(
      ctx(dir, ['install'], { 'customer-said': '再跑一次', 'sample-data': 'true' }),
    )) as Record<string, unknown>;
    expect(out).toMatchObject({ siteInit: { sampleData: { imported: true, reused: true } } });
    expect(String(out.next)).toContain('already on this site');
  });

  it('a theme it refused to touch also means no demo content — and says that too', async () => {
    const dir = await workdir();
    stubEndpoints({ ...READY, theme: 'astra' });
    const out = (await cmdSiteSetup(
      ctx(dir, ['install'], { 'customer-said': '放点样板', 'sample-data': 'true' }),
    )) as Record<string, unknown>;
    expect(String((out.siteInit as Record<string, unknown>).note)).toContain('was NOT imported');
  });

  it('does not touch a theme the customer designed — and says so', async () => {
    const dir = await workdir();
    const posts = stubEndpoints({ ...READY, theme: 'astra' });
    const out = (await cmdSiteSetup(ctx(dir, ['install'], { 'customer-said': 'go ahead' }))) as Record<string, unknown>;
    expect(posts.filter(p => p.url.includes('/puffergo/v1/setup'))).toHaveLength(0);
    expect(out).toMatchObject({ siteInit: { ran: false, skipped: 'custom' } });
    expect(JSON.stringify(out.siteInit)).toContain('--activate-theme');
  });

  it('--activate-theme forces the switch when the customer asks for it', async () => {
    const dir = await workdir();
    const posts = stubEndpoints({ ...READY, theme: 'astra' });
    const out = (await cmdSiteSetup(
      ctx(dir, ['install'], { 'customer-said': '用我们的主题', 'activate-theme': 'true' }),
    )) as Record<string, unknown>;
    expect(posts.filter(p => p.url.includes('/puffergo/v1/setup'))).toHaveLength(1);
    expect(out).toMatchObject({ siteInit: { ran: true } });
  });

  it('reports a /setup endpoint the plugin does not have yet (old plugin)', async () => {
    const dir = await workdir();
    stubEndpoints({ ...READY, theme: 'twentytwentyfive', setup: { status: 404, body: { code: 'rest_no_route' } } });
    const out = (await cmdSiteSetup(ctx(dir, ['install'], { 'customer-said': '装' }))) as Record<string, unknown>;
    expect(out).toMatchObject({ siteInit: { ran: false, error: 'endpoint_missing' } });
  });

  it('says an administrator is needed when /setup answers 403', async () => {
    const dir = await workdir();
    stubEndpoints({ ...READY, theme: 'twentytwentyfive', setup: { status: 403, body: { code: 'rest_forbidden' } } });
    const out = (await cmdSiteSetup(ctx(dir, ['install'], { 'customer-said': '装' }))) as Record<string, unknown>;
    expect(out).toMatchObject({ siteInit: { ran: false, error: 'needs_admin' } });
  });

  it('PufferGo goes in synchronously; Rank Math and FluentSMTP go to a background job', async () => {
    const dir = await workdir();
    const posts = stubEndpoints({
      index: { namespaces: ['wp/v2', 'wp-abilities/v1'] },
      plugins: { status: 200, body: [] },
    });
    const out = (await cmdSiteSetup(ctx(dir, ['install'], { 'customer-said': '都装上' }))) as Record<string, unknown>;

    const installs = posts.filter(p => p.url.endsWith('/wp-json/wp/v2/plugins'));
    expect(installs).toHaveLength(1);
    expect(installs[0]!.body).toMatchObject({ slug: 'puffergo', status: 'active' });

    expect(out.background).toMatchObject({ state: 'running', plugins: ['seo-by-rank-math', 'fluent-smtp'] });
    // Still installing → not something the AI should re-install or tell the customer to install.
    expect(out.needsInstall).toEqual([]);
    expect(out.coreReady).toBe(true);
    expect(String(out.next)).toContain('do NOT wait');

    const job = JSON.parse(await readFile(join(dir, 'jobs', `${(out.background as { id: string }).id}.json`), 'utf8'));
    expect(job.state).toBe('running');
    expect(vi.mocked(spawn)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(spawn).mock.calls[0]![1]).toContain('__bg-install');
  });

  it('--background none installs everything synchronously (slow, but one command)', async () => {
    const dir = await workdir();
    const posts = stubEndpoints({
      index: { namespaces: ['wp/v2', 'wp-abilities/v1'] },
      plugins: { status: 200, body: [] },
    });
    const out = (await cmdSiteSetup(
      ctx(dir, ['install'], { 'customer-said': '都装上', background: 'none' }),
    )) as Record<string, unknown>;
    const installs = posts.filter(p => p.url.endsWith('/wp-json/wp/v2/plugins'));
    expect(installs.map(p => (p.body as { slug: string }).slug)).toEqual(['puffergo', 'seo-by-rank-math', 'fluent-smtp']);
    expect(out.background).toBeUndefined();
    expect(vi.mocked(spawn)).not.toHaveBeenCalled();
  });

  it('skips Rank Math when an SEO plugin is already active', async () => {
    const dir = await workdir();
    const posts = stubEndpoints({
      index: { namespaces: ['wp/v2', 'wp-abilities/v1', 'yoast/v1'] },
      plugins: {
        status: 200,
        body: [
          { plugin: 'puffergo/puffergo.php', status: 'active' },
          { plugin: 'wordpress-seo/wp-seo.php', status: 'active' },
        ],
      },
      schema: { status: 200, body: { schemaVersion: 6 } },
    });
    const out = (await cmdSiteSetup(
      ctx(dir, ['install'], { 'customer-said': 'go ahead', background: 'none' }),
    )) as Record<string, unknown>;
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

describe('the background installer', () => {
  it('records what it installed, so the next `site setup` can report it', async () => {
    const dir = await workdir();
    stubEndpoints({ plugins: { status: 200, body: [] } }); // install_plugins allowed, nothing installed yet
    const jobDir = join(dir, 'jobs');
    await mkdir(jobDir, { recursive: true });
    const id = 'job1';
    await writeFile(
      join(jobDir, `${id}.json`),
      JSON.stringify({ id, site: SITE, plugins: ['seo-by-rank-math', 'fluent-smtp'], state: 'running', startedAt: new Date().toISOString() }),
      'utf8',
    );

    await cmdBgInstall(id, SITE, dir);

    const job = JSON.parse(await readFile(join(jobDir, `${id}.json`), 'utf8'));
    expect(job.state).toBe('done');
    expect(job.results).toMatchObject({ 'seo-by-rank-math': 'installed', 'fluent-smtp': 'installed' });
    expect(job.finishedAt).toBeTruthy();
  });

  it("a finished job is reported by the next probe, and stops hiding needsInstall", async () => {
    const dir = await workdir();
    stubEndpoints({ index: { namespaces: ['wp/v2', 'wp-abilities/v1'] }, plugins: { status: 200, body: [] } });
    await mkdir(join(dir, 'jobs'), { recursive: true });
    await writeFile(
      join(dir, 'jobs', 'job2.json'),
      JSON.stringify({
        id: 'job2',
        site: SITE,
        plugins: ['seo-by-rank-math', 'fluent-smtp'],
        state: 'failed',
        startedAt: new Date().toISOString(),
        results: { 'seo-by-rank-math': 'http_500', 'fluent-smtp': 'installed' },
      }),
      'utf8',
    );
    const out = (await cmdSiteSetup(ctx(dir))) as Record<string, unknown>;
    expect(out.background).toMatchObject({ state: 'failed', results: { 'seo-by-rank-math': 'http_500' } });
    // Failed → back in needsInstall, so the AI can retry or hand it to the customer.
    expect(out.needsInstall).toContain('seo-by-rank-math');
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
