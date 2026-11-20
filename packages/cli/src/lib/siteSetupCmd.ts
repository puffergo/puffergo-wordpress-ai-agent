/**
 * `puffergo site setup` — the onboarding check for a logged-in site: what PufferGo needs to work here
 * (WordPress ≥ 6.9 for the Abilities API, the PufferGo plugin, GeneratePress active, an SEO plugin for
 * the SEO fields), and — only with the customer's own go-ahead — installing/activating what's missing.
 *
 * Two phases, matching the skill's consent rule ("先提示，用户同意才装"):
 *   puffergo site setup                                  → PROBE ONLY, changes nothing; the AI shows the
 *                                                          customer what's missing and asks
 *   puffergo site setup install --customer-said "…"      → installs the PufferGo plugin, runs the plugin's
 *                                                          own `POST /puffergo/v1/setup` (GeneratePress
 *                                                          install + activate, siteurl/home, design
 *                                                          tokens), then hands Rank Math and FluentSMTP
 *                                                          to a detached background job
 *
 * Why the split matters (field feedback, 2026-11-18): the site used to come back "ready: true" while still
 * running WordPress's default theme, so AI-built pages rendered unstyled. The theme was never switched
 * because nothing ever called `/puffergo/v1/setup` — the endpoint the plugin added exactly for this
 * ("called by the PufferGo extension right after plugin install is confirmed"). It is now called here, and
 * the probe reports the theme so `ready` can no longer lie about it.
 *
 * The theme is only switched when switching is safe: GeneratePress already, or a stock WordPress theme
 * (twentytwenty*). A site running its own theme is a site someone designed — `/setup` would replace that
 * design, so it is left alone and said so. `--activate-theme` forces it.
 *
 * Rank Math (~20 s to download+activate) and FluentSMTP do not block building, so they run in a detached
 * process (`__bg-install`) that outlives this command; `site setup` reads its job file and reports where
 * it got to. That keeps the customer from watching a spinner for a plugin that isn't on the critical path.
 *
 * Probes escalate by privilege so a non-admin account still gets a useful report:
 *   GET /wp-json/                                    (public)  → namespaces: abilities API? SEO plugin active?
 *   GET /wp/v2/users/me?context=edit                 (authed)  → password works? what may this account reach?
 *   GET /wp/v2/plugins                               (admin)   → exact plugin states; 403 degrades to 'unknown'
 *   GET  …/puffergo/get-product-schema               (authed)  → the functional check that matters: abilities answer
 *   GET  …/puffergo/v1/design-system                 (editor)  → design tokens generated?
 *   GET  /                                           (public)  → which theme the site actually renders with
 *
 * The account's capabilities decide which wp-admin pages the report links to: the AI site builder only
 * needs `edit_posts`, while the site profile and the API-key settings need `manage_options`. Handing an
 * editor a manage_options link lands them on "Sorry, you are not allowed to access this page" — so the
 * URLs are built here, from the capabilities, instead of being assembled by the model.
 *
 * Installing needs `activate_plugins` + `install_plugins`; without them the command refuses with
 * `needs_manual_install` and the wp-admin walkthrough instead of half-installing.
 */

import { spawn } from 'node:child_process';
import { sandboxFreeEnv, stripSandboxExecArgv } from './sandboxEnv';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { WpClient, WpHttpError } from '@puffergo/silo-core';
import { nodeNetwork } from '../adapters/nodeNetwork';
import { PUFFERGO_DIR, type SiloConfig } from '../adapters/credentials';
import { resolveSite } from './site';
import { siteErrorOutput, type CmdCtx, type Out } from './siteCmd';
import { MIN_SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSION } from './siteSchema';

/** wordpress.org slugs — the PufferGo plugin, and the plugins installed for it. */
const PUFFERGO_SLUG = 'puffergo';
const RANKMATH_SLUG = 'seo-by-rank-math';
const FLUENT_SMTP_SLUG = 'fluent-smtp';

/**
 * 装完立刻有用、但不挡建站的插件：SEO 字段和询盘收发都要它们，可站点画像和 AI 整站生成
 * 在那之前就能开始。放后台装，客户不用对着转圈等下载。
 */
const BACKGROUND_SLUGS = [RANKMATH_SLUG, FLUENT_SMTP_SLUG];

/** GeneratePress 是插件设计系统假定的主题；装了它，PufferGo 的版式/配色才成立。 */
const PUFFERGO_THEME = 'generatepress';
/** WordPress 自带主题：换成 GeneratePress 不会毁掉任何人的设计，所以这一类可以放心换。 */
const STOCK_THEME = /^twentytwenty/;

/** job 文件跟凭据放在一起：`PUFFERGO_CONFIG` 指到别处（测试、多环境）时，任务记录也跟着走。 */
const jobsDir = (): string => {
  const store = process.env.PUFFERGO_CONFIG;
  return store ? join(dirname(store), 'jobs') : join(PUFFERGO_DIR, 'jobs');
};
const JOB_KEEP_DAYS = 30;

export const SITE_SETUP_USAGE =
  'puffergo site setup [install --customer-said "<customer words>" [--url <site url>] [--activate-theme] [--no-sample-data] [--background "<slug,slug|none>"]] [--dir <workdir>] [--site <url>]';

type PluginState = 'active' | 'inactive' | 'missing' | 'unknown';
type ThemeState = 'puffergo' | 'default' | 'custom' | 'unknown';

/** Which wp-admin pages this account may open — read from `/wp/v2/users/me?context=edit`. */
interface AccountCaps {
  editPosts: boolean;
  manageOptions: boolean;
  /** Installing a plugin needs both `install_plugins` and `activate_plugins`. */
  installPlugins: boolean;
}

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
  /**
   * The transactional-mail plugin (FluentSMTP): without it 询盘表单 的 wp_mail 走主机 PHP mail，
   * 要么被当垃圾邮件，要么被主机直接拒。'unknown' = 查不到（PufferGo 太旧 / 账号不是管理员）。
   */
  mail: 'active' | 'inactive' | 'missing' | 'unknown';
  /** 设计令牌（配色/字体那套）是否已生成 —— 没有它 AI 建的页面拿不到品牌色。 */
  design: 'ready' | 'missing' | 'unknown';
  /** 前台实际用的主题目录名（stylesheet），读不到为 null。 */
  theme: string | null;
  /** Plugin states couldn't be listed (non-admin) — states stay 'unknown' unless abilities answered. */
  canListPlugins: boolean;
  /** null when the site refused to disclose capabilities (security plugins do) — links then stay safe. */
  caps: AccountCaps | null;
}

function readCaps(json: unknown): AccountCaps | null {
  const caps = (json as { capabilities?: Record<string, boolean> } | undefined)?.capabilities;
  if (!caps || typeof caps !== 'object') return null;
  return {
    editPosts: !!caps.edit_posts,
    manageOptions: !!caps.manage_options,
    // PufferGo is installed and activated in one call, so both permissions are required.
    installPlugins: !!caps.install_plugins && !!caps.activate_plugins,
  };
}

const normalizeUrl = (url: string): string => url.replace(/\/+$/, '');

/** Why a theme slug matters: only the last two cases are "don't touch it". */
function themeState(theme: string | null): ThemeState {
  if (!theme) return 'unknown';
  if (theme === PUFFERGO_THEME || theme.startsWith(`${PUFFERGO_THEME}-`)) return 'puffergo';
  if (STOCK_THEME.test(theme)) return 'default';
  return 'custom';
}

async function probe(cfg: SiloConfig): Promise<ProbeResult> {
  const base = normalizeUrl(cfg.siteUrl);
  const auth = `Basic ${Buffer.from(`${cfg.username}:${cfg.appPassword}`).toString('base64')}`;
  const get = async (url: string) =>
    nodeNetwork.request({ method: 'GET', url, headers: { Authorization: auth, 'Content-Type': 'application/json' } });
  const ok = (status: number) => status >= 200 && status < 300;

  const [index, me, pluginRes, schemaRes, mailRes, designRes, frontRes] = await Promise.all([
    get(`${base}/wp-json/`),
    get(`${base}/wp-json/wp/v2/users/me?context=edit&_fields=id,capabilities`),
    get(`${base}/wp-json/wp/v2/plugins?_fields=plugin,textdomain,status,version`),
    get(`${base}/wp-json/wp-abilities/v1/abilities/puffergo/get-product-schema/run`),
    // PufferGo's own plugin catalogue — the only place that also knows 邮件插件 的状态。它需要
    // install_plugins，所以编辑器账号这里拿 403，这不是错误，只是这一项查不到。
    get(`${base}/wp-json/puffergo/v1/plugin-setup/config`),
    // 设计令牌：只要求 edit_posts，所以编辑器账号也读得到。
    get(`${base}/wp-json/puffergo/v1/design-system`),
    // 前台 HTML 里就写着主题目录名 —— 唯一不需要任何权限的主题探测方式，而且顺带证明站点真能渲染。
    // 加个查询串，避开页面缓存返回旧主题。
    get(`${base}/?puffergo-probe=theme`),
  ]);

  const caps = ok(me.status) ? readCaps(me.json) : null;
  // `context=edit` can be blocked outright by a security plugin while the password itself is fine, so a
  // failed capabilities read must not be mistaken for a dead credential.
  let connected = ok(me.status);
  if (!connected) connected = ok((await get(`${base}/wp-json/wp/v2/users/me?_fields=id`)).status);

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

  // 邮件插件状态：只信 PufferGo 接口自报的 install_status，查不到就说查不到（不猜「没装」）。
  const mailRow = ok(mailRes.status)
    ? (
        (mailRes.json as { data?: { plugins?: Array<{ slug?: string; install_status?: string }> } } | undefined)?.data
          ?.plugins ?? []
      ).find(p => p.slug === FLUENT_SMTP_SLUG)
    : undefined;
  const mail: ProbeResult['mail'] = !ok(mailRes.status)
    ? 'unknown'
    : !mailRow
      ? 'missing'
      : mailRow.install_status === 'activated'
        ? 'active'
        : mailRow.install_status === 'installed'
          ? 'inactive'
          : 'missing';

  // 设计令牌：schemes 为空或没有 activeSchemeId 就是「还没生成」。
  const designData = ok(designRes.status)
    ? (designRes.json as { data?: { schemes?: unknown[]; activeSchemeId?: string } } | undefined)?.data
    : undefined;
  const design: ProbeResult['design'] = !ok(designRes.status)
    ? 'unknown'
    : designData && (designData.schemes ?? []).length > 0 && !!designData.activeSchemeId
      ? 'ready'
      : 'missing';

  const themeMatch = ok(frontRes.status)
    ? /wp-content\/themes\/([A-Za-z0-9._-]+)/.exec(frontRes.text ?? '')
    : null;

  return {
    siteUrl: cfg.siteUrl,
    connected,
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
    mail,
    design,
    theme: themeMatch ? themeMatch[1]! : null,
    canListPlugins: plugins !== null,
    caps,
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
  const theme = themeState(p.theme);

  const problems: string[] = [];
  if (!p.connected)
    problems.push('The saved Application Password does not authenticate — run `puffergo login <siteUrl>` again.');
  if (!p.abilitiesApi)
    problems.push('WordPress is older than 6.9 (no Abilities API) — update WordPress itself; the CLI cannot.');
  if (pluginTooOld)
    problems.push(
      `The PufferGo plugin's product-file version is ${p.schemaVersion}; this CLI understands ${MIN_SCHEMA_VERSION}–${SUPPORTED_SCHEMA_VERSION} — update the PufferGo plugin in wp-admin.`,
    );
  if (p.puffergo !== 'active' && !pluginTooOld) problems.push('The PufferGo plugin is not active.');
  if (!p.seo)
    problems.push(
      'No SEO plugin is active, so SEO fields (title/description/focus keyword) have nowhere to be written.',
    );
  if (theme === 'default')
    problems.push(
      `The site still renders WordPress's default theme (${p.theme}), so PufferGo pages come out unstyled — \`puffergo site setup install\` installs and activates GeneratePress.`,
    );
  if (p.caps && !p.caps.installPlugins && needs.filter(n => n !== 'wordpress-6.9').length)
    problems.push(
      'This account cannot install or activate plugins — a WordPress administrator has to do it in wp-admin (Plugins → Add New).',
    );

  // wp-admin entries, built here so the AI never assembles a URL itself: an editor handed a
  // manage_options link only ever sees "Sorry, you are not allowed to access this page".
  const base = normalizeUrl(p.siteUrl);
  const adminPage = (slug: string) => `${base}/wp-admin/admin.php?page=${slug}`;
  const links: Record<string, string> = {};
  if (!p.caps || p.caps.editPosts || p.caps.manageOptions) links.aiSiteBuilder = adminPage('puffergo-ai-site-builder');
  if (p.caps?.manageOptions) {
    links.siteProfile = adminPage('puffergo-site-profile');
    links.settings = adminPage('puffergo-settings');
  }

  // 「能开始建站」和「什么都齐了」是两件事：SEO 字段要等 SEO 插件，但那不该挡住画像和整站生成。
  const coreReady = p.connected && p.abilitiesApi && p.puffergo === 'active' && !pluginTooOld && theme !== 'default';
  const ready = coreReady && !!p.seo;

  return {
    site: p.siteUrl,
    connected: p.connected,
    ...(p.caps
      ? {
          account: {
            canEditPosts: p.caps.editPosts,
            canManageOptions: p.caps.manageOptions,
            canInstallPlugins: p.caps.installPlugins,
            reach: p.caps.manageOptions ? 'administrator' : p.caps.editPosts ? 'editor' : 'none',
          },
        }
      : {}),
    wordpress: { abilitiesApi: p.abilitiesApi },
    puffergoPlugin: { state: p.puffergo, schemaVersion: p.schemaVersion },
    theme: {
      active: p.theme,
      state: theme,
      ...(theme === 'puffergo'
        ? {}
        : theme === 'default'
          ? { note: 'Stock WordPress theme — PufferGo styles do not apply until GeneratePress is active.' }
          : theme === 'custom'
            ? {
                note: "This site runs someone's own theme. It is deliberately left alone — switching it would replace their design. PufferGo builds pages for GeneratePress; `--activate-theme` forces the switch if the customer wants it.",
              }
            : { note: 'Could not read which theme the site renders (it may not be publicly reachable yet), so nothing was changed.' }),
    },
    designTokens: { state: p.design },
    seoPlugin: { active: p.seo },
    // 邮件单独一行：客户问得最多的就是「询盘能不能收到」，而这跟 SEO 插件不是一回事。
    mailPlugin: {
      state: p.mail,
      ...(p.mail === 'active'
        ? {
            note: 'Installed and active. Whether mail actually gets delivered still depends on the SMTP account configured in wp-admin → FluentSMTP — only a test message proves it.',
          }
        : p.mail === 'unknown'
          ? { note: 'Could not be checked (needs an administrator account with plugin permissions).' }
          : {
              note: 'No SMTP plugin is active, so inquiry-form mail goes out through the host\'s PHP mail — frequently filtered as spam or refused outright. Install it with `puffergo plugins install fluent-smtp --customer-said "…"`, then set up the mailbox.',
            }),
    },
    ...(Object.keys(links).length
      ? {
          wpAdmin: {
            links,
            // 'unknown' means the site hid the capabilities — the builder link is still safe (edit_posts).
            reachableFor: p.caps
              ? p.caps.manageOptions
                ? 'administrator'
                : p.caps.editPosts
                  ? 'editor'
                  : 'none'
              : 'unknown',
            ...(p.caps
              ? {}
              : {
                  note: "The site did not disclose this account's capabilities, so only the AI site builder link is given — it is the one page that needs nothing beyond edit_posts.",
                }),
          },
        }
      : {}),
    needsInstall: needs.filter(n => n !== 'wordpress-6.9'),
    ...(problems.length ? { problems } : {}),
    coreReady,
    ready,
  };
}

// ---- 后台安装：分离进程 + 一个 job 文件 ------------------------------------
//
// 为什么不是「发个请求不等结果」：PHP 在连接断开后会中止请求，插件可能装一半。分离进程把连接一直
// 握在手里，父命令退出了它还在跑 —— 跟 `login` 的 `__login-wait` 是同一套路。

interface BgJob {
  id: string;
  site: string;
  plugins: string[];
  state: 'running' | 'done' | 'partial' | 'failed';
  startedAt: string;
  finishedAt?: string;
  results?: Record<string, string>;
  error?: string;
}

const jobPath = (id: string) => join(jobsDir(), `${id}.json`);

const newJobId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

async function writeJob(job: BgJob): Promise<void> {
  await mkdir(jobsDir(), { recursive: true });
  await writeFile(jobPath(job.id), JSON.stringify(job, null, 2), 'utf8');
}

/** 这台电脑上，这个站最近一次后台安装。读不到（没跑过 / 文件坏了）就给 null。 */
async function latestJob(siteUrl: string): Promise<BgJob | null> {
  const site = normalizeUrl(siteUrl);
  let files: string[];
  try {
    files = await readdir(jobsDir());
  } catch {
    return null;
  }
  let best: BgJob | null = null;
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const job = JSON.parse(await readFile(join(jobsDir(), f), 'utf8')) as BgJob;
      if (job.site !== site) continue;
      if (!best || job.startedAt > best.startedAt) best = job;
    } catch {
      // 坏文件跳过，不影响报告
    }
  }
  return best;
}

/** 清理过期 job 文件，别让 ~/.puffergo/jobs 越攒越多。 */
async function pruneJobs(): Promise<void> {
  const cutoff = Date.now() - JOB_KEEP_DAYS * 86_400_000;
  try {
    for (const f of await readdir(jobsDir())) {
      if (!f.endsWith('.json')) continue;
      try {
        const job = JSON.parse(await readFile(join(jobsDir(), f), 'utf8')) as BgJob;
        if (Date.parse(job.startedAt) < cutoff) await rm(join(jobsDir(), f), { force: true });
      } catch {
        // 坏文件不理
      }
    }
  } catch {
    // best effort
  }
}

function jobView(job: BgJob): Record<string, unknown> {
  return {
    id: job.id,
    state: job.state,
    plugins: job.plugins,
    startedAt: job.startedAt,
    ...(job.finishedAt ? { finishedAt: job.finishedAt } : {}),
    ...(job.results ? { results: job.results } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
}

/** 把后台任务的状态贴到报告上：正在装的那几个，从 needsInstall 里摘掉，免得 AI 以为还没装。 */
function withBackground(out: Record<string, unknown>, job: BgJob | null): Record<string, unknown> {
  if (!job) return out;
  const needs = Array.isArray(out.needsInstall) ? (out.needsInstall as string[]) : [];
  return {
    ...out,
    background: jobView(job),
    ...(job.state === 'running'
      ? { needsInstall: needs.filter(n => !job.plugins.includes(n)) }
      : {}),
  };
}

/** 客户同意的插件装不装、怎么装。`--background none` 关掉后台（都同步装，命令会慢）。 */
function backgroundSlugs(ctx: CmdCtx): string[] {
  const raw = ctx.flags.get('background');
  if (raw === undefined) return BACKGROUND_SLUGS;
  const list = raw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(s => s && s !== 'none' && s !== 'false');
  return list;
}

async function startBackground(ctx: CmdCtx, cfg: SiloConfig, plugins: string[]): Promise<BgJob | null> {
  if (!plugins.length) return null;
  const job: BgJob = {
    id: newJobId(),
    site: normalizeUrl(cfg.siteUrl),
    plugins,
    state: 'running',
    startedAt: new Date().toISOString(),
  };
  await writeJob(job);
  // 用同一个脚本再起一个进程，父进程退出后它继续跑（`__login-wait` 同款）。
  // 环境必须剥掉宿主注入的 fs preload：那个 shim 把写盘转给「本命令的 broker」，
  // 后台任务活过了命令，broker 早没了，job 状态就写不进去。
  const child = spawn(
    process.execPath,
    [...stripSandboxExecArgv(process.execArgv), process.argv[1]!, '__bg-install', job.id, job.site, '--dir', ctx.dir],
    { detached: true, stdio: 'ignore', windowsHide: true, env: sandboxFreeEnv() },
  );
  child.unref();
  void pruneJobs();
  return job;
}

/** `__bg-install` 的实现：装完写 job 文件，没 stdout（父进程早已退出）。 */
export async function cmdBgInstall(jobId: string, siteUrl: string, dir: string): Promise<void> {
  let job: BgJob = {
    id: jobId,
    site: normalizeUrl(siteUrl),
    plugins: [],
    state: 'running',
    startedAt: new Date().toISOString(),
  };
  try {
    job = { ...job, ...(JSON.parse(await readFile(jobPath(jobId), 'utf8')) as BgJob) };
  } catch {
    // job 文件被清掉了：按传进来的参数照跑，只是没记录可写
  }

  const results: Record<string, string> = {};
  try {
    const { config } = await resolveSite(dir, siteUrl);
    const client = new WpClient(nodeNetwork, {
      siteUrl: config.siteUrl,
      username: config.username,
      appPassword: config.appPassword,
    });
    for (const slug of job.plugins) {
      try {
        results[slug] = (await client.ensurePluginActive(slug)).action;
      } catch (e) {
        results[slug] =
          e instanceof WpHttpError ? `http_${e.status}` : e instanceof Error ? e.message : 'error';
      }
    }
  } catch (e) {
    await writeJob({
      ...job,
      state: 'failed',
      results,
      finishedAt: new Date().toISOString(),
      error: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  const done = Object.values(results).filter(r => r === 'already_active' || r === 'activated' || r === 'installed').length;
  await writeJob({
    ...job,
    state: done === job.plugins.length ? 'done' : done ? 'partial' : 'failed',
    results,
    finishedAt: new Date().toISOString(),
  });
}

// ---- 插件自带的初始化端点 --------------------------------------------------

interface SiteInitResult {
  ran: boolean;
  url: string;
  theme?: {
    state: 'active' | 'failed';
    /** GeneratePress 之前就已经装在站上（只是没启用）—— 说明插件自带的 cron 早就跑过了。 */
    wasPresent: boolean;
    activeBefore: string | null;
    error?: string;
  };
  urls?: { updated: boolean; siteurl: string; home: string };
  /**
   * 样板数据（产品/方案/案例/证言/博客 + 样板首页 + 结构页 + 两份菜单）。
   * 默认就导；只有显式 `--no-sample-data` 时整个字段缺席。
   */
  sampleData?: {
    imported: boolean;
    /** CPT slug → 新建条数。站上早就导过样板时不会有这个字段（本次没重复建 CPT）。 */
    counts?: Record<string, number>;
    /** 本次是复用已有样板（只补了缺的首页/菜单），不是新导入。 */
    reused: boolean;
  };
  skipped?: string;
  note?: string;
  error?: string;
}

/**
 * `POST /puffergo/v1/setup` —— 插件装好后该跑的那一步：装并启用 GeneratePress、把 siteurl/home 改成
 * 对外地址、设计令牌还没生成就现在生成。要求 manage_options（管理员账号）。
 *
 * 换主题是不可逆地打乱版式，所以只在安全时跑：已经是 GeneratePress、或者站点还在 WordPress 自带
 * 主题上（没人在上面做过设计）。已有自定义主题的站一律不碰，除非客户明确要 `--activate-theme`。
 */
async function runSiteInit(ctx: CmdCtx, cfg: SiloConfig, before: ProbeResult): Promise<SiteInitResult> {
  const url = normalizeUrl(ctx.flags.get('url') ?? cfg.siteUrl);
  const theme = themeState(before.theme);
  const force = ctx.flags.get('activate-theme') === 'true';
  // 样板数据默认导：建完站客户第一眼看的就是首页，空站 + Hello world 比「假内容」更糟。
  // 关掉的唯一方式是显式 `--no-sample-data`（`--sample-data=false` 也认）。
  // 客户站上已经有自己的东西时，用 `--no-sample-data` 跳过，避免凭空多出别人的案例。
  const sampleFlag = ctx.flags.get('sample-data');
  const wantsSample =
    ctx.flags.get('no-sample-data') !== 'true' && sampleFlag !== 'false';

  if (!force && (theme === 'custom' || theme === 'unknown')) {
    return {
      ran: false,
      url,
      skipped: theme,
      note:
        (theme === 'custom'
          ? `This site runs its own theme (${before.theme}); GeneratePress was NOT activated — that would replace the customer's design. Add --activate-theme only if the customer asks for it.`
          : 'Could not read the active theme, so nothing was switched. Re-run once the site is publicly reachable, or add --activate-theme to force it.') +
        (wantsSample ? ' Demo content was NOT imported either — the whole setup step was skipped.' : ''),
    };
  }

  const base = normalizeUrl(cfg.siteUrl);
  const auth = `Basic ${Buffer.from(`${cfg.username}:${cfg.appPassword}`).toString('base64')}`;
  const res = await nodeNetwork.request({
    method: 'POST',
    url: `${base}/wp-json/puffergo/v1/setup`,
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: { url, import_sample_data: wantsSample },
  });

  if (res.status === 404)
    return {
      ran: false,
      url,
      error: 'endpoint_missing',
      note: 'This PufferGo version has no /setup endpoint — update the PufferGo plugin in wp-admin, then run `puffergo site setup install` again.',
    };
  if (res.status === 401 || res.status === 403)
    return {
      ran: false,
      url,
      error: 'needs_admin',
      note: 'Only an administrator (manage_options) may run the setup step. Use an admin account\'s Application Password, or in wp-admin: Appearance → Themes → Activate GeneratePress, and Settings → General → set both WordPress Address and Site Address.',
    };
  if (res.status < 200 || res.status >= 300)
    return { ran: false, url, error: `http_${res.status}`, note: 'The setup step failed; nothing else was changed.' };

  const data = res.json as
    | {
        theme?: { activated?: boolean; was_present?: boolean; error?: string };
        urls?: { updated?: boolean; siteurl?: string; home?: string; error?: string };
        sample_data?: { imported?: boolean; counts?: Record<string, number> };
      }
    | undefined;
  const themeResult = data?.theme;
  const sample = data?.sample_data;
  return {
    ran: true,
    url,
    theme: {
      state: themeResult?.activated ? 'active' : 'failed',
      wasPresent: !!themeResult?.was_present,
      activeBefore: before.theme,
      ...(themeResult?.error ? { error: themeResult.error } : {}),
    },
    urls: {
      updated: !!data?.urls?.updated,
      siteurl: data?.urls?.siteurl ?? '',
      home: data?.urls?.home ?? '',
    },
    ...(sample
      ? {
          sampleData: {
            imported: !!sample.imported,
            // 没 counts = 站上早就导过，这次只补了首页/菜单/菜单项。
            reused: !!sample.imported && !sample.counts,
            ...(sample.counts ? { counts: sample.counts } : {}),
          },
        }
      : {}),
  };
}

// ---- install ---------------------------------------------------------------

/** CPT slug → 客户看得懂的复数说法（接口返回的是 post type，不是人话）。 */
const SAMPLE_LABELS: Record<string, string> = {
  puffergo_product: 'products',
  puffergo_solution: 'solutions',
  puffergo_case: 'case studies',
  puffergo_testimonial: 'testimonials',
  post: 'blog posts',
};

/**
 * 样板数据的结果必须明说。它是默认动作：样板会把首页指到演示页、菜单换成演示结构，
 * 不报出来，客户打开站只会以为自己的站被谁改了。
 */
function sampleDataNote(sample: SiteInitResult['sampleData']): string {
  if (!sample?.imported) return '';
  if (sample.reused)
    return ' Demo content was already on this site — this run only added the missing homepage / menu pieces. It is placeholder content: swap it out as the customer\'s own copy lands.';
  const counts = Object.entries(sample.counts ?? {})
    .filter(([, n]) => n > 0)
    .map(([cpt, n]) => `${n} ${SAMPLE_LABELS[cpt] ?? cpt}`)
    .join(', ');
  return ` Demo content imported${counts ? ` (${counts})` : ''}; the front page is now the demo homepage and the menus are the demo structure. That is placeholder content, not the customer's — say so in one line so they are not surprised, then swap it out as their real copy lands. Delete all of it any time in wp-admin → PufferGo → Dashboard → "Sample Data & Showroom" → "Delete Sample Data" (the front page reverts with it).`;
}

/** `--no-sample-data` 时站点就是空的：说清楚，别让 AI 以为导入失败了。 */
function sampleSkippedNote(): string {
  return ' Sample content was skipped on purpose (--no-sample-data): the site has no demo pages, no demo homepage and no menus yet — the front page is still the bare WordPress blog. That is expected, not a failed import.';
}

async function install(ctx: CmdCtx, cfg: SiloConfig): Promise<Out> {
  const said = (ctx.flags.get('customer-said') ?? '').trim();
  const sampleDisabled =
    ctx.flags.get('no-sample-data') === 'true' || ctx.flags.get('sample-data') === 'false';
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
    // PufferGo 本身必须同步装上——后面的初始化、建页面全靠它。
    actions.puffergo =
      before.puffergo === 'active' ? 'already_active' : (await client.ensurePluginActive(PUFFERGO_SLUG)).action;
  } catch (e) {
    if (e instanceof WpHttpError && (e.status === 401 || e.status === 403))
      return {
        ok: false,
        code: 'needs_manual_install',
        fix: 'user',
        actions,
        message:
          'This account cannot install or activate plugins (WordPress needs an admin for that). In wp-admin: Plugins → Add New → search "PufferGo" → Install Now → Activate. Afterwards run `puffergo site setup` again to verify.',
      };
    throw e;
  }

  // 主题 + 站点地址 + 设计令牌。这一步以前根本没人调，所以站上一直是 WordPress 默认主题。
  const siteInit = await runSiteInit(ctx, cfg, before);

  // SEO / SMTP 不挡建站，默认丢给分离进程，本命令不等它们；`--background none` 就同步装（会慢）。
  const bgSlugs = backgroundSlugs(ctx);
  const syncSlugs = BACKGROUND_SLUGS.filter(s => !bgSlugs.includes(s));
  for (const slug of syncSlugs) {
    // 站上已经有 SEO 插件（Rank Math 或 Yoast）就留着它——PufferGo 会写到当前生效的那个。
    if (slug === RANKMATH_SLUG && before.seo) {
      actions.rankMath = `skipped_${before.seo}_active`;
      continue;
    }
    try {
      actions[slug] = (await client.ensurePluginActive(slug)).action;
    } catch (e) {
      if (e instanceof WpHttpError && (e.status === 401 || e.status === 403))
        return {
          ok: false,
          code: 'needs_manual_install',
          fix: 'user',
          actions,
          message: `This account cannot install or activate plugins (WordPress needs an admin for that). In wp-admin: Plugins → Add New → search for it manually, then run \`puffergo site setup\` again.`,
        };
      throw e;
    }
  }
  const background = bgSlugs.length ? await startBackground(ctx, cfg, bgSlugs) : null;

  // 地址换过就别再用旧域名探测：WP 会把旧域名 301 到新域名。新地址有时还没解析好
  // （刚在主机面板绑的域名），那就退回旧地址探测，别把「域名还没生效」报成「站点连不上」。
  const oldUrl = normalizeUrl(cfg.siteUrl);
  const movedTo = siteInit.ran && siteInit.url !== oldUrl ? siteInit.url : null;
  let after = await probe(movedTo ? { ...cfg, siteUrl: movedTo } : cfg);
  let reachableAtNewUrl = true;
  if (movedTo && !after.connected) {
    after = await probe(cfg);
    reachableAtNewUrl = false;
  }
  const r = withBackground(report(after), background ?? (await latestJob(cfg.siteUrl)));
  const coreReady = r.coreReady === true;
  const sampleNote = sampleDataNote(siteInit.sampleData) || (sampleDisabled ? sampleSkippedNote() : '');

  return {
    ok: coreReady,
    ...r,
    actions,
    siteInit,
    ...(movedTo
      ? {
          account: {
            ...(r.account && typeof r.account === 'object' ? (r.account as Record<string, unknown>) : {}),
            note: reachableAtNewUrl
              ? `The site's own address is now ${movedTo}. Point this folder at it before building pages: \`puffergo login ${movedTo}\` (or \`--site\`).`
              : `WordPress now says its address is ${movedTo}, but that address does not answer yet (DNS/SSL still propagating). Keep using ${oldUrl} for now; once it answers, run \`puffergo login ${movedTo}\`.`,
          },
        }
      : {}),
    ...(coreReady
      ? {}
      : {
          message:
            'The site is NOT ready to build on yet — see problems. ' +
            "WordPress core and plugin UPDATES cannot be installed from here; guide the customer through wp-admin for those.",
        }),
    next: coreReady
      ? (background
          ? `Core is ready (plugin + theme + site address${siteInit.ran ? '' : ', theme untouched'}). ${background.plugins.join(' / ')} are installing in the background — do NOT wait and do NOT ask the customer anything about plugins. The next step is the SITE PROFILE: run \`puffergo profile ask\`, ask every group it returns in ONE message, save with \`puffergo profile set\`. The profile is what every page, product and post is written from, and it is the source AI answer engines quote — say that before you ask. Run \`puffergo site setup\` later to confirm the background plugins landed before writing SEO fields.${sampleNote}`
          : `Core is ready. The next step is the SITE PROFILE — run \`puffergo profile ask\`, ask every group it returns in ONE message, save with \`puffergo profile set\`. Nothing else (products, pages, design) gets discussed before that.${sampleNote}`)
      : 'Fix what problems lists, then run `puffergo site setup` again.',
  };
}

export async function cmdSiteSetup(ctx: CmdCtx): Promise<Out> {
  try {
    const { config } = await resolveSite(ctx.dir, ctx.flags.get('site'));
    const sub = ctx.positional[0];
    if (sub === 'install') return await install(ctx, config);
    if (sub !== undefined) return { ok: false, code: 'usage', message: SITE_SETUP_USAGE };

    const p = await probe(config);
    const r = withBackground(report(p), await latestJob(config.siteUrl));
    const coreReady = r.coreReady === true;
    const job = r.background as { state?: string; plugins?: string[] } | undefined;
    return {
      ok: true,
      ...r,
      ...(r.ready === true
        ? { next: 'The site is ready for PufferGo.' }
        : coreReady
          ? {
              next:
                job?.state === 'running'
                  ? `Core is ready (plugin + theme + site address). ${(job.plugins ?? []).join(' / ')} are still installing in the background — do NOT wait and do NOT tell the customer to install anything. The next step is the SITE PROFILE: run \`puffergo profile ask\`, ask all of it in ONE message, save with \`puffergo profile set\`. Run \`puffergo site setup\` once before writing page SEO fields.`
                  : 'Core is ready. The next step is the SITE PROFILE (`puffergo profile ask` → one message → `profile set`). The SEO plugin is still missing; install it later with `puffergo site setup install --customer-said "<their exact words>"`.',
            }
          : {
              next: 'Show the customer what is missing (problems/needsInstall) and ask to install. If they agree, run `puffergo site setup install --customer-said "<their exact words>"`. WordPress core and plugin UPDATES cannot be installed from here — guide the customer through wp-admin for those.',
            }),
    };
  } catch (e) {
    const siteErr = siteErrorOutput(e);
    if (siteErr) return siteErr;
    return { ok: false, code: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
