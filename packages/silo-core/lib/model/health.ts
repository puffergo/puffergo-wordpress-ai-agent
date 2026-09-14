/**
 * healthCheck — the SINGLE source of truth for "what's unhealthy in this Silo", framework-agnostic and
 * pure. Every surface (体检报告抽屉 / 图谱健康 lens / 节点面板体检项) consumes the SAME issue list so a
 * signal is defined once and painted everywhere consistently.
 *
 * Detection reuses linkGraph (orphan / internal-link tallies / pillar membership) and keywordOverlay
 * (cannibalization / gaps) so we never re-derive those. Everything is char-based (no canvas), so it runs
 * identically in a headless host (Obsidian) and the extension. Touches NO WP field — read-only analysis.
 *
 * Severity tiers (see the product's three-tier list):
 *   critical 🔴 — hurts ranking, must fix (cannibalization / orphan / no focus keyword)
 *   warning  🟡 — misses opportunity, should optimize (missing/oversized meta, gaps, empty pillar…)
 *   info     🟢 — informational, good to know (stale draft, unsynced, cross-silo link)
 */

import type { SiloWorkspace } from './types';
import { normalizeTerm } from './keywords';
import { linkGraph, keywordOverlay } from './graph';
import {
  TITLE_MIN,
  TITLE_MAX,
  DESC_MIN,
  DESC_MAX,
  CORE_KEYWORDS_MAX,
  LONGTAIL_KEYWORDS_MAX,
  FOCUS_KEYWORDS_MAX,
} from './seo-limits';

export type HealthSeverity = 'critical' | 'warning' | 'info';

export type HealthCode =
  | 'cannibalization'
  | 'orphan'
  | 'no-focus'
  | 'missing-seo-title'
  | 'missing-seo-desc'
  | 'meta-truncated'
  | 'meta-too-short'
  | 'too-many-keywords'
  | 'focus-not-in-title'
  | 'keyword-gap'
  | 'empty-pillar'
  | 'category-no-seo'
  | 'thin-internal-links'
  | 'stale-draft'
  | 'unsynced'
  | 'cross-silo-link'
  | 'broken-link';

export interface HealthIssue {
  /** Stable per-instance id (code + subject) so a surface can key/dedup and remember dismissals. */
  id: string;
  code: HealthCode;
  severity: HealthSeverity;
  /** One-line problem statement (already localized — Chinese). */
  title: string;
  /** Why it hurts + how to fix, one or two sentences. */
  detail: string;
  /** Graph-node ids involved — used to color the node and to "定位" from the report. May be empty
   *  (e.g. a keyword gap has no page yet). */
  nodeIds: string[];
  /** The keyword involved, when the issue is about one. */
  term?: string;
}

/** Sort weight so a mixed list ranks 🔴 → 🟡 → 🟢. */
export const SEVERITY_ORDER: Record<HealthSeverity, number> = { critical: 0, warning: 1, info: 2 };

// Title/description length limits live in seo-limits.ts (shared with focusKeywordString + SKILL.md).
// A WP draft whose remote copy hasn't changed in this many days is treated as "long-lived / stalled".
const STALE_DRAFT_DAYS = 30;

const isBlank = (s: string | undefined | null): boolean => !s || !s.trim();

/**
 * Analyze a workspace and return every health issue, ranked 🔴→🟡→🟢. Deterministic and side-effect free.
 */
export function healthCheck(ws: SiloWorkspace): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const graph = linkGraph(ws);
  const overlay = keywordOverlay(ws);

  const graphNodeById = new Map(graph.nodes.map(n => [n.id, n]));
  const contentLabel = (id: string): string => graphNodeById.get(id)?.label ?? id;

  // ---- 🔴 关键词自噬 (one issue per contested core term, all competitors bundled) ----
  const cannibalByTerm = new Map<string, Set<string>>();
  for (const e of overlay.cannibalEdges) {
    const key = normalizeTerm(e.term);
    const set = cannibalByTerm.get(key) ?? new Set<string>();
    set.add(e.source);
    set.add(e.target);
    cannibalByTerm.set(key, set);
  }
  for (const e of overlay.cannibalEdges) {
    const key = normalizeTerm(e.term);
    const set = cannibalByTerm.get(key);
    if (!set) continue;
    cannibalByTerm.delete(key); // emit once per term
    const ids = [...set];
    issues.push({
      id: `cannibalization:${key}`,
      code: 'cannibalization',
      severity: 'critical',
      title: `关键词自噬：${ids.length} 页争抢「${e.term}」`,
      detail: `${ids.length} 个页面把「${e.term}」设为核心关键词，排名会互相稀释。保留最匹配的一页做核心关键词，其余降为长尾关键词或改用相近的词。`,
      nodeIds: ids,
      term: e.term,
    });
  }

  // ---- content-level checks ----
  for (const c of ws.contents) {
    const label = c.title || '（未命名内容）';
    const node = graphNodeById.get(c.id);
    const primary = c.seo.coreKeywords.find(k => k.trim())?.trim();

    // 🔴 孤岛页
    if (node?.orphan) {
      issues.push({
        id: `orphan:${c.id}`,
        code: 'orphan',
        severity: 'critical',
        title: `孤岛页：${label}`,
        detail: '这个页面没有任何内链进出，搜索引擎和读者都很难到达。至少加 1 条进链和 1 条出链，把它接入所属支柱。',
        nodeIds: [c.id],
      });
    }

    // 🔴 无核心关键词
    if (!primary) {
      issues.push({
        id: `no-focus:${c.id}`,
        code: 'no-focus',
        severity: 'critical',
        title: `未设核心关键词：${label}`,
        detail: '没有核心关键词，等于没告诉搜索引擎这页要排什么。到 SEO 里补一个核心关键词。',
        nodeIds: [c.id],
      });
    }

    // 🟡 缺 SEO 标题 / 描述
    if (isBlank(c.seo.title)) {
      issues.push({
        id: `missing-seo-title:${c.id}`,
        code: 'missing-seo-title',
        severity: 'warning',
        title: `缺 SEO 标题：${label}`,
        detail: '标题为空，Google 会自行拼凑，排名和点击都受损。补一个含核心关键词、≤60 字符的标题。',
        nodeIds: [c.id],
      });
    }
    if (isBlank(c.seo.description)) {
      issues.push({
        id: `missing-seo-desc:${c.id}`,
        code: 'missing-seo-desc',
        severity: 'warning',
        title: `缺 SEO 描述：${label}`,
        detail: '没有 meta 描述，摘要由 Google 随意截取。补一段 120–160 字符、含关键词、能吸引点击的描述。',
        nodeIds: [c.id],
      });
    }

    // 🟡 标题/描述超长被截断
    const overTitle = c.seo.title.length > TITLE_MAX;
    const overDesc = c.seo.description.length > DESC_MAX;
    if (overTitle || overDesc) {
      const which = overTitle && overDesc ? '标题和描述都' : overTitle ? '标题' : '描述';
      issues.push({
        id: `meta-truncated:${c.id}`,
        code: 'meta-truncated',
        severity: 'warning',
        title: `${which}超长：${label}`,
        detail: `${which}超过展示上限，结尾会在搜索结果里被截断。精简到 标题≤${TITLE_MAX} / 描述≤${DESC_MAX} 字符。`,
        nodeIds: [c.id],
      });
    }

    // 🟡 标题/描述过短（有内容但没写足，浪费展示位与相关性）
    const shortTitle = !isBlank(c.seo.title) && !overTitle && c.seo.title.trim().length < TITLE_MIN;
    const shortDesc = !isBlank(c.seo.description) && !overDesc && c.seo.description.trim().length < DESC_MIN;
    if (shortTitle || shortDesc) {
      const which = shortTitle && shortDesc ? '标题和描述都' : shortTitle ? '标题' : '描述';
      issues.push({
        id: `meta-too-short:${c.id}`,
        code: 'meta-too-short',
        severity: 'warning',
        title: `${which}过短：${label}`,
        detail: `${which}太短，浪费了 SERP 展示位与相关性。写到 标题 ${TITLE_MIN}–${TITLE_MAX} / 描述 ${DESC_MIN}–${DESC_MAX} 字符之间。`,
        nodeIds: [c.id],
      });
    }

    // 🟡 关键词过多（超出 Rank Math 的 5 焦点词上限，或核心词多于 1 个）
    const coreCount = c.seo.coreKeywords.filter(k => k.trim()).length;
    const longCount = c.seo.longTailKeywords.filter(k => k.trim()).length;
    if (
      coreCount > CORE_KEYWORDS_MAX ||
      longCount > LONGTAIL_KEYWORDS_MAX ||
      coreCount + longCount > FOCUS_KEYWORDS_MAX
    ) {
      issues.push({
        id: `too-many-keywords:${c.id}`,
        code: 'too-many-keywords',
        severity: 'warning',
        title: `关键词过多：${label}`,
        detail: `焦点关键词最多 ${FOCUS_KEYWORDS_MAX} 个（${CORE_KEYWORDS_MAX} 核心 + ${LONGTAIL_KEYWORDS_MAX} 长尾），超出的写进 Rank Math 也不会生效。当前 核心 ${coreCount} / 长尾 ${longCount}，请精简。`,
        nodeIds: [c.id],
        term: primary,
      });
    }

    // 🟡 核心关键词未进标题
    if (primary && !isBlank(c.seo.title) && !c.seo.title.toLowerCase().includes(primary.toLowerCase())) {
      issues.push({
        id: `focus-not-in-title:${c.id}`,
        code: 'focus-not-in-title',
        severity: 'warning',
        title: `核心关键词未进标题：${label}`,
        detail: `核心关键词「${primary}」没出现在 SEO 标题里，相关性会打折。把它自然地写进标题。`,
        nodeIds: [c.id],
        term: primary,
      });
    }

    // 🟡 内链过瘦（有页面但没有出链，且不是彻底的孤岛）
    if (node && !node.orphan && node.outboundInternal === 0) {
      issues.push({
        id: `thin-internal-links:${c.id}`,
        code: 'thin-internal-links',
        severity: 'warning',
        title: `内链过瘦：${label}`,
        detail: '这个页面没有任何出链，权重进得来却回不去，无法回流到支柱。加 2–3 条指向相关内容的内链。',
        nodeIds: [c.id],
      });
    }

    // 🟢 长期草稿
    if (c.wpStatus === 'draft' && c.wpPostId != null && c.lastModifiedRemote) {
      const ageDays = (Date.now() - new Date(c.lastModifiedRemote).getTime()) / 86_400_000;
      if (ageDays >= STALE_DRAFT_DAYS) {
        issues.push({
          id: `stale-draft:${c.id}`,
          code: 'stale-draft',
          severity: 'info',
          title: `长期草稿：${label}`,
          detail: `已作为草稿存在 ${Math.round(ageDays)} 天还没发布，不产生任何 SEO 价值。补完正文并发布，或删除。`,
          nodeIds: [c.id],
        });
      }
    }

    // 🟢 本地改动未同步
    if (c.dirtyAt) {
      issues.push({
        id: `unsynced:${c.id}`,
        code: 'unsynced',
        severity: 'info',
        title: `本地改动未同步：${label}`,
        detail: '本地的修改还没推送到 WordPress，线上仍是旧版本。同步一次让改动在线上生效。',
        nodeIds: [c.id],
      });
    }
  }

  // ---- node-level checks (pillars / categories) ----
  // Which pillars actually have content anywhere in their subtree (via graph pillar membership).
  const pillarsWithContent = new Set<string>();
  for (const gn of graph.nodes) {
    if (gn.type === 'content' && gn.pillarId) pillarsWithContent.add(gn.pillarId);
  }
  for (const n of ws.nodes) {
    if (n.system) continue;
    const label = n.term || '（未命名节点）';

    // 🟡 空支柱（顶层节点，整棵子树没有内容）
    if (!n.parentId && !pillarsWithContent.has(n.id)) {
      issues.push({
        id: `empty-pillar:${n.id}`,
        code: 'empty-pillar',
        severity: 'warning',
        title: `空支柱：${label}`,
        detail: '这个支柱下没有任何内容页，撑不起主题权重。往下补文章，或先并入相邻支柱。',
        nodeIds: [n.id],
      });
    }

    // 🟡 分类归档无 SEO
    if (n.isCategory && (isBlank(n.seo?.title) || isBlank(n.seo?.description))) {
      issues.push({
        id: `category-no-seo:${n.id}`,
        code: 'category-no-seo',
        severity: 'warning',
        title: `分类归档无 SEO：${label}`,
        detail: '分类归档页本身是一个可排名的页面，却缺少标题/描述。给它补上 SEO，让归档页也能带来流量。',
        nodeIds: [n.id],
      });
    }
  }

  // ---- 🟡 关键词缺口（规划了却无页面覆盖）----
  for (const g of overlay.gaps) {
    issues.push({
      id: `keyword-gap:${normalizeTerm(g.term)}`,
      code: 'keyword-gap',
      severity: 'warning',
      title: `关键词缺口：${g.term}`,
      detail: `规划了「${g.term}」但还没有任何页面覆盖它。安排一篇内容去承接，或从计划里移除。`,
      nodeIds: [],
      term: g.term,
    });
  }

  // ---- 🟢 跨支柱内链（bundled — often intentional, so one low-priority信息条）----
  const crossSiloNodes = new Set<string>();
  let crossCount = 0;
  for (const e of graph.edges) {
    if (e.type !== 'internal') continue;
    const a = graphNodeById.get(e.source);
    const b = graphNodeById.get(e.target);
    if (a?.pillarId && b?.pillarId && a.pillarId !== b.pillarId) {
      crossCount++;
      crossSiloNodes.add(e.source);
      crossSiloNodes.add(e.target);
    }
  }
  if (crossCount > 0) {
    issues.push({
      id: 'cross-silo-link',
      code: 'cross-silo-link',
      severity: 'info',
      title: `跨支柱内链（${crossCount} 条）`,
      detail: '有内链跨越了不同支柱，可能稀释主题聚合（也可能是有意的桥接）。确认这些链接是否必要。',
      nodeIds: [...crossSiloNodes],
    });
  }

  // Broken internal links. Unlike every other check this one is not re-derived here: deciding that a
  // URL is dead needs a live HTTP probe, which happens at import (see import-content.ts) and is
  // persisted on the workspace. Absent field = never checked, which must not read as "none broken".
  const broken = ws.brokenLinks ?? [];
  if (broken.length) {
    // Grouped by target: one dead URL sitting in the footer produces an entry per page otherwise, and
    // the user fixes it in ONE place. The count of affected pages is what conveys the scale.
    const byUrl = new Map<string, typeof broken>();
    for (const b of broken) byUrl.set(b.url, [...(byUrl.get(b.url) ?? []), b]);
    for (const [url, hits] of byUrl) {
      const where = hits[0].placement;
      // A dead link in the header/footer is on EVERY page of the site, so it costs far more than one
      // buried in a single article — that difference is worth surfacing in the title.
      const scope = where === 'nav' || where === 'footer' ? '（全站导航/页脚，影响每个页面）' : '';
      issues.push({
        id: `broken-link:${url}`,
        code: 'broken-link',
        severity: 'warning',
        title: `站内死链：${hits[0].anchor || url}${scope}`,
        detail: `${url} 返回 ${hits[0].status}。死链浪费抓取预算、让权重流向不存在的页面，也直接损害用户体验。请修正链接地址或补上这个页面。`,
        nodeIds: [...new Set(hits.map(h => h.from))],
      });
    }
  }

  issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return issues;
}

/**
 * Per-graph-node view of the issue list — for the 节点面板体检项 and for coloring a node by its WORST
 * severity. Keyed by graph-node id. Nodeless issues (e.g. keyword gaps) are excluded.
 */
export interface NodeHealth {
  /** All issues touching this node, ranked 🔴→🟡→🟢. */
  issues: HealthIssue[];
  /** Worst severity among them — drives the node's描边/角标 color. */
  worst: HealthSeverity;
}

export function healthByNode(issues: HealthIssue[]): Record<string, NodeHealth> {
  const byNode: Record<string, NodeHealth> = {};
  for (const issue of issues) {
    for (const id of issue.nodeIds) {
      const entry = (byNode[id] ??= { issues: [], worst: 'info' });
      entry.issues.push(issue);
      if (SEVERITY_ORDER[issue.severity] < SEVERITY_ORDER[entry.worst]) entry.worst = issue.severity;
    }
  }
  return byNode;
}
