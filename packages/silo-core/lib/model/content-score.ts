/**
 * contentScore — a minimal, on-demand SEO score per ContentItem: title, description, focus keyword.
 * Deliberately narrow (not a Rank Math clone, not the full seo-checker engine in pages/content — that
 * one needs a live DOM + real page paint for its performance checks, which has nothing to do with
 * content management). Pure and free: everything it reads is already on ContentItem.seo from import,
 * no network call, no DOM. Shares its length thresholds with healthCheck (seo-limits.ts) so the score
 * and the 体检报告 never disagree about what "too short/long" means.
 */

import type { ContentItem } from './types';
import { TITLE_MIN, TITLE_MAX, DESC_MIN, DESC_MAX } from './seo-limits';

export interface ContentScoreItem {
  id: 'keyword' | 'title_length' | 'desc_length' | 'keyword_in_title' | 'keyword_in_desc';
  label: string;
  score: 0 | 100;
  /** false = not scored (excluded from the average) — e.g. keyword-in-title/desc when there's no
   *  focus keyword to check for yet; that gap is already fully accounted for by the `keyword` item. */
  applicable: boolean;
}

export interface ContentScore {
  score: number; // 0-100, average of applicable items; 0 if nothing is applicable (shouldn't happen)
  items: ContentScoreItem[];
}

const isBlank = (s: string | undefined | null): boolean => !s || !s.trim();

export function computeContentScore(item: ContentItem): ContentScore {
  const title = item.seo.title.trim();
  const desc = item.seo.description.trim();
  const primary = item.seo.coreKeywords.find(k => k.trim())?.trim();
  const hasKeyword = !!primary;

  const titleOk = !isBlank(title) && title.length >= TITLE_MIN && title.length <= TITLE_MAX;
  const descOk = !isBlank(desc) && desc.length >= DESC_MIN && desc.length <= DESC_MAX;
  const titleHasKeyword = hasKeyword && !isBlank(title) && title.toLowerCase().includes(primary!.toLowerCase());
  const descHasKeyword = hasKeyword && !isBlank(desc) && desc.toLowerCase().includes(primary!.toLowerCase());

  const items: ContentScoreItem[] = [
    { id: 'keyword', label: '核心关键词', score: hasKeyword ? 100 : 0, applicable: true },
    {
      id: 'title_length',
      label: `标题长度（${TITLE_MIN}–${TITLE_MAX}字符）`,
      score: titleOk ? 100 : 0,
      applicable: true,
    },
    { id: 'desc_length', label: `描述长度（${DESC_MIN}–${DESC_MAX}字符）`, score: descOk ? 100 : 0, applicable: true },
    { id: 'keyword_in_title', label: '关键词出现在标题', score: titleHasKeyword ? 100 : 0, applicable: hasKeyword },
    { id: 'keyword_in_desc', label: '关键词出现在描述', score: descHasKeyword ? 100 : 0, applicable: hasKeyword },
  ];

  const scored = items.filter(i => i.applicable);
  const score = scored.length ? Math.round(scored.reduce((sum, i) => sum + i.score, 0) / scored.length) : 0;

  return { score, items };
}
