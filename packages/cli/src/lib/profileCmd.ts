/**
 * `puffergo profile …` — the site profile (brand, audience, trust data, keywords) as something an AI can
 * read before it writes, and write without a human copying text between windows.
 *
 * The profile is the one source every generated page, product and post is written from, so `get` is the
 * first thing to run before authoring anything for a site: it says what the site sells, who it sells to,
 * what it is proud of, and which of those are still blank.
 *
 * Everything that has to be enforced — products<=3, keywords<=30, the tone and channel whitelists — is
 * enforced by the plugin, not here: `check` is the same sanitizing pass `set` runs, just without writing.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { AgentClient, AgentHttpError } from './agentClient';
import { ABILITIES_MISSING } from './siteSchema';
import { client, errorOutput, CodedError, type CmdCtx, type Out } from './siteCmd';

export const PROFILE_USAGE =
  'puffergo profile <get|ask|check <file.json>|set <file.json> [--replace] [--backup <file>]> [--dir <workdir>] [--site <url>]';

export interface ProfileCompleteness {
  filled: number;
  total: number;
  percent: number;
  missing: string[];
}

export interface ProfileWarning {
  field: string;
  kind: string;
  message: string;
}

export interface SiteProfileResult {
  profile?: Record<string, unknown>;
  limits?: Record<string, unknown>;
  completeness?: ProfileCompleteness;
  warnings?: ProfileWarning[];
  previous?: Record<string, unknown>;
  mode?: string;
  updatedAt?: string | null;
  written?: boolean;
}

/**
 * An old plugin simply has no `*-site-profile` abilities; core answers `rest_ability_not_found`. That is
 * not something the AI can fix in the file it is holding, so it becomes the same "update the plugin"
 * answer every other missing ability gives.
 */
function profileError(e: unknown): Out | null {
  if (e instanceof AgentHttpError) {
    const code = (e.body as { code?: string } | undefined)?.code;
    if (code && ABILITIES_MISSING.has(code)) {
      return {
        ok: false,
        code: 'update_plugin',
        fix: 'user',
        message:
          "This site's PufferGo plugin is too old to read or write the site profile. In wp-admin, update the PufferGo plugin to the latest version, then try again.",
      };
    }
  }
  return null;
}

/** Read a profile file, telling the agent apart "not there" from "not JSON" from "not an object". */
async function readProfileFile(file: string | undefined, verb: string): Promise<Record<string, unknown>> {
  if (!file) throw new CodedError('usage', `用法：puffergo profile ${verb} <file.json>`);
  let raw: string;
  try {
    raw = await readFile(resolve(file), 'utf8');
  } catch {
    throw new CodedError('file_not_found', `未找到 profile 文件：${file}`, 'ai');
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new CodedError('invalid_json', `profile 文件不是合法 JSON：${e instanceof Error ? e.message : String(e)}`);
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new CodedError('invalid_json', 'profile 文件顶层必须是一个对象（站点画像 JSON）。');
  }
  // A file holding `{"profile": {...}}` (what `get` prints, or what the ability takes) is accepted as-is.
  const inner = (json as { profile?: unknown }).profile;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return json as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// get — read the site's profile back, with what is still missing
// ---------------------------------------------------------------------------

export async function cmdProfileGet(ctx: CmdCtx): Promise<Out> {
  let c: AgentClient;
  try {
    c = await client(ctx);
  } catch (e) {
    return errorOutput(e);
  }
  try {
    const res = await c.getSiteProfile<SiteProfileResult>();
    return { ok: true, ...res } as Out;
  } catch (e) {
    return profileError(e) ?? errorOutput(e);
  }
}

// ---------------------------------------------------------------------------
// check — the same sanitizing pass `set` runs, without writing
// ---------------------------------------------------------------------------

export async function cmdProfileCheck(ctx: CmdCtx): Promise<Out> {
  let profile: Record<string, unknown>;
  try {
    profile = await readProfileFile(ctx.positional[0], 'check');
  } catch (e) {
    return errorOutput(e);
  }
  let c: AgentClient;
  try {
    c = await client(ctx);
  } catch (e) {
    return errorOutput(e);
  }
  try {
    const res = await c.validateSiteProfile<SiteProfileResult>(profile);
    const warnings = res.warnings ?? [];
    if (warnings.length) {
      return {
        ok: false,
        code: 'profile_warnings',
        fix: 'ai',
        message: `The profile would be saved, but ${warnings.length} thing(s) would be cut or changed — read them, fix the file, and run \`puffergo profile check\` again before \`set\`.`,
        warnings,
        profile: res.profile,
        completeness: res.completeness,
      };
    }
    return { ok: true, valid: true, profile: res.profile, completeness: res.completeness, warnings: [] } as Out;
  } catch (e) {
    return profileError(e) ?? errorOutput(e);
  }
}

// ---------------------------------------------------------------------------
// set — write it: merged into what is there by default, whole with --replace
// ---------------------------------------------------------------------------

export async function cmdProfileSet(ctx: CmdCtx): Promise<Out> {
  let profile: Record<string, unknown>;
  try {
    profile = await readProfileFile(ctx.positional[0], 'set');
  } catch (e) {
    return errorOutput(e);
  }
  const replace = ctx.flags.get('replace') === 'true' || ctx.flags.get('replace') === '';
  let c: AgentClient;
  try {
    c = await client(ctx);
  } catch (e) {
    return errorOutput(e);
  }
  try {
    const res = await c.updateSiteProfile<SiteProfileResult>(profile, replace ? 'replace' : 'merge');

    // The profile as it was: `set` overwrote it, so keeping it on disk is what makes a merge that went
    // the wrong way undoable — send it back with --replace.
    const backup =
      ctx.flags.get('backup') ?? resolve(dirname(ctx.positional[0]!), `${stripJson(ctx.positional[0]!)}.previous.json`);
    if (res.previous) {
      await writeFile(backup, JSON.stringify({ profile: res.previous }, null, 2) + '\n', 'utf8');
    }

    return {
      ok: true,
      mode: res.mode ?? 'merge',
      site: c.siteUrl,
      completeness: res.completeness,
      warnings: res.warnings ?? [],
      previous: backup,
      note: 'Merged into the existing profile — blocks the file does not mention were left as they were. To undo, run `puffergo profile set <file> --replace` with the previous-profile file below.',
    } as Out;
  } catch (e) {
    return profileError(e) ?? errorOutput(e);
  }
}

function stripJson(file: string): string {
  return file.replace(/\.json$/i, '');
}

// ---------------------------------------------------------------------------
// ask — the profile turned into the questions a customer can answer in one pass
// ---------------------------------------------------------------------------

/**
 * 画像那 28 项是按数据结构排的，不是按人脑子排的。客户坐在对面时，一次问 28 个字段没人答得完，
 * 所以这里把它们折成几组能一口气说完的话，并标出哪些不答也能开工（trustData、证言这类
 * 大多数站本来就没有）。已填的字段不再问 —— 客户说过一遍的东西不能再让他说第二遍。
 *
 * 顺序照 COMPLETENESS_FIELDS 走，否则插件那头加字段、这头悄悄漏问，谁都发现不了。
 */
const ASK_GROUPS: Array<{
  id: string;
  label: string;
  why: string;
  canSkip: boolean;
  fields: Array<{ path: string; question: string; example: string }>;
}> = [
  {
    id: 'identity',
    label: '你是谁',
    why: '公司名、行业、产品是每一页都会用到的底层信息；这几项空着，写出来的就是谁都能套的通用话。',
    canSkip: false,
    fields: [
      { path: 'identity.brand_name', question: '公司/品牌的正式名称是什么？', example: 'Ningbo Axion Lighting Co., Ltd.' },
      { path: 'identity.slogan', question: '一句话说清你卖什么、给谁。', example: 'Industrial LED lighting for warehouses and factories' },
      { path: 'identity.founded', question: '哪一年成立的？', example: '2012' },
      { path: 'identity.story', question: '公司是怎么起来的？两三句就够。', example: '2012 年从模具车间起家，2016 年开始做整灯出口。' },
      { path: 'business.industry', question: '你所在的行业怎么说？用英文更准。', example: 'Commercial & industrial LED lighting' },
      { path: 'business.products', question: '主要卖哪几类产品？最多三个。', example: 'LED high bay / linear light / floodlight' },
    ],
  },
  {
    id: 'audience',
    label: '卖给谁',
    why: '同一个产品，写给仓库经理和写给采购，句子完全不一样；地域还决定写不写认证、写不写运费。',
    canSkip: false,
    fields: [
      { path: 'audience.role', question: '你的客户在公司里一般是什么角色？', example: 'Facility manager, procurement manager' },
      { path: 'audience.priorities', question: '他们挑供应商时最在意什么？', example: '交期、认证齐不齐、能不能小批量试单' },
      { path: 'audience.regions', question: '主要卖到哪些国家或地区？', example: '德国、墨西哥、中东' },
    ],
  },
  {
    id: 'advantage',
    label: '凭什么选你',
    why: '这是页面里最有说服力的部分，也是 AI 最容易编套话的地方——你不给，它只能写「品质保证、价格合理」。',
    canSkip: false,
    fields: [
      { path: 'advantage.pillars', question: '客户为什么选你、不选隔壁？列两三条。', example: '自有工厂 / 五年质保 / 七天打样' },
      { path: 'advantage.certifications', question: '有哪些认证或资质？', example: 'CE, RoHS, DLC, ISO 9001' },
      { path: 'advantage.pain_points', question: '客户下单前最常担心什么？', example: '怕货不对板、怕认证过不了、怕交期拖' },
    ],
  },
  {
    id: 'trustData',
    label: '实力数字',
    why: '数字比形容词可信。有几项写几项，没有就空着——编出来的数字一旦被客户看到，比不写更糟。',
    canSkip: true,
    fields: [
      { path: 'trustData.employees', question: '公司多少人？', example: '120' },
      { path: 'trustData.factoryAreaSqm', question: '厂房多少平米？', example: '8000' },
      { path: 'trustData.annualCapacity', question: '年产能大概多少？', example: '500,000 pcs / year' },
      { path: 'trustData.productionLines', question: '几条产线？', example: '6' },
      { path: 'trustData.passRate', question: '良品率多少？', example: '99.3%' },
      { path: 'trustData.servedCountries', question: '卖过多少个国家和地区？', example: '32' },
      { path: 'trustData.servedClients', question: '服务过多少客户？', example: '400+' },
      { path: 'trustData.avgResponseHours', question: '询盘平均多久回复？', example: '8' },
      { path: 'trustData.representativeClients', question: '有代表性的大客户吗？不方便说名字就写类型。', example: '某欧洲连锁仓储' },
    ],
  },
  {
    id: 'testimonials',
    label: '客户评价',
    why: '一句真人说的话，抵得上一段自夸。现在没有也能开工，有了随时补。',
    canSkip: true,
    fields: [
      { path: 'testimonials', question: '有客户愿意给你一句话评价吗？一条也行，注明是谁说的。', example: 'Hans Mueller, LogiTech GmbH：灯装完电费降了一半。' },
    ],
  },
  {
    id: 'contact',
    label: '怎么联系你',
    why: '页脚、联系我们、询盘表单都从这里取；写错了客户就联系不上你。',
    canSkip: false,
    fields: [
      { path: 'contact.email', question: '对外收询盘的邮箱是哪个？', example: 'sales@yourdomain.com' },
      { path: 'contact.phone', question: '对外电话？带国家区号。', example: '+86 574 8888 6666' },
      { path: 'contact.address', question: '公司地址怎么写？', example: 'Ningbo, Zhejiang, China' },
      { path: 'contact.channels', question: '还用哪些沟通方式？（WhatsApp / 微信 / 领英…）', example: 'WhatsApp +86 138…, LinkedIn /company/…' },
    ],
  },
  {
    id: 'seo',
    label: '搜索与写法',
    why: '关键词决定页面往哪个方向写；写法的禁忌（不能说「最便宜」这类）说了我就会照做。',
    canSkip: false,
    fields: [
      { path: 'seo.keywords', question: '你希望客户搜哪些词找到你？最多 30 个，想不全就写三五个核心词，其余我来调研补。', example: 'led high bay, warehouse lighting, industrial led light' },
      { path: 'special_instructions', question: '有什么必须照做或必须避开的写法？', example: '不写「最便宜」；型号必须带 AeroPro 前缀' },
    ],
  },
];

/** 插件那边的 is_empty 规则，照抄一份：判据不一致的话，"已填"和"还要问"会互相打脸。 */
function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'number') return value === 0;
  return false;
}

function valueAt(profile: Record<string, unknown>, path: string): unknown {
  let cur: unknown = profile;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** 一句话概括已有值：客户看到"我上次说过了"就不会重复讲。 */
function briefValue(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} 条`;
  if (typeof value === 'string') {
    const flat = value.replace(/\s+/g, ' ').trim();
    return flat.length > 140 ? `${flat.slice(0, 140)}…` : flat;
  }
  return String(value);
}

export async function cmdProfileAsk(ctx: CmdCtx): Promise<Out> {
  let c: AgentClient;
  try {
    c = await client(ctx);
  } catch (e) {
    return errorOutput(e);
  }
  try {
    const res = await c.getSiteProfile<SiteProfileResult>();
    const profile = res.profile ?? {};
    const filledNow: Array<{ path: string; value: string }> = [];
    const ask = ASK_GROUPS.map(group => {
      const fields = group.fields.filter(f => {
        const v = valueAt(profile, f.path);
        if (isEmptyValue(v)) return true;
        filledNow.push({ path: f.path, value: briefValue(v) });
        return false;
      });
      return { id: group.id, label: group.label, why: group.why, canSkip: group.canSkip, fields };
    }).filter(g => g.fields.length > 0);

    const askCount = ask.reduce((n, g) => n + g.fields.length, 0);
    return {
      ok: true,
      site: c.siteUrl,
      completeness: res.completeness,
      filledNow,
      ask,
      askCount,
      next: askCount
        ? 'Ask every group above in ONE message — not one question at a time, and not a second round for the skipped ones. Say up front that this is what the AI writes every page from (and what makes the site quotable by AI answer engines). Mark the canSkip groups as "if you have it" so the customer can leave them blank and still start. One answer covers several fields, so do not re-ask anything listed in filledNow.'
        : 'Nothing to ask: every field that matters is filled. Read the profile with `puffergo profile get` and start writing.',
    };
  } catch (e) {
    return profileError(e) ?? errorOutput(e);
  }
}
