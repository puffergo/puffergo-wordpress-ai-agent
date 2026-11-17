/**
 * `puffergo api` — the raw-REST escape hatch. The whole value of this command is that the Application
 * Password NEVER reaches the caller: the AI names a path and sees a response, nothing more. These tests
 * guard that boundary and the three fail-closed guardrails around it:
 *   1. path must be a /wp-json/ relative path (no foreign URL → no Basic-header exfiltration),
 *   2. writes need --yes true,
 *   3. credential-shaped fields in a response are scrubbed before they reach the AI.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePath, validateMethod, scrubBody, cmdApi } from '../lib/apiCmd';

afterEach(() => vi.unstubAllGlobals());

describe('path 护栏（只认 /wp-json/ 相对路径）', () => {
  it('接受干净的 /wp-json/ 路径和查询串', () => {
    expect(validatePath('/wp-json/wp/v2/posts')).toBeNull();
    expect(validatePath('/wp-json/wp/v2/posts?per_page=5&status=draft')).toBeNull();
  });
  it('拒绝完整网址、协议相对、双斜杠、跳转段、片段', () => {
    for (const p of [
      'https://evil.test/steal',
      '//evil.test/steal',
      '/wp-json//wp/v2/posts',
      '/wp-json/../evil',
      '/wp-json/wp/v2/posts#x',
      '/WP-JSON/posts',
    ])
      expect(validatePath(p), p).not.toBeNull();
  });
  it('拒绝空白、控制字符、反斜杠', () => {
    for (const p of ['/wp-json/foo bar', '/wp-json/foo\nbar', '/wp-json/foo\\bar', '/wp-json/foo\u0000'])
      expect(validatePath(p), JSON.stringify(p)).not.toBeNull();
  });
  it('拒绝空路径', () => {
    expect(validatePath(undefined)).not.toBeNull();
    expect(validatePath('')).not.toBeNull();
  });
});

describe('method 护栏', () => {
  it('只接受五种方法，大小写无所谓', () => {
    expect(validateMethod('get')).toBeNull();
    expect(validateMethod('DELETE')).toBeNull();
    expect(validateMethod('OPTIONS')).not.toBeNull();
    expect(validateMethod(undefined)).not.toBeNull();
  });
});

describe('响应脱敏', () => {
  it('递归改写敏感键，保留其他字段', () => {
    const { value, redacted } = scrubBody({
      ok: true,
      secret: 'top',
      nested: { appPassword: 'xxxx xxxx', username: 'admin', list: [{ password: 'p' }, { id: 1 }] },
    });
    expect(redacted).toBe(true);
    expect(value).toMatchObject({
      ok: true,
      secret: '[redacted]',
      nested: { appPassword: '[redacted]', username: 'admin', list: [{ password: '[redacted]' }, { id: 1 }] },
    });
  });
  it('无敏感键时不报 redacted', () => {
    const { value, redacted } = scrubBody({ id: 1, title: 'hi' });
    expect(redacted).toBe(false);
    expect(value).toEqual({ id: 1, title: 'hi' });
  });
});

describe('cmdApi 端到端（网络层被 mock）', () => {
  async function scratchStore() {
    const base = await mkdtemp(join(tmpdir(), 'puffergo-api-test-'));
    const cfg = join(base, 'credentials.json');
    await writeFile(
      cfg,
      JSON.stringify({ sites: { 'https://site.test': { username: 'admin', appPassword: 'appl i cat ion' } } }),
      'utf8',
    );
    const work = join(base, 'work');
    return { cfg, work };
  }
  const ctx = (work: string, positional: string[], flags: Record<string, string> = {}) => ({
    dir: work,
    positional,
    flags: new Map(Object.entries(flags)),
  });
  /** 形状对齐 nodeNetwork 的用法（它读 headers.forEach 和 text()）。 */
  const res = (status: number, json: unknown) => ({
    status,
    headers: { forEach: () => undefined },
    text: async () => JSON.stringify(json),
  });

  it('GET 把 Basic 头注入请求，凭据不出现在结果里', async () => {
    const { cfg, work } = await scratchStore();
    const fetchMock = vi.fn().mockResolvedValue(res(200, { id: 1, title: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await cmdApi(ctx(work, ['GET', '/wp-json/wp/v2/posts/1']), cfg);
    expect(out.ok).toBe(true);
    expect(out.body).toEqual({ id: 1, title: 'ok' });
    expect(JSON.stringify(out)).not.toContain('appl i cat ion');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://site.test/wp-json/wp/v2/posts/1');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('admin:appl i cat ion').toString('base64')}`,
    );
    expect(init.method).toBe('GET');
  });

  it('写操作没有 --yes true 直接拒绝，且完全不发请求', async () => {
    const { cfg, work } = await scratchStore();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const out = await cmdApi(ctx(work, ['POST', '/wp-json/wp/v2/posts']), cfg);
    expect(out).toMatchObject({ ok: false, code: 'confirm_required' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('写操作带 --yes true 才发请求', async () => {
    const { cfg, work } = await scratchStore();
    const fetchMock = vi.fn().mockResolvedValue(res(201, { id: 2 }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await cmdApi(ctx(work, ['POST', '/wp-json/wp/v2/posts'], { yes: 'true', body: '{"title":"hi"}' }), cfg);
    expect(out.ok).toBe(true);
    expect(out.status).toBe(201);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"title":"hi"}');
  });

  it('恶意完整网址不发请求（护栏 1 fail closed）', async () => {
    const { cfg, work } = await scratchStore();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const out = await cmdApi(ctx(work, ['GET', 'https://evil.test/steal']), cfg);
    expect(out).toMatchObject({ ok: false, code: 'bad_path' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('响应里回显的密码被脱敏，并标记 redacted', async () => {
    const { cfg, work } = await scratchStore();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(res(200, { id: 1, debug: { password: 'leaked', appPassword: 'also-leaked' } })),
    );
    const out = await cmdApi(ctx(work, ['GET', '/wp-json/debug']), cfg);
    expect(out.redacted).toBe(true);
    expect(JSON.stringify(out)).not.toContain('leaked');
    expect(out.body).toMatchObject({ debug: { password: '[redacted]', appPassword: '[redacted]' } });
  });

  it('非 2xx 返回 ok:false 与状态码，不抛异常', async () => {
    const { cfg, work } = await scratchStore();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(404, { code: 'not_found' })));
    const out = await cmdApi(ctx(work, ['GET', '/wp-json/nope']), cfg);
    expect(out).toMatchObject({ ok: false, code: 'http_404', status: 404 });
  });

  it('网络不通返回 network_error，不抛异常', async () => {
    const { cfg, work } = await scratchStore();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const out = await cmdApi(ctx(work, ['GET', '/wp-json/wp/v2/types']), cfg);
    expect(out).toMatchObject({ ok: false, code: 'network_error' });
    expect(out.message).toContain('ECONNREFUSED');
  });

  it('Node 太旧没有 fetch 时给中文提示，而不是甩一句 ReferenceError', async () => {
    const { cfg, work } = await scratchStore();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new ReferenceError('fetch is not defined')));
    const out = await cmdApi(ctx(work, ['GET', '/wp-json/wp/v2/types']), cfg);
    expect(out).toMatchObject({ ok: false, code: 'network_error' });
    expect(out.message).toContain('Node');
    expect(out.message).toContain('18');
  });
});

/**
 * 存量兼容：Skill 更新前客户已经存好的凭据必须继续可用。`api` 只是多了一条通往同一份
 * credentials.json 的读路径——写入格式、存放位置、解析顺序都没动。这几条用例把「老客户的
 * 凭据文件原样拿来就能跑」钉死在测试里，避免以后有人改存储格式时悄悄断掉存量。
 */
describe('存量凭据兼容（不重登、不迁移即可用）', () => {
  const ctxOf = (work: string, positional: string[], flags: Record<string, string> = {}) => ({
    dir: work,
    positional,
    flags: new Map(Object.entries(flags)),
  });
  const okFetch = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        headers: { forEach: () => undefined },
        text: async () => JSON.stringify({ ok: 1 }),
      }),
    );

  async function storeWith(content: unknown) {
    const base = await mkdtemp(join(tmpdir(), 'puffergo-api-legacy-'));
    const cfg = join(base, 'credentials.json');
    await writeFile(cfg, JSON.stringify(content), 'utf8');
    return { cfg, work: join(base, 'work') };
  }

  it('早期单站格式 {siteUrl,username,appPassword} 原样可用', async () => {
    const { cfg, work } = await storeWith({
      siteUrl: 'https://legacy.test',
      username: 'olduser',
      appPassword: 'old pass word',
    });
    okFetch();
    const out = await cmdApi(ctxOf(work, ['GET', '/wp-json/wp/v2/types']), cfg);
    expect(out).toMatchObject({ ok: true, siteUrl: 'https://legacy.test' });
    expect(JSON.stringify(out)).not.toContain('old pass word');
  });

  it('多站格式下 --site 选中对应站，不串站', async () => {
    const { cfg, work } = await storeWith({
      sites: {
        'https://a.test': { username: 'ua', appPassword: 'pa' },
        'https://b.test': { username: 'ub', appPassword: 'pb' },
      },
    });
    okFetch();
    const out = await cmdApi(ctxOf(work, ['GET', '/wp-json/wp/v2/types'], { site: 'https://b.test' }), cfg);
    expect(out.siteUrl).toBe('https://b.test');
    const [url, init] = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe('https://b.test/wp-json/wp/v2/types');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('ub:pb').toString('base64')}`,
    );
  });

  it('裸域名等值于带协议的站点地址（沿用 siteKey 匹配）', async () => {
    const { cfg, work } = await storeWith({
      sites: { 'https://bare.test': { username: 'u', appPassword: 'p' } },
    });
    okFetch();
    const out = await cmdApi(ctxOf(work, ['GET', '/wp-json/wp/v2/types'], { site: 'bare.test' }), cfg);
    expect(out.siteUrl).toBe('https://bare.test');
  });

  it('多站但没有 --site 时拒绝并列出已登录站点，绝不猜一个站去用', async () => {
    const { cfg, work } = await storeWith({
      sites: {
        'https://a.test': { username: 'ua', appPassword: 'pa' },
        'https://b.test': { username: 'ub', appPassword: 'pb' },
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const out = await cmdApi(ctxOf(work, ['GET', '/wp-json/wp/v2/types']), cfg);
    expect(out).toMatchObject({ ok: false, code: 'no_site' });
    expect(out.message).toContain('https://a.test');
    expect(out.message).toContain('https://b.test');
    expect(out.message).toContain('--site');
    // 有站点时不能说成「没登录」——那会让存量客户以为凭据丢了，跑去重登。
    expect(out.message).not.toContain('puffergo login');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('--site 指向未登录的站时，提示已登录清单而不是让人重登', async () => {
    const { cfg, work } = await storeWith({
      sites: { 'https://a.test': { username: 'ua', appPassword: 'pa' } },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const out = await cmdApi(ctxOf(work, ['GET', '/wp-json/wp/v2/types'], { site: 'https://typo.test' }), cfg);
    expect(out).toMatchObject({ ok: false, code: 'no_site' });
    expect(out.message).toContain('https://typo.test');
    expect(out.message).toContain('https://a.test');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('完全没有凭据文件时给出可执行的下一步', async () => {
    const base = await mkdtemp(join(tmpdir(), 'puffergo-api-empty-'));
    const out = await cmdApi(ctxOf(join(base, 'work'), ['GET', '/wp-json/wp/v2/types']), join(base, 'none.json'));
    expect(out).toMatchObject({ ok: false, code: 'not_logged_in' });
    expect(out.message).toContain('puffergo login');
  });

  it('不传 configPath 时走 PUFFERGO_CONFIG（与 --config 同一优先级规则）', async () => {
    const { cfg, work } = await storeWith({
      sites: { 'https://env.test': { username: 'eu', appPassword: 'ep' } },
    });
    okFetch();
    const prev = process.env.PUFFERGO_CONFIG;
    process.env.PUFFERGO_CONFIG = cfg;
    try {
      const out = await cmdApi(ctxOf(work, ['GET', '/wp-json/wp/v2/types']));
      expect(out.siteUrl).toBe('https://env.test');
    } finally {
      if (prev === undefined) delete process.env.PUFFERGO_CONFIG;
      else process.env.PUFFERGO_CONFIG = prev;
    }
  });
});
