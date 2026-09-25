/**
 * WordPress returns `title.rendered` with special characters HTML-encoded. Storing that without
 * decoding put literal "首页 &#8211; 中文 (中国)" into the workspace — visible in the tree, the editor
 * and anything pushed back. These pin the decoding, including the double-decode trap.
 */

import { describe, expect, it } from 'vitest';
import { decodeEntities } from './import-content';

describe('decodeEntities', () => {
  it('解码 WordPress 常发的数字实体', () => {
    expect(decodeEntities('首页 &#8211; 中文 (中国)')).toBe('首页 – 中文 (中国)');
    expect(decodeEntities('&#8220;已抓取&#8221;')).toBe('“已抓取”');
  });

  it('解码十六进制实体', () => {
    expect(decodeEntities('a &#x2014; b')).toBe('a — b');
  });

  it('解码命名实体（大小写都认）', () => {
    expect(decodeEntities('A &amp; B')).toBe('A & B');
    expect(decodeEntities('&lt;tag&gt;')).toBe('<tag>');
    expect(decodeEntities('&NBSP;')).toBe(' ');
  });

  it('不二次解码：&amp;#8211; 应还原成字面的 &#8211;', () => {
    expect(decodeEntities('&amp;#8211;')).toBe('&#8211;');
  });

  it('认不出的实体原样留着，不吞字符', () => {
    expect(decodeEntities('100% &foo; &#99999999999;')).toBe('100% &foo; &#99999999999;');
  });

  it('没有实体时原样返回', () => {
    expect(decodeEntities('plain title 2024')).toBe('plain title 2024');
  });
});
