import { describe, expect, it } from 'vitest';
import {
  buildHeadline,
  buildNext,
  dmarcVerdict,
  hasRealDkimKey,
  isValidDomain,
  normalizeDomain,
  reportIdOf,
  spfVerdict,
  statusText,
} from '../lib/domainCmd';
import type { EmailSection, GoogleSection, RegistrationSection, ResidueSection } from '../lib/domainCmd';

describe('域名体检 > 输入归一化', () => {
  it('把客户随手粘的网址还原成域名', () => {
    expect(normalizeDomain('https://www.Example.com/about?x=1')).toBe('example.com');
    expect(normalizeDomain('  puffergo.com  ')).toBe('puffergo.com');
    expect(normalizeDomain('http://shop.example.co.uk:8080/a')).toBe('shop.example.co.uk');
  });

  it('认得出哪些不是域名', () => {
    expect(isValidDomain('example.com')).toBe(true);
    expect(isValidDomain('a-b.example.co.uk')).toBe(true);
    expect(isValidDomain('not a domain')).toBe(false);
    expect(isValidDomain('localhost')).toBe(false);
    expect(isValidDomain('-bad.com')).toBe(false);
    expect(isValidDomain('example..com')).toBe(false);
  });
});

describe('域名体检 > SPF 判定', () => {
  it('-all 是最严的写法，不能报成问题', () => {
    expect(spfVerdict('v=spf1 include:spf.qiye.aliyun.com -all').state).toBe('ok');
  });

  it('~all 是软失败，也算配好了', () => {
    expect(spfVerdict('v=spf1 include:_spf.google.com ~all').state).toBe('ok');
  });

  it('+all 等于允许任何人冒名发信，比不配更糟', () => {
    expect(spfVerdict('v=spf1 +all').state).toBe('invalid');
  });

  it('没有 all 机制要提示，但不算错', () => {
    expect(spfVerdict('v=spf1 include:_spf.google.com').state).toBe('warn');
  });
});

describe('域名体检 > DMARC 判定', () => {
  it('p=none 能收报告但不处置伪造邮件', () => {
    expect(dmarcVerdict('v=DMARC1; p=none; rua=mailto:a@example.com').state).toBe('warn');
  });

  it('p=reject 是完整的', () => {
    expect(dmarcVerdict('v=DMARC1;p=reject;sp=reject').state).toBe('ok');
  });

  it('记录存在但缺 p= 等于没生效', () => {
    expect(dmarcVerdict('v=DMARC1; rua=mailto:a@example.com').state).toBe('invalid');
  });
});

describe('域名体检 > DKIM 撤销状态', () => {
  it('p= 后面没有公钥是撤销，不是配好了', () => {
    // example.com 就是这个写法：声明"这个 selector 的密钥已废弃"
    expect(hasRealDkimKey('v=DKIM1; p=')).toBe(false);
    expect(hasRealDkimKey('v=DKIM1; k=rsa; p=')).toBe(false);
  });

  it('有足够长的公钥才算配好', () => {
    const key = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA';
    expect(hasRealDkimKey(`v=DKIM1; k=rsa; p=${key}`)).toBe(true);
  });
});

// ---- 结论分场景 -------------------------------------------------------------

const mail = (over: Partial<EmailSection> = {}): EmailSection => ({
  architecture: 'third-party',
  provider: '阿里云企业邮',
  mx: ['mx1.qiye.aliyun.com'],
  checks: [
    { key: 'dbl', label: 'Spamhaus DBL', state: 'clean', detail: '干净' },
    { key: 'surbl', label: 'SURBL', state: 'clean', detail: '干净' },
    { key: 'spf', label: 'SPF', state: 'ok', detail: '已配置' },
    { key: 'dkim', label: 'DKIM', state: 'ok', detail: '已配置' },
    { key: 'dmarc', label: 'DMARC', state: 'ok', detail: '已配置' },
  ],
  verdict: '能发出去',
  ...over,
});

const google = (over: Partial<GoogleSection> = {}): GoogleSection => ({
  caveat: '这一项第三方拿不到',
  safeBrowsing: { url: 'https://example.test/sb', note: '看 Google 的原话' },
  searchConsole: { url: 'https://example.test/sc', note: '只有站主能看' },
  siteReach: { state: 'ok', detail: '能打开' },
  ...over,
});

const reg = (over: Partial<RegistrationSection> = {}): RegistrationSection => ({
  state: 'registered',
  created: '2025-10-06',
  expires: '2027-10-06',
  registrar: '阿里云',
  status: ['active'],
  ageDays: 380,
  kind: 'existing',
  kindNote: '已经存在 380 天',
  ownerNote: '查不到',
  ...over,
});

describe('域名体检 > 结论分场景', () => {
  it('还没人注册、也没被用过 → 说"可以注册"，副句说"没发现问题"', () => {
    const h = buildHeadline(mail(), google(), reg({ state: 'available', residue: residue('clean') }));
    expect(h.scenario).toBe('buy');
    expect(h.tone).toBe('ok');
    expect(h.title).toBe('可以注册');
    expect(h.detail).toContain('没发现问题');
  });

  it('被用过但黑名单干净 → 仍然是"可以注册"，痕迹只算提示', () => {
    const h = buildHeadline(mail(), google(), reg({ state: 'available', residue: residue('traces') }));
    expect(h.scenario).toBe('buy');
    expect(h.title).toBe('可以注册');
    // 「被用过」是痕迹，「有黑历史」是污点——不能拿痕迹去否定注册资格
    expect(h.detail).toContain('以前被人用过');
    expect(h.detail).toContain('没查到黑名单记录');
    expect(h.tone).toBe('warn');
  });

  it('黑名单里有记录 → 这才是"不能注册"，并紧跟"能下单但用不了"', () => {
    const listed = mail({
      checks: [
        { key: 'dbl', label: 'Spamhaus DBL', state: 'listed', detail: '命中' },
        { key: 'surbl', label: 'SURBL', state: 'clean', detail: '干净' },
      ],
    });
    const h = buildHeadline(listed, google(), reg({ state: 'available', residue: residue('traces') }));
    expect(h.tone).toBe('bad');
    expect(h.title).toBe('不能注册');
    expect(h.detail).toContain('Spamhaus DBL');
    expect(h.detail).toContain('能下单');
  });

  it('三处全空却命中了黑名单 → 依然不能注册（名单比痕迹硬）', () => {
    const listed = mail({
      checks: [{ key: 'dbl', label: 'Spamhaus DBL', state: 'listed', detail: '命中' }],
    });
    const h = buildHeadline(listed, google(), reg({ state: 'available', residue: residue('clean') }));
    expect(h.title).toBe('不能注册');
  });

  it('只是历史查不了、黑名单干净 → 可以注册，但要说明没打包票', () => {
    const h = buildHeadline(mail(), google(), reg({ state: 'available', residue: residue('unknown') }));
    expect(h.title).toBe('可以注册');
    expect(h.detail).toContain('没查到黑名单记录');
    expect(h.detail).toContain('不打包票');
  });

  it('黑名单本身没查通 → 不许说"可以注册"（判据缺了）', () => {
    const unk = mail({
      checks: [
        { key: 'dbl', label: 'Spamhaus DBL', state: 'unknown', detail: '超时' },
        { key: 'surbl', label: 'SURBL', state: 'clean', detail: '干净' },
      ],
    });
    const h = buildHeadline(unk, google(), reg({ state: 'available', residue: residue('clean') }));
    expect(h.title).toBe('判断不了');
    expect(h.tone).toBe('warn');
  });

  it('已注册且干净 → 说"没发现问题"', () => {
    const h = buildHeadline(mail(), google(), reg());
    expect(h.scenario).toBe('diagnose');
    expect(h.tone).toBe('ok');
    expect(h.title).toBe('没发现问题');
  });

  it('已注册但有硬伤 → 结论只说"有问题"，点名放明细里', () => {
    const down = google({ siteReach: { state: 'unreachable', detail: '连不上' } });
    const h = buildHeadline(mail(), down, reg());
    expect(h.tone).toBe('bad');
    expect(h.title).toBe('有问题');
    expect(h.detail).toContain('网站打不开');
  });

  it('配置缺失也归"有问题"，大小问题留在明细里说', () => {
    const gap = mail({
      checks: [
        { key: 'dbl', label: 'Spamhaus DBL', state: 'clean', detail: '干净' },
        { key: 'spf', label: 'SPF', state: 'ok', detail: '已配置' },
        { key: 'dkim', label: 'DKIM', state: 'missing', detail: '没配' },
      ],
    });
    const h = buildHeadline(gap, google(), reg());
    expect(h.tone).toBe('warn');
    // 结论层只有"有问题"，不在这儿分大小 —— 客户要知道的就是有没有事
    expect(h.title).toBe('有问题');
    expect(h.detail).toContain('小问题');
    expect(h.detail).toContain('DKIM');
  });

  it('站点只配了 http → 算"有问题"，别报成"站点打不开"', () => {
    const plain = google({
      siteReach: { state: 'insecure', detail: '只能用 http 打开，没有配 HTTPS' },
    });
    const h = buildHeadline(mail(), plain, reg());
    expect(h.title).toBe('有问题');
    expect(h.detail).toContain('HTTPS');
    // 站是活的，说成"打不开"是误报，客户一打开反而觉得我们不靠谱
    expect(h.detail).not.toContain('网站打不开');
  });

  it('部分项没查通、其余正常 → 仍说"没发现问题"，但要点明那几项没查成', () => {
    const part = mail({
      checks: [
        { key: 'dbl', label: 'Spamhaus DBL', state: 'clean', detail: '干净' },
        { key: 'spf', label: 'SPF', state: 'ok', detail: '已配置' },
        { key: 'dmarc', label: 'DMARC', state: 'unknown', detail: '超时' },
      ],
    });
    const h = buildHeadline(part, google(), reg());
    expect(h.title).toBe('没发现问题');
    // 没查成的项绝不按干净处理，必须在副句里交代
    expect(h.detail).toContain('没查成');
  });

  it('结论必须短：标题不超过 6 个字，别把推理塞进结论', () => {
    const cases = [
      buildHeadline(mail(), google(), reg({ state: 'available', residue: residue('clean') })),
      buildHeadline(mail(), google(), reg({ state: 'available', residue: residue('traces') })),
      buildHeadline(mail(), google(), reg({ state: 'available', residue: residue('unknown') })),
      buildHeadline(mail(), google(), reg()),
    ];
    for (const h of cases) expect(h.title.length).toBeLessThanOrEqual(6);
  });

  it('有一项没查通时不许输出"没问题"', () => {
    const unk = mail({
      checks: [{ key: 'dmarc', label: 'DMARC', state: 'unknown', detail: '超时' }],
    });
    const h = buildHeadline(unk, google(), reg());
    expect(h.title).toBe('判断不了');
    expect(h.tone).toBe('warn');
  });
});

function residue(state: 'clean' | 'traces' | 'unknown', over: Partial<ResidueSection> = {}): ResidueSection {
  const strength = state === 'traces' ? 'weak' : state === 'clean' ? 'none' : 'unknown';
  return { state, strength, a: [], ns: [], mx: [], note: 'note', ...over };
}

describe('域名体检 > DNS 空不等于没人用过', () => {
  it('DNS 全空但证书日志有记录 → 可以注册，但要说明以前用过', () => {
    const r = residue('traces', {
      strength: 'hard',
      cert: { state: 'hit', first: '2016-04-01', count: 3, note: '查到 3 条证书签发记录，最早一条是 2016-04-01。' },
    });
    const h = buildHeadline(mail(), google(), reg({ state: 'available', residue: r }));
    expect(h.title).toBe('可以注册');
    expect(h.detail).toContain('证书日志');
    expect(h.tone).toBe('warn');
  });

  it('DNS 全空但被动 DNS 有历史 → 可以说以前用过，但不否定注册资格', () => {
    const r = residue('traces', {
      strength: 'hard',
      passive: { state: 'hit', hosts: ['shop.example.com'], note: '被动 DNS 里有 1 条解析历史。' },
    });
    const h = buildHeadline(mail(), google(), reg({ state: 'available', residue: r }));
    expect(h.title).toBe('可以注册');
    expect(h.detail).toContain('解析历史');
  });

  it('三处都空 → 可以注册，结论一句话说完', () => {
    const clean = residue('clean', {
      cert: { state: 'miss', note: '近期没有查到证书签发记录。' },
      passive: { state: 'miss', note: '被动 DNS 里没有查到解析历史。' },
    });
    const h = buildHeadline(mail(), google(), reg({ state: 'available', residue: clean }));
    expect(h.tone).toBe('ok');
    expect(h.title).toBe('可以注册');
    expect(h.detail.length).toBeLessThan(40);
  });

  it('只有 DNS 证据（弱）→ 也照实说被人用过，但不说不能注册', () => {
    const r = residue('traces', { strength: 'weak', a: ['1.2.3.4'] });
    const h = buildHeadline(mail(), google(), reg({ state: 'available', residue: r }));
    expect(h.title).toBe('可以注册');
    expect(h.detail).toContain('以前被人用过');
  });
});

describe('域名体检 > 下一步分栏', () => {
  it('自己十分钟能做的和要人帮忙的必须分开', () => {
    const steps = buildNext(mail(), google(), reg());
    expect(steps.some(s => s.who === 'self')).toBe(true);
    expect(steps.some(s => s.who === 'us')).toBe(true);
  });

  it('域名还没注册时不要提"补 SPF"——还没邮箱可配', () => {
    const steps = buildNext(
      mail({ skipped: '未注册' }),
      google(),
      reg({ state: 'available', residue: residue('clean') }),
    );
    expect(steps.some(s => s.text.includes('SPF'))).toBe(false);
  });

  it('SPF 写成 +all 要单独给一条，别混在"补齐"里', () => {
    const bad = mail({
      checks: [
        { key: 'spf', label: 'SPF', state: 'invalid', detail: '+all' },
        { key: 'dkim', label: 'DKIM', state: 'missing', detail: '没配' },
      ],
    });
    const steps = buildNext(bad, google(), reg());
    expect(steps.some(s => s.text.includes('+all'))).toBe(true);
  });
});

describe('域名体检 > 报告编号与状态翻译', () => {
  it('编号可重复（同一域名同一分钟一致），且带日期便于核对', () => {
    const iso = '2026-10-22T01:05:00.000Z';
    expect(reportIdOf('puffergo.com', iso)).toBe(reportIdOf('puffergo.com', iso));
    expect(reportIdOf('puffergo.com', iso)).toMatch(/^PG-\d{8}-\d{4}-[0-9A-F]{4}$/);
    expect(reportIdOf('other.com', iso)).not.toBe(reportIdOf('puffergo.com', iso));
  });

  it('EPP 状态码要翻成人话，翻不出来就照原样给，不猜', () => {
    expect(statusText('clientTransferProhibited')).toContain('禁止转移');
    expect(statusText('clientTransferProhibited')).toContain('clientTransferProhibited');
    expect(statusText('someBrandNewCode')).toBe('someBrandNewCode');
  });
});
