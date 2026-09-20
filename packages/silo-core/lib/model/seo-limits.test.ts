import { describe, expect, it } from 'vitest';
import { seoWidth, widthRange } from './seo-limits';

describe('seoWidth', () => {
  it('counts CJK and full-width characters 2, others 1 (as PHP mb_strwidth)', () => {
    expect(seoWidth('abc')).toBe(3);
    expect(seoWidth('中文')).toBe(4);
    expect(seoWidth('日本語 かな 한국')).toBe(6 + 1 + 4 + 1 + 4);
    expect(seoWidth('ＡＢ')).toBe(4);
    expect(seoWidth('Grüße, café')).toBe(11);
  });

  it('ignores surrounding spaces', () => {
    expect(seoWidth('  中 ')).toBe(2);
  });

  it('shows the range in Chinese characters too', () => {
    expect(widthRange(30, 60)).toBe('30–60（中文约 15–30 字）');
  });
});
