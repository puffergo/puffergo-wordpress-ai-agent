/**
 * silo CLI — the AI agent's headless hands for the SEO Silo. A fourth host of @puffergo/silo-core
 * (alongside the browser extension and Obsidian), talking to WordPress over node fetch.
 *
 * Flow (full-auto, agent-driven):
 *   silo init      → create the workspace from a site positioning
 *   silo plan p.json → apply an agent-authored keyword+silo+content plan, scaffold md files
 *   (agent writes bodies into the md files)
 *   silo push [note…] → author bodies + SEO + categories to WordPress (drafts): the named notes, or the
 *                     ones new or edited since their last push / pull
 *   silo health    → guardrail the agent reads to self-correct
 *   silo pull [id…]  → sync back from WordPress (bodies too, never over unpushed edits)
 *
 * The WP Application Password is read from silo.config.json by the CLI only and is never printed.
 */

import { readFile } from 'node:fs/promises';
import {
  emptyWorkspace,
  healthCheck,
  applySeoLimits,
  syncContent,
  importFromWp,
  getDirtyContents,
  getPendingContents,
  updateContent,
  buildLinkResolver,
  noteNamesFromScan,
  resolveWikilinks,
  resolveBodyAssets,
  type SiloWorkspace,
  type HealthIssue,
} from '@puffergo/silo-core';
import { dirname } from 'node:path';
import { readWorkspace, writeWorkspace, listSites, resolveSite } from './adapters/fileStore';
import { wpAssetUploader } from './adapters/assetUploader';
import { connect } from './lib/wp';
import { applyPlan, type Plan } from './lib/plan';
import { scanVault, scaffoldVault, applyFrontmatterEdits, updateNoteBody } from './lib/vault';
import { readSynced, writeSynced, changedIds, matchTargets, recordSynced, isEdited } from './lib/siloSync';
import { writePreview } from './lib/previewCmd';
import {
  cmdSchema,
  cmdListProducts,
  cmdCheck,
  cmdPush as cmdProductsPush,
  cmdPreview as cmdProductsPreview,
  cmdPull as cmdProductsPull,
  cmdPublish,
  cmdSample,
  cmdCategories,
  cmdImages,
} from './lib/productsCmd';
import { cmdEditLive, siteErrorOutput } from './lib/siteCmd';
import { cmdSiteSetup, SITE_SETUP_USAGE } from './lib/siteSetupCmd';
import { cmdLogin, cmdLoginStatus, cmdLoginWait } from './lib/loginCmd';
import {
  cmdTypes,
  cmdFind,
  cmdBlocks,
  cmdGet,
  cmdPreview,
  cmdCreate,
  cmdReplace,
  cmdSeo,
  cmdPublish as cmdPagesPublish,
  cmdPageCategories,
} from './lib/pagesCmd';

// ---- tiny arg parsing -------------------------------------------------------
// `puffergo <login|products …|silo …>`; the legacy `silo <cmd>` bin calls this with no group word,
// so anything that isn't a known group falls through to the silo commands unchanged.
const rawArgv = process.argv.slice(2);
const group = ['products', 'pages', 'login', 'site', '__login-wait'].includes(rawArgv[0] ?? '') ? rawArgv[0] : 'silo';
const argv =
  rawArgv[0] === 'silo' || group === 'products' || group === 'pages' || group === 'site' ? rawArgv.slice(1) : rawArgv;
const cmd = argv[0];
const flags = new Map<string, string>();
const positional: string[] = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const eq = a.indexOf('=');
    if (eq >= 0) flags.set(a.slice(2, eq), a.slice(eq + 1));
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags.set(a.slice(2), argv[++i]);
    else flags.set(a.slice(2), 'true');
  } else positional.push(a);
}
const dir = flags.get('dir') ?? process.cwd();
// Explicit credentials file (out-of-vault). Falls back to ~/.puffergo/credentials.json when unset.
const configPath = flags.get('config') ?? process.env.PUFFERGO_CONFIG;

const log = (s = ''): void => {
  process.stdout.write(s + '\n');
};
/**
 * Fail with a code the AI can branch on, in the same `{ok:false, code, message}` shape the products and pages
 * groups print. The silo commands print human text when they succeed (the Skill reads it out to the customer);
 * only failures are structured, because those are what the AI has to react to.
 */
const die = (code: string, message: string): never => {
  emit({ ok: false, code, message });
  process.exit(1);
};

/** The site a multi-site vault should act on: `--site <domain>`, else whatever `state.json` says. */
const wantedSite = flags.get('site');

/**
 * Load the vault's workspace, telling the agent apart the three ways this can fail. The distinction
 * matters: `no_workspace` sends it to `silo init`, and doing that in a vault that HAS content (just
 * not the site it asked for) would drop an empty workspace beside real, already-pushed work.
 */
async function loadWs(): Promise<SiloWorkspace> {
  const ws = await readWorkspace(dir, wantedSite);
  if (!ws) {
    const sites = await listSites(dir);
    if (sites.length && wantedSite && !(await resolveSite(dir, wantedSite))) {
      die('site_not_found', `这个 vault 里没有站点「${wantedSite}」。已连接的站点：${sites.join('、')}`);
    }
    if (sites.length > 1) {
      die('site_required', `这个 vault 连了多个站点，用 --site 指定一个：${sites.join('、')}`);
    }
    die('no_workspace', `未找到工作区（先运行 silo init）：${dir}`);
  }
  applySeoLimits(ws!.seoLimits); // the site's SEO limits from the last pull (push caps keywords by them)
  return ws!;
}

const SEV_ORDER = ['critical', 'warning', 'info'] as const;
const SEV_ICON: Record<string, string> = { critical: '🔴', warning: '🟡', info: '🔵' };
function printHealth(issues: HealthIssue[]): void {
  if (!issues.length) return log('🟢 健康检查：无问题');
  for (const sev of SEV_ORDER) {
    const group = issues.filter(i => i.severity === sev);
    if (!group.length) continue;
    log(`\n${SEV_ICON[sev]} ${sev} (${group.length})`);
    for (const it of group) log(`  • ${it.title} — ${it.detail}`);
  }
}

// ---- commands ---------------------------------------------------------------
async function cmdInit(): Promise<void> {
  const name = flags.get('name');
  const url = flags.get('url');
  if (!name || !url) die('usage', '用法：silo init --name "站点名" --url "https://example.com" [--tagline "定位"]');
  // Guard on the VAULT, not just on the site being initialised: a vault using the per-site layout
  // already holds real work, and `init` there would write an empty workspace beside it.
  const sites = await listSites(dir);
  const existing = sites.length > 0 || (await readWorkspace(dir, wantedSite));
  if (existing && flags.get('force') !== 'true') {
    die(
      'workspace_exists',
      sites.length
        ? `这个 vault 已经有工作区了（已连接：${sites.join('、')}），不要重建;直接用,或用 --site 指定站点`
        : '工作区已存在（加 --force 覆盖）',
    );
  }
  const ws = emptyWorkspace({ name: name!, url: url!, tagline: flags.get('tagline') });
  await writeWorkspace(dir, ws);
  log(`✓ 已创建工作区：${name} (${url})`);
}

async function cmdPlan(): Promise<void> {
  const file = positional[0];
  if (!file) die('usage', '用法：silo plan <plan.json>');
  let raw: string;
  try {
    raw = await readFile(file!, 'utf8');
  } catch {
    die('file_not_found', `未找到 plan 文件：${file}`);
  }
  let plan: Plan;
  try {
    plan = JSON.parse(raw!) as Plan;
  } catch (e) {
    die('invalid_json', `plan 文件不是合法 JSON：${e instanceof Error ? e.message : String(e)}`);
  }
  const ws = (await readWorkspace(dir)) ?? (plan!.profile ? emptyWorkspace(plan!.profile) : null);
  if (!ws) die('no_profile', '无工作区且 plan 未含 profile：先 silo init 或在 plan 里加 profile');

  const res = applyPlan(ws!, plan!);
  await writeWorkspace(dir, res.ws);

  // Scaffold one md file per content (frontmatter + purpose; preserves any body already written).
  const files = await scaffoldVault(dir, res.ws, res.purposes);
  const reused =
    res.counts.nodesReused || res.counts.contentsReused
      ? `（复用更新：节点 ${res.counts.nodesReused}，内容 ${res.counts.contentsReused}）`
      : '';
  log(
    `✓ 应用计划：关键词 +${res.counts.keywords}，节点 +${res.counts.nodes}，内容 +${res.counts.contents}${reused}；写入 ${files} 个 md 文件`,
  );
  printHealth(healthCheck(res.ws));
}

async function cmdPush(): Promise<void> {
  let ws = await loadWs();
  const force = flags.get('force') === 'true';
  const bodies = await scanVault(dir);
  // Read any edits the user made in Obsidian (SEO / keywords / title / slug / links) back into the model
  // BEFORE pushing, so the note's frontmatter is the source of truth for content fields.
  const edited = applyFrontmatterEdits(ws, bodies);
  ws = edited.ws;
  if (edited.changed) log(`↩ 已从 ${edited.changed} 篇笔记的 frontmatter 读回编辑`);

  const { client, siteUrl } = await connect(dir, { configPath, site: wantedSite });

  // Only what was named, or else what is new or edited here: a push never rewrites posts nobody touched.
  // The fingerprints are per-site, so this needs the resolved site first.
  const synced = await readSynced(dir, siteUrl);
  let targets: string[];
  if (positional.length) {
    const m = matchTargets(positional, ws, bodies, dir);
    if (m.unknown.length)
      die('note_not_found', `找不到这些笔记：${m.unknown.join('、')}（写笔记文件名、slug 或 WordPress 文章 id）`);
    // A named note that hasn't changed isn't pushed again, unless --force.
    const changed = new Set(changedIds(ws, bodies, synced));
    const same = m.ids.filter(id => !force && !changed.has(id));
    if (same.length)
      log(
        `· 没有改动，跳过：${same.map(id => ws.contents.find(c => c.id === id)?.title ?? id).join('、')}（一定要重推就加 --force）`,
      );
    targets = m.ids.filter(id => !same.includes(id));
    if (!targets.length) return log('没有要推送的改动。');
  } else {
    targets = changedIds(ws, bodies, synced);
    const skipped = ws.contents.length - targets.length;
    if (skipped) log(`· 跳过 ${skipped} 篇上次同步后没改过的；要推送指定的笔记，把文件名写在命令后面`);
    if (!targets.length) return log('没有要推送的改动。');
  }
  const pushing = new Set(targets);

  // Asset pass: upload local images to WP media and rewrite each body to the hosted URLs (once, up
  // front). The rewritten body is also written back to the note so the next push sees remote URLs and
  // skips re-uploading. Resolved bodies feed the link/HTML step below.
  const resolvedBody = new Map<string, string>();
  let uploaded = 0;
  for (const [id, file] of bodies) {
    if (!pushing.has(id)) continue;
    if (!file.body.trim()) {
      resolvedBody.set(id, file.body);
      continue;
    }
    const res = await resolveBodyAssets(file.body, wpAssetUploader(client, [dirname(file.path), dir]));
    resolvedBody.set(id, res.md);
    if (res.uploaded) {
      await updateNoteBody(file.path, res.md);
      uploaded += res.uploaded;
    }
  }
  if (uploaded) log(`⬆ 上传图片 ${uploaded} 张并改写为线上地址`);

  const bodyOf = (id: string): string => resolvedBody.get(id) ?? '';
  const noteNames = noteNamesFromScan(bodies);

  let ok = 0;
  let conflict = 0;
  let failed = 0;
  // Notes whose body referenced a sibling that had no permalink yet this run — re-authored in pass 2.
  const needsRelink = new Set<string>();
  const pushedIds: string[] = [];
  for (const item of ws.contents) {
    if (!pushing.has(item.id)) continue;
    // Resolve `[[…]]` internal links to real permalinks via the glue codec — the body STAYS Markdown
    // (the plugin compiles it to blocks). Rebuilt each iteration so it picks up permalinks assigned to
    // siblings earlier in this same run.
    const { md, unresolved } = resolveWikilinks(bodyOf(item.id), buildLinkResolver(ws, noteNames));
    const res = await syncContent(client, ws, item, { force, content: md || undefined });
    if (res.ok) {
      ws = updateContent(ws, item.id, res.patch);
      ok++;
      pushedIds.push(item.id);
      if (unresolved.length) needsRelink.add(item.id);
      log(`  ✓ ${item.title}${md ? '（含正文）' : '（仅结构/SEO）'} → #${res.patch.wpPostId}`);
    } else if ('conflict' in res && res.conflict) {
      conflict++;
      log(`  ⚠ 冲突（WP 端已改）：${item.title} — 用 --force 覆盖`);
    } else {
      failed++;
      log(`  ✖ 失败：${item.title} — ${'error' in res ? res.error : '未知'}`);
    }
  }

  // Pass 2: now every pushed item has a permalink — re-author the bodies that referenced a then-unpushed
  // sibling, so their internal links resolve to real URLs. force:true (we just changed their modified time).
  if (needsRelink.size) {
    const resolver = buildLinkResolver(ws, noteNames);
    let relinked = 0;
    /** Links that still point at nothing after the second pass: said out loud, or the agent keeps
     *  re-reading a "pushed fine" result and wondering why `silo health` never stops calling it an island. */
    const stillBroken: string[] = [];
    for (const item of ws.contents) {
      if (!needsRelink.has(item.id)) continue;
      const { md, unresolved } = resolveWikilinks(bodyOf(item.id), resolver);
      if (!md) continue;
      if (unresolved.length) stillBroken.push(`${item.title} → ${unresolved.join('、')}`);
      const res = await syncContent(client, ws, item, { force: true, content: md });
      if (res.ok) {
        ws = updateContent(ws, item.id, res.patch);
        relinked++;
      }
    }
    if (relinked) log(`  ↻ 二次解析内链后重推 ${relinked} 篇`);
    for (const line of stillBroken)
      log(
        `  ⚠ 内链没解析成网址：${line} — 它指向的不是台账里的笔记，正文里现在是纯文本；要让它们链起来，用台账里笔记的文件名，或直接写站上已有页面的完整网址`,
      );
  }

  await writeWorkspace(dir, ws);
  // Write the freshly-assigned wp.postId/link (and any server-updated fields) back into the md
  // frontmatter so the note in Obsidian reflects reality right after a push. Bodies are preserved.
  const before = await scanVault(dir);
  await scaffoldVault(dir, ws);
  await writeSynced(dir, siteUrl, recordSynced(synced, before, await scanVault(dir), pushedIds));
  log(`\n完成：成功 ${ok}，冲突 ${conflict}，失败 ${failed}`);
}

async function cmdPull(): Promise<void> {
  let ws = await loadWs();
  const { client, conn, siteUrl } = await connect(dir, { configPath, site: wantedSite });
  const types = (flags.get('types')?.split(',') ?? conn.contentTypes?.map(t => t.type) ?? ['post', 'page']).filter(
    Boolean,
  );
  // `silo pull <id…>`: just these posts (WP post id, or a link / note already in the workspace).
  let onlyIds: number[] | undefined;
  if (positional.length) {
    const before = await scanVault(dir);
    onlyIds = positional.map(t => {
      if (/^\d+$/.test(t)) return Number(t);
      const id = ws.contents.find(c => c.id === matchTargets([t], ws, before, dir).ids[0])?.wpPostId;
      return id ?? die('post_not_found', `找不到：${t}（写 WordPress 文章 id，编辑页地址里 post= 后面的数字）`);
    });
  }
  log(`拉取类型：${types.join(', ')}${onlyIds ? `，只拉 ${onlyIds.join(', ')}` : ''}`);
  const synced = await readSynced(dir, siteUrl);
  const res = await importFromWp(client, ws, types, {
    onlyIds,
    noteNames: noteNamesFromScan(await scanVault(dir)),
    wantBodies: true, // the CLI vault mirrors bodies
  });
  if (onlyIds && res.imported < onlyIds.length)
    log(`⚠ 拉到 ${res.imported} 篇，少于要的 ${onlyIds.length} 篇（id 不对，或类型不在 ${types.join(', ')} 里）`);
  ws = res.ws;
  await writeWorkspace(dir, ws);
  // Project pulled content into editable md files, then their bodies — never over edits not pushed yet.
  const before = await scanVault(dir);
  const files = await scaffoldVault(dir, ws);
  const scanned = await scanVault(dir);
  const kept: string[] = [];
  const pulled: string[] = [];
  for (const [id, md] of res.bodies) {
    const note = scanned.get(id);
    if (!note) continue;
    if (isEdited(id, before, synced)) {
      kept.push(ws.contents.find(c => c.id === id)?.title ?? id);
      continue;
    }
    await updateNoteBody(note.path, `\n${md}\n`);
    pulled.push(id);
  }
  await writeSynced(dir, siteUrl, recordSynced(synced, before, await scanVault(dir), pulled));
  log(
    `✓ 已同步：导入/更新 ${res.imported} 篇内容，${ws.nodes.length} 个节点；写入/刷新 ${files} 个 md 文件，正文 ${pulled.length} 篇`,
  );
  if (kept.length) log(`⚠ 这些笔记有没推送的改动，正文没覆盖：${kept.join('、')}`);
  // "正文 0 篇" on its own reads like a failure. Say what it actually means: those posts are built
  // from layout blocks (or another editor), Markdown cannot carry them, so their words stay in
  // WordPress and are edited there — SEO and categories still sync from here.
  const withPost = ws.contents.filter(c => c.wpPostId != null && (!onlyIds || onlyIds.includes(c.wpPostId)));
  const withoutBody = withPost.filter(c => !res.bodies.has(c.id)).map(c => c.title);
  if (withoutBody.length)
    log(
      `ℹ ${withoutBody.length} 篇的正文没有拉回本地：${withoutBody.join('、')} —— 它们在站点上是用版式区块/组件或别的编辑器做的，Markdown 表达不了，正文请到 WordPress 编辑器里改；这些篇的 SEO 和分类照常能推`,
    );
  // Pulling some posts: only their own issues, not every category of the site.
  const mine = new Set(
    onlyIds ? ws.contents.filter(c => onlyIds.includes(c.wpPostId ?? -1)).flatMap(c => [c.id, c.siloNodeId]) : [],
  );
  printHealth(healthCheck(ws).filter(i => !onlyIds || i.nodeIds.some(id => mine.has(id))));
}

async function cmdHealth(): Promise<void> {
  printHealth(healthCheck(await loadWs()));
}

async function cmdStatus(): Promise<void> {
  const ws = await loadWs();
  const dirty = getDirtyContents(ws);
  const pending = getPendingContents(ws);
  log(`站点：${ws.profile.name} (${ws.profile.url})`);
  log(`节点 ${ws.nodes.length} · 内容 ${ws.contents.length} · 关键词 ${ws.keywords.length} · 边 ${ws.edges.length}`);
  log(`未推送(dirty) ${dirty.length} · 从未推送(pending) ${pending.length}`);
  const issues = healthCheck(ws);
  log(`健康问题 ${issues.length}（${issues.filter(i => i.severity === 'critical').length} 严重）`);
}

async function cmdView(): Promise<void> {
  const ws = await loadWs();
  let res;
  try {
    res = await writePreview(ws, dir, flags.get('no-open') === 'true', flags.get('out'));
  } catch (e) {
    if (e instanceof Error && e.message === 'preview_bundle_missing') {
      die('error', '找不到预览页资源（preview.js）。本技能可能没装全，请重新安装本技能。');
    }
    throw e;
  }
  log(`✓ 已生成预览页：${res.file}`);
  log(
    res.opened
      ? '已在你的默认浏览器里打开。左上角可切换「总览」关系图和「结构」树；这是只读预览，改内容和发布还是回到命令行。'
      : '请手动打开上面这个文件查看（只读预览）。',
  );
}

/** Which shipped build this is. The script travels inside the Skill folder, so "I reinstalled it" proves
 *  nothing on its own — this is what a customer's AI quotes back when a fix did or did not arrive. Bump it
 *  whenever the bundle the build script writes into the Skills changes behavior. */
const BUILD = '2026-10-09.1';

async function main(): Promise<void> {
  switch (cmd) {
    case 'version':
    case '--version':
      return emit({ ok: true, build: BUILD, node: process.version });
    case 'init':
      return cmdInit();
    case 'plan':
      return cmdPlan();
    case 'push':
      return cmdPush();
    case 'pull':
      return cmdPull();
    case 'health':
      return cmdHealth();
    case 'status':
      return cmdStatus();
    case 'view':
      return cmdView();
    default:
      log('puffergo silo <init|plan|push|pull|health|status|view> [--dir <vault>] [--config <path>]');
      log('puffergo login <siteUrl>');
      log('puffergo login status [--wait <seconds>]');
      log('puffergo version');
      log(SITE_SETUP_USAGE);
      log(PRODUCTS_USAGE);
      log(PAGES_USAGE);
      if (cmd && cmd !== 'help' && cmd !== '--help') process.exitCode = 1;
  }
}

/** Print one JSON object for the AI on stdout; exit 1 unless it says ok. */
function emit(result: unknown): void {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!(result && typeof result === 'object' && (result as { ok?: unknown }).ok === true)) process.exitCode = 1;
}

const PRODUCTS_USAGE =
  'puffergo products <schema|list [--search q]|check [--only k1,k2]|preview <key…>|push [--only k1,k2 [--customer-said "<customer words>"]]|pull <key|id|link>|publish <key…> --customer-said "<customer words>"|sample <list|set <name> <key|id|link>|show <name>|remove <name>>|images <file|folder…>|categories <check|push>|edit-live [on --customer-said "<customer words>"|off]> [--dir <workdir>] [--site <url>]';

async function products(): Promise<void> {
  const ctx = { dir, flags, positional };
  switch (cmd) {
    case 'schema':
      return emit(await cmdSchema(ctx));
    case 'list':
      return emit(await cmdListProducts(ctx));
    case 'check':
      return emit(await cmdCheck(ctx));
    case 'preview':
      return emit(await cmdProductsPreview(ctx));
    case 'push':
      return emit(await cmdProductsPush(ctx));
    case 'pull':
      return emit(await cmdProductsPull(ctx));
    case 'publish':
      return emit(await cmdPublish(ctx));
    case 'sample':
      return emit(await cmdSample(ctx));
    case 'categories':
      return emit(await cmdCategories(ctx));
    case 'images':
      return emit(await cmdImages(ctx));
    case 'edit-live':
      return emit(await cmdEditLive(ctx));
    default:
      return emit({ ok: false, code: 'usage', message: PRODUCTS_USAGE });
  }
}

const PAGES_USAGE =
  'puffergo pages <types|find [--type t] [--status publish] [--search q] [--url link]|blocks <id|link>|get <id|link> [path]|preview <files|folder…> [--title t]|preview <id|link> <path> <file>|categories <type> <check|push>|create --type <type> --title "<title>" --slug <slug> --seo-title "…" --seo-description "…" --focus-keyword "…" [--keywords "a, b"] [--category "a, b"] [--featured-image <file>] [--excerpt "…"] [--new] <files|folder…>|replace <id|link> <path> <file> [--customer-said "<customer words>"]|seo <id|link> [--slug s] [--seo-title "…"] [--seo-description "…"] [--focus-keyword "…"] [--keywords "a, b"] [--category "a, b"] [--featured-image <file>] [--customer-said "<customer words>"]|publish <id|link> --customer-said "<customer words>"|edit-live [on --customer-said "<customer words>"|off]> [--dir <workdir>] [--site <url>]';

async function pages(): Promise<void> {
  const ctx = { dir, flags, positional };
  switch (cmd) {
    case 'types':
      return emit(await cmdTypes(ctx));
    case 'find':
      return emit(await cmdFind(ctx));
    case 'blocks':
      return emit(await cmdBlocks(ctx));
    case 'get':
      return emit(await cmdGet(ctx));
    case 'preview':
      return emit(await cmdPreview(ctx));
    case 'create':
      return emit(await cmdCreate(ctx));
    case 'replace':
      return emit(await cmdReplace(ctx));
    case 'seo':
      return emit(await cmdSeo(ctx));
    case 'publish':
      return emit(await cmdPagesPublish(ctx));
    case 'categories':
      return emit(await cmdPageCategories(ctx));
    case 'edit-live':
      return emit(await cmdEditLive(ctx));
    default:
      return emit({ ok: false, code: 'usage', message: PAGES_USAGE });
  }
}

const SITE_USAGE = SITE_SETUP_USAGE;

async function site(): Promise<void> {
  const ctx = { dir, flags, positional };
  switch (cmd) {
    case 'setup':
      return emit(await cmdSiteSetup(ctx));
    default:
      return emit({ ok: false, code: 'usage', message: SITE_USAGE });
  }
}

const run =
  group === 'products'
    ? products
    : group === 'pages'
      ? pages
      : group === 'site'
        ? site
        : group === 'login'
          ? async () =>
              emit(
                positional[0] === 'status'
                  ? await cmdLoginStatus(dir, flags.get('wait'))
                  : await cmdLogin(dir, positional[0] ?? argv[1]),
              )
          : group === '__login-wait'
            ? () => cmdLoginWait(argv[1]!, argv[2]!, argv[3]!, argv[4])
            : main;

run().catch(e => {
  const shared = siteErrorOutput(e);
  emit(shared ?? { ok: false, code: 'error', message: e instanceof Error ? e.message : String(e) });
});
