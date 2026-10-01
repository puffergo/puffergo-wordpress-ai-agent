/**
 * `puffergo site setup` — the onboarding check for a logged-in site: what PufferGo needs to work here
 * (WordPress ≥ 6.9 for the Abilities API, the PufferGo plugin, an SEO plugin for the SEO fields), and —
 * only with the customer's own go-ahead — installing/activating what's missing.
 *
 * Two phases, matching the skill's consent rule ("先提示，用户同意才装"):
 *   puffergo site setup                                  → PROBE ONLY, changes nothing; the AI shows the
 *                                                          customer what's missing and asks
 *   puffergo site setup install --customer-said "…"      → installs the PufferGo plugin (wordpress.org
 *                                                          slug `puffergo`) and Rank Math — the latter
 *                                                          only when the site runs NO SEO plugin yet
 *                                                          (an active Rank Math or Yoast is kept)
 *
 * Probes escalate by privilege so a non-admin account still gets a useful report:
 *   GET /wp-json/                        (public)  → namespaces: abilities API? SEO plugin active?
 *   GET /wp/v2/users/me                  (authed)  → does the Application Password still work?
 *   GET /wp/v2/plugins                   (admin)   → exact plugin states; 403 degrades to 'unknown'
 *   GET  …/puffergo/get-product-schema   (authed)  → the functional check that matters: abilities answer
 *
 * Installing needs `activate_plugins` + `install_plugins`; without them the command refuses with
 * `needs_manual_install` and the wp-admin walkthrough instead of half-installing.
 */

import { WpClient, WpHttpError } from '@puffergo/silo-core';
import { nodeNetwork } from '../adapters/nodeNetwork';
import type { SiloConfig } from '../adapters/credentials';
import { resolveSite } from './site';
import { siteErrorOutput, type CmdCtx, type Out } from './siteCmd';
import { MIN_SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSION } from './siteSchema';

/** wordpress.org slugs — the PufferGo plugin, and the SEO plugin installed when the site has none. */
const PUFFERGO_SLUG = 'puffergo';
const RANKMATH_SLUG = 'seo-by-rank-math';

export const SITE_SETUP_USAGE =
  'puffergo site setup [install --customer-said "<customer words>"] [--dir <workdir>] [--site <url>]';

type PluginState = 'active' | 'inactive' | 'missing' | 'unknown';

interface ProbeResult {
  siteUrl: string;
  /** The Application Password authenticates. */
  connected: boolean;
  /** `wp-abilities/v1` namespace present — the WordPress ≥ 6.9 requirement, checked functionally. */
  abilitiesApi: boolean;
  puffergo: PluginState;
  /** The active plugin's product-file version (null when the abilities don't answer). */
  schemaVersion: number | null;
  /** Which SEO plugin is active, if any (their REST namespaces are public knowledge). */
  seo: 'rankmath' | 'yoast' | null;
  /** Plugin states couldn't be listed (non-admin) — states stay 'unknown' unless abilities answered. */
  canListPlugins: boolean;
}

async function probe(cfg: SiloConfig): Promise<ProbeResult> {
  const base = cfg.siteUrl.replace(/\/+$/, '');
  const auth = `Basic ${Buffer.from(`${cfg.username}:${cfg.appPassword}`).toString('base64')}`;
  const get = async (url: string) =>
    nodeNetwork.request({ method: 'GET', url, headers: { Authorization: auth, 'Content-Type': 'application/json' } });
  const ok = (status: number) => status >= 200 && status < 300;

  const [index, me, pluginRes, schemaRes] = await Promise.all([
    get(`${base}/wp-json/`),
    get(`${base}/wp-json/wp/v2/users/me?_fields=id`),
    get(`${base}/wp-json/wp/v2/plugins?_fields=plugin,textdomain,status,version`),
    get(`${base}/wp-json/wp-abilities/v1/abilities/puffergo/get-product-schema/run`),
  ]);

  const namespaces = (index.json as { namespaces?: string[] } | undefined)?.namespaces ?? [];
  const plugins =
    ok(pluginRes.status) && Array.isArray(pluginRes.json)
      ? (pluginRes.json as Array<{ plugin?: string; textdomain?: string; status?: string }>)
      : null;

  const stateOf = (slug: string): PluginState => {
    if (!plugins) return 'unknown';
    const row = plugins.find(
      p => p.textdomain === slug || p.plugin === slug || (p.plugin ?? '').startsWith(`${slug}/`),
    );
    return row ? (row.status === 'active' ? 'active' : 'inactive') : 'missing';
  };

  const schemaVersion = ok(schemaRes.status)
    ? ((schemaRes.json as { schemaVersion?: number } | undefined)?.schemaVersion ?? null)
    : null;

  return {
    siteUrl: cfg.siteUrl,
    connected: ok(me.status),
    abilitiesApi: namespaces.includes('wp-abilities/v1'),
    // The abilities answering IS the proof the plugin is active, whatever the (possibly forbidden)
    // plugin list says; 'unknown' stays only when neither source could tell.
    puffergo: schemaVersion !== null ? 'active' : stateOf(PUFFERGO_SLUG),
    schemaVersion,
    seo: namespaces.includes('rankmath/v1')
      ? 'rankmath'
      : namespaces.includes('yoast/v1')
        ? 'yoast'
        : stateOf(RANKMATH_SLUG) === 'active'
          ? 'rankmath'
          : stateOf('wordpress-seo') === 'active'
            ? 'yoast'
            : null,
    canListPlugins: plugins !== null,
  };
}

/** What the probe found, as the report both phases print (install re-probes and prints the same shape). */
function report(p: ProbeResult): Record<string, unknown> {
  const needs: string[] = [];
  if (!p.abilitiesApi) needs.push('wordpress-6.9');
  if (p.puffergo !== 'active') needs.push(PUFFERGO_SLUG);
  if (!p.seo) needs.push(RANKMATH_SLUG);
  const pluginTooOld =
    p.schemaVersion !== null && (p.schemaVersion < MIN_SCHEMA_VERSION || p.schemaVersion > SUPPORTED_SCHEMA_VERSION);

  const problems: string[] = [];
  if (!p.connected) problems.push('The saved Application Password does not authenticate — run `puffergo login <siteUrl>` again.');
  if (!p.abilitiesApi) problems.push('WordPress is older than 6.9 (no Abilities API) — update WordPress itself; the CLI cannot.');
  if (pluginTooOld)
    problems.push(
      `The PufferGo plugin's product-file version is ${p.schemaVersion}; this CLI understands ${MIN_SCHEMA_VERSION}–${SUPPORTED_SCHEMA_VERSION} — update the PufferGo plugin in wp-admin.`,
    );
  if (p.puffergo !== 'active' && !pluginTooOld) problems.push('The PufferGo plugin is not active.');
  if (!p.seo) problems.push('No SEO plugin is active, so SEO fields (title/description/focus keyword) have nowhere to be written.');

  return {
    site: p.siteUrl,
    connected: p.connected,
    wordpress: { abilitiesApi: p.abilitiesApi },
    puffergoPlugin: { state: p.puffergo, schemaVersion: p.schemaVersion },
    seoPlugin: { active: p.seo },
    needsInstall: needs.filter(n => n !== 'wordpress-6.9'),
    ...(problems.length ? { problems } : {}),
    ready: p.connected && p.abilitiesApi && p.puffergo === 'active' && !!p.seo && !pluginTooOld,
  };
}

async function install(ctx: CmdCtx, cfg: SiloConfig): Promise<Out> {
  const said = (ctx.flags.get('customer-said') ?? '').trim();
  if (!said)
    return {
      ok: false,
      code: 'needs_customer_request',
      fix: 'user',
      message:
        'Installing plugins changes the customer\'s site. Tell them what `puffergo site setup` found and what you want to install; when they agree, run `puffergo site setup install --customer-said "<their exact words>".',
    };

  const before = await probe(cfg);
  if (!before.connected)
    return {
      ok: false,
      code: 'not_logged_in',
      fix: 'user',
      message: 'The saved Application Password does not authenticate — run `puffergo login <siteUrl>` again first.',
    };

  const client = new WpClient(nodeNetwork, {
    siteUrl: cfg.siteUrl,
    username: cfg.username,
    appPassword: cfg.appPassword,
  });
  const actions: Record<string, string> = {};
  try {
    actions.puffergo =
      before.puffergo === 'active' ? 'already_active' : (await client.ensurePluginActive(PUFFERGO_SLUG)).action;
    // An active Rank Math or Yoast is kept — PufferGo writes through whichever SEO plugin the site runs.
    actions.rankMath = before.seo ? `skipped_${before.seo}_active` : (await client.ensurePluginActive(RANKMATH_SLUG)).action;
  } catch (e) {
    if (e instanceof WpHttpError && (e.status === 401 || e.status === 403))
      return {
        ok: false,
        code: 'needs_manual_install',
        fix: 'user',
        actions,
        message:
          'This account cannot install or activate plugins (WordPress needs an admin for that). In wp-admin: Plugins → Add New → search "PufferGo" → Install Now → Activate' +
          (before.seo ? '' : '; then the same for "Rank Math SEO"') +
          '. Afterwards run `puffergo site setup` again to verify.',
      };
    throw e;
  }

  const after = await probe(cfg);
  const r = report(after);
  return {
    ok: r.ready as boolean,
    ...r,
    actions,
    ...(after.abilitiesApi
      ? {}
      : {
          message:
            'Plugins are in place, but this WordPress still has no Abilities API — update WordPress to 6.9+ in wp-admin (Dashboard → Updates); PufferGo cannot work on an older core.',
        }),
  };
}

export async function cmdSiteSetup(ctx: CmdCtx): Promise<Out> {
  try {
    const { config } = await resolveSite(ctx.dir, ctx.flags.get('site'));
    const sub = ctx.positional[0];
    if (sub === 'install') return await install(ctx, config);
    if (sub !== undefined) return { ok: false, code: 'usage', message: SITE_SETUP_USAGE };

    const p = await probe(config);
    const r = report(p);
    return {
      ok: true,
      ...r,
      ...(r.ready
        ? { next: 'The site is ready for PufferGo.' }
        : {
            next:
              'Show the customer what is missing (problems/needsInstall) and ask to install. If they agree, run `puffergo site setup install --customer-said "<their exact words>"`. WordPress core and plugin UPDATES cannot be installed from here — guide the customer through wp-admin for those.',
          }),
    };
  } catch (e) {
    const siteErr = siteErrorOutput(e);
    if (siteErr) return siteErr;
    return { ok: false, code: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
