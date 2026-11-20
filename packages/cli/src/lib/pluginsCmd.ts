/**
 * `puffergo plugins` — 装/看站点上那些「PufferGo 需要、但不是 PufferGo」的插件（SEO、邮件、电商…）。
 *
 * 白名单不写在这里：真正决定「哪些能装」的是 PufferGo 插件自己的接口
 *   GET  /wp-json/puffergo/v1/plugin-setup/config   → 插件目录 + 本站实时安装状态 + 按场景分组
 *   POST /wp-json/puffergo/v1/plugin-setup/install  → 按 slug 安装并激活（服务端校验白名单）
 * 服务端加一个插件，这里自动就能装，CLI 不用跟着发版。
 *
 *   puffergo plugins list                        → 只读：哪些已装、哪些没装、各自干嘛
 *   puffergo plugins install <slug…> --customer-said "…" → 装并激活（改客户的站，必须先拿到同意）
 *
 * 为什么不让 AI 直接调 /wp/v2/plugins：那条路只能按 slug 装 wordpress.org 插件而没有任何白名单，
 * 模型手一抖就能往客户的站上装任何东西；这里把「能装什么」交回服务端定，模型只负责转达。
 *
 * PufferGo 插件没装时这些接口不存在（404），此时唯一的自举路径是 `puffergo site setup install`。
 */

import { resolveSite } from './site';
import { nodeNetwork } from '../adapters/nodeNetwork';
import { siteErrorOutput, type CmdCtx, type Out } from './siteCmd';

export const PLUGINS_USAGE =
  'puffergo plugins <list|install <slug…> --customer-said "<customer words>"> [--dir <workdir>] [--site <url>]';

/** 一条插件目录项，跟着插件接口的字段走（不在这里做二次解释）。 */
interface CatalogPlugin {
  slug: string;
  name: string;
  description?: string;
  notes?: string;
  install_status?: 'not_installed' | 'installed' | 'activated' | string;
}

interface Catalog {
  version?: string;
  scenarios?: Array<{ key: string; label: string }>;
  plugins: CatalogPlugin[];
  rules?: Record<string, string[]>;
}

/** 中文说法，避免 AI 自己翻译出「未安装/已激活」两套口径。 */
const STATE_ZH: Record<string, string> = {
  activated: '已装并启用',
  installed: '已装未启用',
  not_installed: '没装',
};

async function call(
  cfg: { siteUrl: string; username: string; appPassword: string },
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const base = cfg.siteUrl.replace(/\/+$/, '');
  const auth = `Basic ${Buffer.from(`${cfg.username}:${cfg.appPassword}`).toString('base64')}`;
  return nodeNetwork.request({
    method,
    url: `${base}/wp-json/puffergo/v1/plugin-setup/${path}`,
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body }),
  });
}

/** 读目录；接口不在（PufferGo 没装/太旧）时给一条能照做的出路，而不是一句 HTTP 404。 */
async function readCatalog(cfg: { siteUrl: string; username: string; appPassword: string }): Promise<
  { ok: true; catalog: Catalog } | { ok: false; out: Out }
> {
  const res = await call(cfg, 'GET', 'config');
  if (res.status === 404)
    return {
      ok: false,
      out: {
        ok: false,
        code: 'puffergo_plugin_missing',
        fix: 'run_site_setup',
        message:
          '这个站上没有 PufferGo 插件（或版本太旧），装其他插件的能力是插件提供的。先跑 `puffergo site setup install --customer-said "<客户原话>"` 把插件装上，再回来。',
      },
    };
  if (res.status < 200 || res.status >= 300)
    return {
      ok: false,
      out: {
        ok: false,
        code: `http_${res.status}`,
        message:
          res.status === 401 || res.status === 403
            ? '这个账号没有装插件的权限（install_plugins）。让站点管理员在 wp-admin → 插件 → 安装插件 里装，或换一个管理员账号的应用密码。'
            : `插件目录读取失败（HTTP ${res.status}）。`,
      },
    };
  const data = (res.json as { data?: Catalog } | undefined)?.data;
  if (!data || !Array.isArray(data.plugins))
    return { ok: false, out: { ok: false, code: 'bad_payload', message: '插件目录返回的内容看不懂，先跳过。' } };
  return { ok: true, catalog: data };
}

/** 目录 → 给 AI 看的清单（英文键 + 中文人话，AI 直接念中文那列）。 */
function describe(catalog: Catalog): Omit<Out, 'ok'> {
  const bySlug = new Map(catalog.plugins.map(p => [p.slug, p]));
  return {
    version: catalog.version,
    plugins: catalog.plugins.map(p => ({
      slug: p.slug,
      name: p.name,
      state: p.install_status ?? 'unknown',
      stateZh: STATE_ZH[p.install_status ?? ''] ?? '未知',
      ...(p.description ? { description: p.description } : {}),
      ...(p.notes ? { notes: p.notes } : {}),
    })),
    ...(catalog.rules
      ? {
          groups: Object.fromEntries(
            Object.entries(catalog.rules).map(([key, slugs]) => [
              key,
              slugs.map(s => bySlug.get(s)?.name ?? s),
            ]),
          ),
        }
      : {}),
  };
}

async function listPlugins(ctx: CmdCtx): Promise<Out> {
  const cfg = (await resolveSite(ctx.dir, ctx.flags.get('site'))).config;
  const res = await readCatalog(cfg);
  if (!res.ok) return res.out;
  const described = describe(res.catalog);
  const missing = (described.plugins as Array<{ name: string }>).length
    ? ''
    : '（目录是空的，服务端的插件表可能没配）';
  return {
    ok: true,
    site: cfg.siteUrl,
    ...described,
    ...(missing ? { note: missing } : {}),
    next: '要装就把客户同意的那几个 slug 传给 `puffergo plugins install`；没同意之前只说现状，别自己装。',
  };
}

async function installPlugins(ctx: CmdCtx): Promise<Out> {
  const said = (ctx.flags.get('customer-said') ?? '').trim();
  if (!said)
    return {
      ok: false,
      code: 'needs_customer_request',
      fix: 'user',
      message:
        '装插件会改客户的站。先把 `puffergo plugins list` 的结果讲给客户（哪几个没装、各自干嘛），等他说行，再带 --customer-said "<他的原话>" 跑这条。',
    };

  const wanted = ctx.positional
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  if (!wanted.length)
    return { ok: false, code: 'usage', fix: 'ai', message: PLUGINS_USAGE };

  const cfg = (await resolveSite(ctx.dir, ctx.flags.get('site'))).config;
  const res = await readCatalog(cfg);
  if (!res.ok) return res.out;

  const allowed = new Map(res.catalog.plugins.map(p => [p.slug.toLowerCase(), p]));
  const unknown = wanted.filter(s => !allowed.has(s));
  if (unknown.length)
    return {
      ok: false,
      code: 'unknown_plugin',
      fix: 'ai',
      message: `这些不在可装清单里：${unknown.join('、')}。能装的是：${[...allowed.keys()].join('、')}。`,
    };

  // 已经是「已装并启用」的不必再折腾一遍，直接如实回话。
  const already = wanted.filter(s => allowed.get(s)?.install_status === 'activated');
  const toInstall = wanted.filter(s => !already.includes(s));
  const actions: Array<Record<string, unknown>> = already.map(slug => ({
    slug,
    name: allowed.get(slug)?.name,
    result: 'already_activated',
    message: '本来就已经装好并启用了。',
  }));

  if (toInstall.length) {
    const post = await call(cfg, 'POST', 'install', { selected: toInstall });
    if (post.status === 401 || post.status === 403)
      return {
        ok: false,
        code: 'needs_manual_install',
        fix: 'user',
        actions,
        message:
          '这个账号没有装插件的权限（需要 install_plugins）。让管理员在 wp-admin → 插件 → 安装插件 里搜插件名装上并启用，装完再跑 `puffergo plugins list` 确认。',
      };
    if (post.status < 200 || post.status >= 300)
      return {
        ok: false,
        code: `http_${post.status}`,
        actions,
        message: `安装请求失败（HTTP ${post.status}），站上什么都没变。`,
      };
    const results = (post.json as { results?: Array<Record<string, unknown>> } | undefined)?.results ?? [];
    actions.push(...results);
  }

  // 装完重读一次目录：以站点自报的状态为准，不信安装接口自己的回执。
  const after = await readCatalog(cfg);
  const stateOf = (slug: string) =>
    after.ok ? (after.catalog.plugins.find(p => p.slug.toLowerCase() === slug)?.install_status ?? 'unknown') : 'unknown';
  const failed = wanted.filter(s => stateOf(s) !== 'activated');
  const described = after.ok ? describe(after.catalog).plugins : [];

  return {
    ok: failed.length === 0,
    site: cfg.siteUrl,
    actions,
    ...(after.ok ? { plugins: described } : {}),
    ...(failed.length
      ? {
          failed: failed.map(s => ({ slug: s, name: allowed.get(s)?.name, state: stateOf(s) })),
          message: `这几个没装上：${failed.map(s => allowed.get(s)?.name ?? s).join('、')}。多数是主机的文件权限或 wordpress.org 连不上，让客户在 wp-admin → 插件 → 安装插件 里手动装一次最快。`,
        }
      : { next: '把这些如实告诉客户（装了几个、各自干嘛），再往下走。' }),
  };
}

export async function cmdPlugins(sub: string | undefined, ctx: CmdCtx): Promise<Out> {
  try {
    switch (sub) {
      case 'list':
        return await listPlugins(ctx);
      case 'install':
        return await installPlugins(ctx);
      default:
        return { ok: false, code: 'usage', message: PLUGINS_USAGE };
    }
  } catch (e) {
    const siteErr = siteErrorOutput(e);
    if (siteErr) return siteErr;
    return { ok: false, code: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
