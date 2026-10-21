/**
 * `puffergo domain check <域名>` — 三件事，一次说清：
 *   1. 邮件能不能送到别人手上（先看 MX 判架构，再决定查域名还是查 IP）
 *   2. 会不会被 Google 拦（不判定，只给入口 + 站点体征）
 *   3. 这个域名什么来路（RDAP：注册时间、到期、注册商、新域名还是二手）
 *
 * 三条硬规矩（写在代码里，改之前先读）：
 *  - **三态**：命中 / 干净 / 查不了。DNS 超时、解析器被拒都不等于干净。
 *  - **不编造**：Google 的拦截与处罚状态第三方拿不到，就只说"自己去看"，绝不给"应该没问题"。
 *  - **每个结论跟一个动作**：能修的给修法，修不了给入口，什么都做不了的就不提。
 *
 * 免费钩子，不收费。所有查询都是公开数据，不需要登录、不需要 key、不需要 --site。
 */

import dns from 'node:dns/promises';
import type { CmdCtx, Out } from './siteCmd';

export const DOMAIN_USAGE =
  'puffergo domain check <域名> [--json] [--html <输出路径>]\n' +
  '  --html 生成一份单文件网页报告，客户能直接点开看（不发任何外部请求，离线可开）';

const DNS_TIMEOUT = 6000;

/** 查得到 / 干净 / 查不了——第三种绝不能被说成第二种。 */
type DnsState = 'listed' | 'clean' | 'unknown';

interface DnsblResult {
  state: DnsState;
  codes?: string[];
  error?: string;
}

async function withTimeout<T>(p: Promise<T>, ms = DNS_TIMEOUT): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('查询超时'), { code: 'ETIMEOUT' })), ms);
    timer.unref?.();
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const dnsCode = (e: unknown): string => (e as NodeJS.ErrnoException)?.code ?? 'unknown';

/**
 * DNSBL 查询。Spamhaus 通过公共解析器（1.1.1.1 / 8.8.8.8）查询时会返回 127.255.255.x，
 * 那是"你查的方式不对"的错误码，不是命中——把它当命中会把全世界每个域名都报成被拉黑。
 */
async function dnsbl(name: string): Promise<DnsblResult> {
  try {
    const codes = await withTimeout(dns.resolve4(name));
    if (codes.some(c => c.startsWith('127.255.255.'))) {
      return { state: 'unknown', error: 'resolver-blocked' };
    }
    return { state: 'listed', codes };
  } catch (e) {
    const code = dnsCode(e);
    if (code === 'ENOTFOUND' || code === 'ENODATA') return { state: 'clean' };
    return { state: 'unknown', error: code };
  }
}

/**
 * TXT 查询走 DoH，DNSBL 走系统解析器——这两类查询的 DNS 要求正好相反：
 *  - 黑名单：Spamhaus 拒绝回答来自公共解析器的查询（返回 127.255.255.x），所以必须走系统解析器；
 *  - 普通记录：部分网络环境下 c-ares 查 TXT 会超时（本机实测如此），走 DoH 才稳。
 * 把两者混在一条通道上，总会有一半查不准。
 */
const DOH_ENDPOINTS = ['https://dns.alidns.com/resolve', 'https://cloudflare-dns.com/dns-query'];

/** TXT 记录是多段引号拼接的，剥掉引号再合并。 */
function unquoteTxt(s: string): string {
  if (!s.startsWith('"')) return s;
  return s.slice(1, -1).split('" "').join('');
}

interface TxtResult {
  state: 'ok' | 'none' | 'unknown';
  records: string[];
  error?: string;
}

async function txtViaSystem(name: string): Promise<TxtResult> {
  try {
    const rows = await withTimeout(dns.resolveTxt(name));
    return { state: 'ok', records: rows.map(chunks => chunks.join('')) };
  } catch (e) {
    const code = dnsCode(e);
    if (code === 'ENOTFOUND' || code === 'ENODATA') return { state: 'none', records: [] };
    return { state: 'unknown', records: [], error: code };
  }
}

async function txt(name: string): Promise<TxtResult> {
  for (const ep of DOH_ENDPOINTS) {
    try {
      const res = await fetch(`${ep}?name=${encodeURIComponent(name)}&type=TXT`, {
        headers: { accept: 'application/dns-json' },
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) continue;
      const j = (await res.json()) as { Status?: number; Answer?: Array<{ type?: number; data?: string }> };
      if (j.Status === 3) return { state: 'none', records: [] }; // NXDOMAIN：确实没这条记录
      if (j.Status !== 0) return { state: 'unknown', records: [], error: `doh-${j.Status}` };
      const records = (j.Answer ?? []).filter(a => a.type === 16).map(a => unquoteTxt(String(a.data ?? '')));
      return records.length ? { state: 'ok', records } : { state: 'none', records: [] };
    } catch {
      // 换下一个端点；全挂再退回系统解析器
    }
  }
  return txtViaSystem(name);
}

/**
 * 通用 DoH 查询，只用于判断"一个可注册的域名还留没留 DNS 记录"。
 * 走 DoH 而不是系统解析器：这里要的是"有没有记录"这个布尔值，
 * 换解析器会得到不一致的答案，判断就站不住。
 */
async function dohQuery(
  name: string,
  type: 'A' | 'NS' | 'MX',
): Promise<{ state: 'ok' | 'none' | 'unknown'; records: string[] }> {
  const want = type === 'A' ? 1 : type === 'NS' ? 2 : 15;
  for (const ep of DOH_ENDPOINTS) {
    try {
      const res = await fetch(`${ep}?name=${encodeURIComponent(name)}&type=${type}`, {
        headers: { accept: 'application/dns-json' },
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) continue;
      const j = (await res.json()) as { Status?: number; Answer?: Array<{ type?: number; data?: string }> };
      if (j.Status === 3) return { state: 'none', records: [] }; // NXDOMAIN：这个名字在 DNS 里根本不存在
      if (j.Status !== 0) return { state: 'unknown', records: [] };
      const records = (j.Answer ?? []).filter(a => a.type === want).map(a => String(a.data ?? ''));
      return { state: records.length ? 'ok' : 'none', records };
    } catch {
      // 换下一个端点
    }
  }
  return { state: 'unknown', records: [] };
}

// ---- 第 1 项：邮件 ----------------------------------------------------------

/** 常见邮箱服务商。命中即说明发信 IP 归服务商，客户查了也换不了。 */
const MAIL_PROVIDERS: Array<[RegExp, string]> = [
  [/(^|\.)qiye\.aliyun\.com$/i, '阿里云企业邮'],
  [/(^|\.)mx\d*\.aliyun\.com$/i, '阿里云企业邮'],
  [/(^|\.)mxbiz\d*\.qq\.com$/i, '腾讯企业邮'],
  [/(^|\.)mx\d*\.qq\.com$/i, '腾讯企业邮'],
  [/(^|\.)163\.com$/i, '网易企业邮'],
  [/(^|\.)126\.com$/i, '网易企业邮'],
  [/(^|\.)google(mail)?\.com$/i, 'Google Workspace'],
  [/(^|\.)protection\.outlook\.com$/i, 'Microsoft 365'],
  [/(^|\.)outlook\.com$/i, 'Microsoft 365'],
  [/(^|\.)zoho\.(com|eu|in)$/i, 'Zoho Mail'],
  [/(^|\.)yandex\.net$/i, 'Yandex Mail'],
  [/(^|\.)mailgun\.org$/i, 'Mailgun'],
  [/(^|\.)sendgrid\.net$/i, 'SendGrid'],
  [/(^|\.)brevo\.com$/i, 'Brevo'],
];

/** DKIM selector 因服务商而异，阿里企业邮是 default，Google 是 google，微软是 selector1。
 *  只试一个就断言"没配"是误报——必须多试几个，且措辞留余地。 */
const DKIM_SELECTORS = [
  'default',
  'google',
  's1',
  's2',
  'aliyun',
  'alimail',
  'mail',
  'dkim',
  'k1',
  'selector1',
  'selector2',
  'smtp',
];

interface MailCheck {
  key: string;
  label: string;
  state: 'ok' | 'warn' | 'missing' | 'invalid' | 'listed' | 'clean' | 'unknown';
  detail: string;
  fix?: string;
}

export interface EmailSection {
  architecture: 'third-party' | 'self-hosted' | 'null' | 'unknown';
  provider: string;
  mx: string[];
  /** 只在 self-hosted 时非空：发信 IP 是客户自己的，才值得查。 */
  ipChecks?: Array<{ list: string; ip: string; state: DnsState; note: string; codes?: string[] }>;
  checks: MailCheck[];
  verdict: string;
  /** 域名还没注册时置位：没有邮箱配置可查，逐项报"缺 SPF/DKIM"会让人莫名其妙。 */
  skipped?: string;
}

/**
 * `p=` 后面没有公钥（或只有几个字符）不是"配好了"，而是这个 selector 被显式撤销。
 * example.com 就是这种写法：`v=DKIM1; p=` —— 只判断"有没有记录"会把它误报成配了。
 */
export function hasRealDkimKey(record: string): boolean {
  const p = record.match(/\bp\s*=\s*([A-Za-z0-9+/=]*)/i)?.[1] ?? '';
  return p.length >= 20;
}

export function spfVerdict(record: string): { state: MailCheck['state']; detail: string } {
  const all = record.match(/[+\-~?]all\b/i)?.[0]?.toLowerCase();
  if (!all)
    return { state: 'warn', detail: `已配置，但没有 all 机制（收件方无法判断未授权来源该怎么处理）：${record}` };
  if (all === '+all')
    return { state: 'invalid', detail: `写成了 +all，等于允许任何人用你的域名发信，比不配更糟：${record}` };
  if (all === '?all') return { state: 'warn', detail: `写的是 ?all（中性），收件方不会据此拦截伪造邮件：${record}` };
  if (all === '~all') return { state: 'ok', detail: `已配置（~all 软失败，未授权来源进垃圾箱）：${record}` };
  return { state: 'ok', detail: `已配置（-all 硬拒绝，最严）：${record}` };
}

export function dmarcVerdict(record: string): { state: MailCheck['state']; detail: string } {
  const policy = record.match(/\bp\s*=\s*(none|quarantine|reject)\b/i)?.[1]?.toLowerCase();
  if (!policy) return { state: 'invalid', detail: `记录存在但缺 p= 策略，等于没生效：${record}` };
  if (policy === 'none')
    return { state: 'warn', detail: `p=none，只观察不处置——能收报告，但伪造邮件仍会送达：${record}` };
  return { state: 'ok', detail: `已配置（p=${policy}）：${record}` };
}

async function checkEmail(domain: string): Promise<EmailSection> {
  let mx: Array<{ priority: number; exchange: string }> = [];
  let mxUnknown: string | undefined;
  try {
    mx = (await withTimeout(dns.resolveMx(domain))).sort((a, b) => a.priority - b.priority);
  } catch (e) {
    const code = dnsCode(e);
    if (code !== 'ENOTFOUND' && code !== 'ENODATA') mxUnknown = code;
  }

  // RFC 7505 的 null MX（`0 .`）：明确声明"本域不接收邮件"。这和"没查到 MX"是两件事，
  // 混在一起会把主人的 deliberate 声明报成"配置缺失"。
  const hosts = mx.map(m => m.exchange.replace(/\.$/, '')).filter(h => h !== '');
  const nullMx = mx.length > 0 && hosts.length === 0;
  const provider = hosts.length
    ? (MAIL_PROVIDERS.find(([re]) => hosts.some(h => re.test(h)))?.[1] ?? '其他服务商')
    : '—';
  const selfHosted = hosts.some(h => h === domain || h.endsWith('.' + domain));
  const architecture: EmailSection['architecture'] = mxUnknown
    ? 'unknown'
    : nullMx
      ? 'null'
      : !hosts.length
        ? 'unknown'
        : selfHosted
          ? 'self-hosted'
          : 'third-party';

  const [dbl, surbl, spfTxt, dmarcTxt] = await Promise.all([
    dnsbl(`${domain}.dbl.spamhaus.org`),
    dnsbl(`${domain}.multi.surbl.org`),
    txt(domain),
    txt(`_dmarc.${domain}`),
  ]);

  const checks: MailCheck[] = [];

  // 域名级黑名单 —— 跟用谁的邮件服务无关，域名是你自己的
  checks.push(
    dbl.state === 'listed'
      ? {
          key: 'dbl',
          label: 'Spamhaus DBL',
          state: 'listed',
          detail: `命中（返回码 ${dbl.codes?.join(', ')}），邮件会被拒收或降权`,
          fix: '先查被列入的原因，再在 https://check.spamhaus.org/ 申请移除；不清根因，移除后几天会再被列',
        }
      : dbl.state === 'clean'
        ? { key: 'dbl', label: 'Spamhaus DBL', state: 'clean', detail: '干净，没有被列入' }
        : { key: 'dbl', label: 'Spamhaus DBL', state: 'unknown', detail: `查不了（${dbl.error}），不能当成干净` },
  );
  checks.push(
    surbl.state === 'listed'
      ? {
          key: 'surbl',
          label: 'SURBL',
          state: 'listed',
          detail: `命中（返回码 ${surbl.codes?.join(', ')}）`,
          fix: '检查邮件正文里被你引用的那个域名，通常来自被挂马的页面',
        }
      : surbl.state === 'clean'
        ? { key: 'surbl', label: 'SURBL', state: 'clean', detail: '干净，没有被列入（查的是邮件正文里链接的域名）' }
        : { key: 'surbl', label: 'SURBL', state: 'unknown', detail: `查不了（${surbl.error}），不能当成干净` },
  );

  // SPF
  if (spfTxt.state === 'unknown') {
    checks.push({ key: 'spf', label: 'SPF', state: 'unknown', detail: `查不了（${spfTxt.error}），不能当成没配` });
  } else {
    const spfRecords = spfTxt.records.filter(r => /^v=spf1\b/i.test(r.trim()));
    if (!spfRecords.length) {
      checks.push({
        key: 'spf',
        label: 'SPF',
        state: 'missing',
        detail: '未配置——收件方无法确认哪些服务器可以用你的域名发信',
        fix: '加一条 TXT 记录，主机记录 @',
      });
    } else if (spfRecords.length > 1) {
      checks.push({
        key: 'spf',
        label: 'SPF',
        state: 'invalid',
        detail: `有 ${spfRecords.length} 条 SPF 记录，比没有更糟（RFC 只允许一条，收件方会判为无效）`,
        fix: '合并成一条',
      });
    } else {
      const v = spfVerdict(spfRecords[0]);
      checks.push({ key: 'spf', label: 'SPF', state: v.state, detail: v.detail });
    }
  }

  // DKIM —— 多试几个 selector 再下结论，且要分清"确实没有"和"没查成"。
  // 并发查而不是串行：12 个 selector × 2 个 DoH 端点，串行在断网时会挂几分钟。
  const dkimHits: string[] = [];
  let dkimUnknown = 0;
  const dkimRows = await Promise.all(DKIM_SELECTORS.map(sel => txt(`${sel}._domainkey.${domain}`)));
  dkimRows.forEach((r, i) => {
    if (r.state === 'unknown') dkimUnknown++;
    else if (r.state === 'ok' && r.records.some(hasRealDkimKey)) dkimHits.push(DKIM_SELECTORS[i]);
  });
  if (dkimHits.length) {
    checks.push({ key: 'dkim', label: 'DKIM', state: 'ok', detail: `已配置（selector: ${dkimHits.join(', ')}）` });
  } else if (dkimUnknown === DKIM_SELECTORS.length) {
    checks.push({
      key: 'dkim',
      label: 'DKIM',
      state: 'unknown',
      detail: `查不了（${DKIM_SELECTORS.length} 个 selector 全部查询失败），不能当成没配`,
    });
  } else {
    checks.push({
      key: 'dkim',
      label: 'DKIM',
      state: 'missing',
      detail: `试了 ${DKIM_SELECTORS.length} 个常见 selector 都没记录。可能是没配，也可能是用了非常规 selector（以后台为准）`,
      fix: '邮件服务商后台生成密钥后，把 TXT 记录加到域名解析里',
    });
  }

  // DMARC
  if (dmarcTxt.state === 'unknown') {
    checks.push({
      key: 'dmarc',
      label: 'DMARC',
      state: 'unknown',
      detail: `查不了（${dmarcTxt.error}），不能当成没配`,
    });
  } else {
    const rec = dmarcTxt.records.find(r => /^v=DMARC1\b/i.test(r.trim()));
    if (!rec) {
      checks.push({
        key: 'dmarc',
        label: 'DMARC',
        state: 'missing',
        detail: '未配置——收件方不知道该怎么处理伪造你域名的邮件，也没有人给你发报告',
        fix: '加一条 TXT 记录，主机记录 _dmarc',
      });
    } else {
      const v = dmarcVerdict(rec);
      checks.push({ key: 'dmarc', label: 'DMARC', state: v.state, detail: v.detail });
    }
  }

  // 只有邮件在客户自己机器上时，发信 IP 才是他的，才值得查
  let ipChecks: EmailSection['ipChecks'];
  if (architecture === 'self-hosted' && hosts.length) {
    ipChecks = [];
    for (const host of hosts.slice(0, 2)) {
      let ip = '';
      try {
        ip = (await withTimeout(dns.resolve4(host)))[0] ?? '';
      } catch {
        continue;
      }
      if (!ip) continue;
      const rev = ip.split('.').reverse().join('.');
      const zen = await dnsbl(`${rev}.zen.spamhaus.org`);
      const note =
        zen.state === 'listed'
          ? zen.codes?.some(c => c === '127.0.0.10' || c === '127.0.0.11')
            ? 'PBL 策略标记：这个网段不该直接发信，不是滥用记录。走专业发信服务即可'
            : zen.codes?.some(c => c === '127.0.0.4' || c === '127.0.0.5' || c === '127.0.0.6' || c === '127.0.0.7')
              ? 'XBL：这台主机疑似被入侵，正在被人当跳板发信'
              : 'SBL：被列为垃圾邮件来源'
          : zen.state === 'clean'
            ? '干净'
            : `查不了（${zen.error}）`;
      ipChecks.push({ list: 'Spamhaus ZEN', ip, state: zen.state, note, codes: zen.codes });
    }
  }

  const verdict = buildEmailVerdict(architecture, provider, checks, ipChecks);
  return { architecture, provider, mx: hosts, ipChecks, checks, verdict };
}

function buildEmailVerdict(
  arch: EmailSection['architecture'],
  provider: string,
  checks: MailCheck[],
  ipChecks: EmailSection['ipChecks'],
): string {
  const bad = checks.filter(c => c.state === 'listed' || c.state === 'missing' || c.state === 'invalid');
  const unknown = checks.filter(c => c.state === 'unknown');
  const ipBad = (ipChecks ?? []).filter(c => c.state === 'listed');

  if (arch === 'null') {
    return '这个域名明确声明了不接收邮件（MX 记录是 0 .）——用它发信，大多数收件方会直接拒绝。要收信，先把 MX 记录改掉。';
  }
  if (bad.some(c => c.state === 'listed') || ipBad.length) {
    return '有硬伤：黑名单命中，邮件会被拒收或直接丢进垃圾箱。换任何邮件服务商都没用（域名是你的），先按下面的路径处理。';
  }
  if (unknown.length) return `有 ${unknown.length} 项没查通，不能下"健康"的结论，需要人工复核。`;
  if (!bad.length) {
    return arch === 'third-party'
      ? `发得出去。邮件身份三项齐全；发信 IP 由${provider === '其他服务商' ? '你的邮箱服务商' : provider}提供，跟你自己的服务器无关。`
      : '发得出去。邮件身份三项齐全。';
  }
  const names = bad.map(c => c.label).join('、');
  if (arch === 'third-party') {
    return `能发出去。但收件方看到的是「${provider}」的服务器，信上盖的是你的域名——缺 ${names} 会拉低评分，更容易进垃圾箱。`;
  }
  return `能发出去。但缺 ${names}，进垃圾箱的概率偏高。`;
}

// ---- 第 2 项：Google（只给入口，不给判定） ---------------------------------

export interface GoogleSection {
  caveat: string;
  safeBrowsing: { url: string; note: string };
  searchConsole: { url: string; note: string };
  /** insecure = 只有 http 能开：站活着，但没配 HTTPS，这本身是个要修的问题，不是"打不开"。 */
  siteReach: { state: 'ok' | 'redirected' | 'insecure' | 'unreachable' | 'unknown'; detail: string };
}

/** 站点体征——不是"有没有被拦"的判定，只回答"这站现在正不正常"。
 *  被挂马/被拦之前通常先出现异常跳转或打不开，这是唯一能免费拿到的前兆信号。 */
async function probeSite(url: string): Promise<{ ok: boolean; status?: number; finalHost?: string }> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(9000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; puffergo-domain-check)' },
    });
    return { ok: res.ok, status: res.status, finalHost: new URL(res.url).hostname.replace(/^www\./, '') };
  } catch {
    return { ok: false };
  }
}

async function checkSiteReach(domain: string): Promise<GoogleSection['siteReach']> {
  const bare = domain.replace(/^www\./, '');
  const https = await probeSite(`https://${domain}`);

  if (https.ok) {
    if (https.finalHost && https.finalHost !== bare) {
      return { state: 'redirected', detail: `打开你的域名后跳到了 ${https.finalHost}，确认这是你自己设的跳转` };
    }
    return { state: 'ok', detail: '首页可以正常打开' };
  }

  // https 打不开时不能直接判"站停了"：大量小站只配了 http，浏览器会提示不安全，
  // 但站是活的。先探一次 http，把"没配证书"和"站真没了"分开——这两件事的处置完全不同。
  const http = await probeSite(`http://${domain}`);
  if (http.ok) {
    return {
      state: 'insecure',
      detail: '只能用 http 打开，没有配 HTTPS——访客的浏览器会弹"不安全"，Google 排名也会吃亏，这一项要修',
    };
  }

  // 401/403/429 多半是防火墙把检测请求挡了，站本身是好的——说成"打不开"就是误报。
  if (https.status && [401, 403, 405, 429].includes(https.status)) {
    return {
      state: 'unknown',
      detail: `首页返回 HTTP ${https.status}，像是防火墙拦了检测请求——你自己用浏览器打开确认一下，别当站点故障`,
    };
  }
  if (https.status) return { state: 'unreachable', detail: `首页返回 HTTP ${https.status}，访客可能看不到内容` };
  return {
    state: 'unreachable',
    detail: '首页打不开（https 和 http 都连不上），可能站点停了，或者被拦',
  };
}

function googleSection(domain: string, reach: GoogleSection['siteReach']): GoogleSection {
  return {
    caveat:
      'Google 的拦截状态和搜索处罚，第三方拿不到可靠数据。这一项只给官方入口，不给判断——任何"我帮你查过了没事"的说法都是编的。',
    safeBrowsing: {
      url: `https://transparencyreport.google.com/safe-browsing/search?url=${encodeURIComponent(domain)}`,
      note: '点开看到的就是 Google 的判定，最准。要是显示有威胁，把页面截图给 AI，它帮你看是哪种、怎么解。',
    },
    searchConsole: {
      url: 'https://search.google.com/search-console',
      note: '有没有被搜索处罚，只有站主本人能看，而且必须先验证网站所有权（改 DNS 或传文件）。没验证过的话，这一步通常是卡点。',
    },
    siteReach: reach,
  };
}

// ---- 第 3 项：域名来路 ------------------------------------------------------

/**
 * RDAP 端点按 TLD 走 registry 直连（rdap.org 的转发节点会 403）。
 *
 * 表里只放最常用的几个做快路径，剩下的查 IANA 官方 bootstrap（覆盖 500+ gTLD）——
 * 硬编码一张表永远追不上新后缀，而 .xyz / .top / .shop / .store 这些外贸站常用的
 * 恰好都在里面。ccTLD（.co / .cn / .im / .de）普遍没跑 RDAP，查不到是能力边界，要明说。
 */
const RDAP_BASES: Record<string, string> = {
  com: 'https://rdap.verisign.com/com/v1/domain/',
  net: 'https://rdap.verisign.com/net/v1/domain/',
  org: 'https://rdap.publicinterestregistry.org/rdap/domain/',
  info: 'https://rdap.identitydigital.services/rdap/domain/',
  io: 'https://rdap.identitydigital.services/rdap/domain/',
};

let ianaBootstrap: Record<string, string> | undefined;

async function rdapBase(tld: string): Promise<string | undefined> {
  if (RDAP_BASES[tld]) return RDAP_BASES[tld];
  if (!ianaBootstrap) {
    try {
      const res = await fetch('https://data.iana.org/rdap/dns.json', { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const j = (await res.json()) as { services?: Array<[string[], string[]]> };
        const map: Record<string, string> = {};
        for (const [tlds, urls] of j.services ?? []) {
          const url = urls[0];
          if (!url) continue;
          for (const t of tlds) map[t] = url;
        }
        ianaBootstrap = map;
      }
    } catch {
      // 拉不到就只认静态表，不阻塞整体检测
    }
  }
  return ianaBootstrap?.[tld];
}

/** 一处档案级痕迹：命中就抹不掉，没命中不代表没有（覆盖范围有限，要说清）。 */
export interface TraceSource {
  state: 'hit' | 'miss' | 'unknown';
  note: string;
}

/**
 * 一个"能注册"的域名，可能只是没人续费掉出来的老域名，前主人的记录会跟着域名走。
 *
 * 判断这件事要分证据强弱，三条源的可信度完全不同：
 *  - **当前 DNS**（弱）：A/NS/MX 都是配置，掉出注册局后由新注册商/新持有人随时可清空。
 *    DNS 全空最多说明"现在没配解析"，不能说明"没被人用过"——囤域名的人不解析，一样是空。
 *  - **证书签发记录**（强）：只要配过 HTTPS，证书就进了透明日志，只增不减，删不掉。
 *    但免费接口只覆盖近期签发，早年没上 HTTPS 的站可能查不到。
 *  - **被动 DNS**（强）：第三方长期观测攒下来的解析历史，比当前 DNS 活得久。
 *
 * 所以结论必须按证据强度分层，不能把"DNS 空"说成"没人用过"。
 */
export interface ResidueSection {
  state: 'clean' | 'traces' | 'unknown';
  a: string[];
  ns: string[];
  mx: string[];
  /** 证书透明度日志：抹不掉的证据。 */
  cert?: TraceSource & { first?: string; last?: string; count?: number };
  /** 被动 DNS：比当前 DNS 活得久的历史。 */
  passive?: TraceSource & { hosts?: string[] };
  /** 命中的停放/挂牌服务商——有人在囤着卖。 */
  parked?: string;
  note: string;
  /** 结论的分量：hard = 有档案级证据；weak = 只有当前 DNS；none = 三处都空。 */
  strength: 'hard' | 'weak' | 'none' | 'unknown';
}

export interface RegistrationSection {
  state: 'registered' | 'available' | 'unknown';
  created?: string;
  expires?: string;
  changed?: string;
  registrar?: string;
  status?: string[];
  ageDays?: number;
  kind?: 'fresh' | 'existing' | 'unknown';
  kindNote?: string;
  /** 只在 state=available 时有值：可注册 ≠ 从没人用过。 */
  residue?: ResidueSection;
  /** 我们做不到的那一项，必须明说，别让客户以为查过了。 */
  ownerNote: string;
  error?: string;
}

function registrarOf(entity: unknown): string | undefined {
  const e = entity as { roles?: string[]; vcardArray?: unknown[]; entities?: unknown[] };
  if (e?.roles?.includes('registrar')) {
    const vcard = e.vcardArray?.[1] as Array<[string, unknown, string, string]> | undefined;
    const fn = vcard?.find(x => x[0] === 'fn')?.[3];
    if (fn) return fn;
  }
  for (const child of e?.entities ?? []) {
    const found = registrarOf(child);
    if (found) return found;
  }
  return undefined;
}

async function checkRegistration(domain: string): Promise<RegistrationSection> {
  const tld = domain.split('.').pop() ?? '';
  const ownerNote = 'WHOIS 隐私保护后注册人信息全部隐藏，历史 WHOIS 是付费库，免费数据里没有这一项';
  const base = await rdapBase(tld);

  // ccTLD 大多没有 RDAP（.co / .im / .cn 都是），这不是网络问题，是根本没人提供接口。
  // 必须说清是"这个后缀查不了"，不能让客户以为是网络不好、重试就行。
  if (!base) {
    return {
      state: 'unknown',
      error: `.${tld} 后缀没有公开的注册查询接口`,
      ownerNote,
    };
  }

  try {
    const res = await fetch(base + domain, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      headers: { accept: 'application/rdap+json' },
    });
    if (res.status === 404)
      return { state: 'available', kind: 'fresh', kindNote: '这个域名现在没人持有，可以注册。', ownerNote };
    if (!res.ok) return { state: 'unknown', error: `HTTP ${res.status}`, ownerNote };

    const j = (await res.json()) as {
      events?: Array<{ eventAction?: string; eventDate?: string }>;
      status?: string[];
      entities?: unknown[];
    };
    const pick = (a: string) => j.events?.find(e => e.eventAction === a)?.eventDate?.slice(0, 10);
    const created = pick('registration');
    const ageDays = created ? Math.floor((Date.now() - new Date(created).getTime()) / 86_400_000) : undefined;

    // 30 天是新旧的分界线：不满 30 天的域名不可能发过信、被举报过，也就无法带着前主人的黑名单记录。
    const kind: RegistrationSection['kind'] = ageDays === undefined ? 'unknown' : ageDays < 30 ? 'fresh' : 'existing';
    let kindNote: string;
    if (ageDays === undefined) {
      kindNote = '注册时间取不到，判断不了是新域名还是二手域名。';
    } else if (ageDays < 30) {
      kindNote = `刚注册 ${ageDays} 天，全新域名——不可能带前主人的黑名单记录，黑名单那几项查到干净是必然的。`;
    } else {
      // 中性描述：对"自己的域名"说"可能被前主人用过"很怪，对"想接手别人域名"的人又不够用。
      // 只说存在多久，把"值不值得接手"留给 03 段的其他字段。
      const years = ageDays >= 365 ? `（约 ${Math.round(ageDays / 365)} 年）` : '';
      kindNote = `这个域名已经存在 ${ageDays} 天${years}。注册得早不等于有问题，只是说明它被用过。`;
    }

    return {
      state: 'registered',
      created,
      expires: pick('expiration'),
      changed: pick('last changed'),
      registrar: registrarOf({ entities: j.entities }),
      status: j.status,
      ageDays,
      kind,
      kindNote,
      ownerNote,
    };
  } catch (e) {
    return { state: 'unknown', error: dnsCode(e), ownerNote };
  }
}

// ---- 可注册域名：有没有被用过的痕迹 -----------------------------------------

/**
 * 停放/挂牌服务商的 NS 特征。命中说明这个域名正被当货摆着卖——
 * 这是"囤域名"的直接证据，比任何推测都实在。
 */
const PARKING_HINTS: Array<[RegExp, string]> = [
  [/sedoparking|sedo\.com/i, 'Sedo'],
  [/dan\.com/i, 'Dan.com'],
  [/afternic/i, 'Afternic'],
  [/hugedomains/i, 'HugeDomains'],
  [/bodis/i, 'Bodis'],
  [/parkingcrew/i, 'ParkingCrew'],
  [/above\.com/i, 'Above.com'],
  [/cashparking|wsdns/i, 'GoDaddy 停放'],
  [/namefind/i, 'NameFind'],
  [/buydomains/i, 'BuyDomains'],
  [/domainmarket/i, 'DomainMarket'],
  [/parklogic|rookmedia/i, 'ParkLogic'],
  [/uniregistry/i, 'Uniregistry'],
  [/parked\./i, '停放服务商'],
];

function detectParking(ns: string[]): string | undefined {
  for (const host of ns) {
    for (const [re, name] of PARKING_HINTS) if (re.test(host)) return name;
  }
  return undefined;
}

/**
 * 证书透明度日志。crt.sh 存全量但长期过载，certspotter 免费版只给近期签发——
 * 所以两个都试：前者更全，后者更稳。
 *
 * 措辞红线：**空结果只能说"近期没有签发记录"，不能说"从没配过 HTTPS"**，
 * 因为两个免费源都不保证覆盖全部历史。早年只有 HTTP 的站，这里一定是空的。
 */
export async function probeCert(
  domain: string,
): Promise<TraceSource & { first?: string; last?: string; count?: number }> {
  // 先试 crt.sh（全量），失败再退 certspotter（近期）
  try {
    const res = await fetch(`https://crt.sh/?Identity=${encodeURIComponent(domain)}&output=json`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(9000),
    });
    if (res.ok) {
      const rows = (await res.json()) as Array<{ not_before?: string }>;
      if (Array.isArray(rows) && rows.length) {
        const dates = rows
          .map(r => r.not_before?.slice(0, 10))
          .filter(Boolean)
          .sort() as string[];
        return {
          state: 'hit',
          first: dates[0],
          last: dates[dates.length - 1],
          count: rows.length,
          note: `证书透明度日志里有 ${rows.length} 条签发记录，最早一条是 ${dates[0]}。`,
        };
      }
      if (Array.isArray(rows)) return { state: 'miss', note: '证书透明度日志里没有这个域名的签发记录。' };
    }
  } catch {
    // crt.sh 常年 502，直接退到 certspotter
  }

  try {
    const res = await fetch(
      `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}&include_subdomains=false&expand=dns_names`,
      { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) },
    );
    if (res.status === 429)
      return { state: 'unknown', note: '证书查询被限流（免费额度每小时 100 次），这一项没查成。' };
    if (!res.ok) return { state: 'unknown', note: `证书查询失败（HTTP ${res.status}），这一项没查成。` };
    const rows = (await res.json()) as Array<{ not_before?: string }>;
    if (!Array.isArray(rows)) return { state: 'unknown', note: '证书查询返回了看不懂的东西，这一项没查成。' };
    if (!rows.length) return { state: 'miss', note: '近期没有查到证书签发记录。' };
    const dates = rows
      .map(r => r.not_before?.slice(0, 10))
      .filter(Boolean)
      .sort() as string[];
    return {
      state: 'hit',
      last: dates[dates.length - 1],
      count: rows.length,
      // 这个接口只回最近的记录，说"最早一条"就是编 —— 只能报最近一次。
      note: `近期有 ${rows.length} 条签发记录，最近一次是 ${dates[dates.length - 1]}（免费接口只给最近的，更早的看不到）。`,
    };
  } catch {
    return { state: 'unknown', note: '证书查询没连上，这一项没查成。' };
  }
}

/**
 * 被动解析历史：比当前 DNS 活得久。域名掉出注册局、DNS 被清空之后，
 * 这里往往还留着它解析过的子域名——这正是"DNS 全空但其实用过"的补证。
 *
 * 两个源轮着用，因为免费额度都靠不住：
 *  - HackerTarget：真被动 DNS，带 IP，但无 key 只给几十次/天；
 *  - subdomain.center：全量证书日志反推的历史子域，不限流，做兜底。
 * 只有两个都拿不到结果才算 unknown —— 单源限流不该让整项变成"没查成"。
 */
export async function probePassiveDns(domain: string): Promise<TraceSource & { hosts?: string[] }> {
  const errors: string[] = [];

  try {
    const res = await fetch(`https://api.hackertarget.com/hostsearch/?q=${encodeURIComponent(domain)}`, {
      signal: AbortSignal.timeout(9000),
    });
    const text = res.ok ? (await res.text()).trim() : '';
    // 限流时返回的是一句英文提示，不是 CSV —— 别把它当成"没记录"
    const throttled = !res.ok || (/error|exceeded|quota|membership/i.test(text) && !text.includes(','));
    if (!throttled) {
      const hosts = text
        .split('\n')
        .map(line => line.split(',')[0]?.trim())
        .filter((h): h is string => Boolean(h) && h.includes('.'));
      if (hosts.length) {
        return { state: 'hit', hosts: hosts.slice(0, 6), note: `被动 DNS 里有 ${hosts.length} 条解析历史。` };
      }
      return { state: 'miss', note: '被动 DNS 里没有查到解析历史。' };
    }
    errors.push('主源限流');
  } catch {
    errors.push('主源没连上');
  }

  try {
    const res = await fetch(`https://api.subdomain.center/?domain=${encodeURIComponent(domain)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { state: 'unknown', note: `被动 DNS 查询失败（${errors.join('，')}；HTTP ${res.status}）。` };
    const rows = (await res.json()) as unknown;
    if (!Array.isArray(rows)) return { state: 'unknown', note: '被动 DNS 返回了看不懂的东西，这一项没查成。' };
    const hosts = [...new Set(rows.map(h => String(h)).filter(h => h && !h.startsWith('*')))];
    if (!hosts.length) return { state: 'miss', note: '被动 DNS 里没有查到解析历史。' };
    return { state: 'hit', hosts: hosts.slice(0, 6), note: `被动 DNS 里有 ${hosts.length} 条解析历史。` };
  } catch {
    return { state: 'unknown', note: `被动 DNS 两个源都没连上（${errors.join('，')}），这一项没查成。` };
  }
}

/**
 * 域名注册局不管你以前干过什么，只要到期没人续，它就回到可注册状态。
 * 所以"能注册"和"干净"是两件事——这里查的就是这个差。
 *
 * 三条源证据强弱不同（见 ResidueSection），结论必须按最强的那条给：
 * 档案级证据命中就是铁证；只有当前 DNS 就是弱证据；三处全空也只能说"没查到"。
 */
export async function probeResidue(domain: string): Promise<ResidueSection> {
  const [a, ns, mx, cert, passive] = await Promise.all([
    dohQuery(domain, 'A'),
    dohQuery(domain, 'NS'),
    dohQuery(domain, 'MX'),
    probeCert(domain),
    probePassiveDns(domain),
  ]);

  const hasA = a.records.length > 0;
  const hasNs = ns.records.length > 0;
  const hasMx = mx.records.length > 0;
  const hasDns = hasA || hasNs || hasMx;
  const parked = detectParking(ns.records);
  const dnsUnknown = [a, ns, mx].some(x => x.state === 'unknown');

  const base = { a: a.records, ns: ns.records, mx: mx.records, cert, passive, parked };

  // ---- 档案级证据：命中就是铁证 ----
  const hardHits: string[] = [];
  if (cert.state === 'hit') {
    hardHits.push(`证书日志里留着它的签发记录（最近一次 ${cert.last ?? cert.first ?? '时间不明'}）`);
  }
  if (passive.state === 'hit') hardHits.push('被动 DNS 里留着它解析过的历史');

  if (hardHits.length) {
    const dnsBit = hasDns ? '当前 DNS 里也还配着解析。' : '当前 DNS 是空的，只看 DNS 会漏。';
    const parkBit = parked ? `它现在正挂在 ${parked} 的停放页上——有人在囤着等卖。` : '';
    return {
      ...base,
      state: 'traces',
      strength: 'hard',
      note: `${hardHits.join('，')}。${dnsBit}${parkBit}以前用过不等于有污点——有没有黑名单记录，看第 2 节的实查结果。`,
    };
  }

  // ---- 只有当前 DNS：弱证据，不能排除"囤着不解析" ----
  if (hasDns) {
    const bits: string[] = [];
    if (hasA) bits.push(`网站还指向 ${a.records.slice(0, 2).join('、')}`);
    if (hasNs) bits.push(`解析还托管在 ${ns.records.slice(0, 2).join('、')}`);
    if (hasMx) bits.push(`邮件还指向 ${mx.records.slice(0, 2).join('、')}`);
    const parkBit = parked ? `托管方 ${parked} 是域名停放商——有人在囤着等卖。` : '';
    return {
      ...base,
      state: 'traces',
      strength: 'weak',
      note: `DNS 里还留着记录：${bits.join('；')}。${parkBit}说明它以前有人在用、只是到期没人续掉出来的。以前用过不等于有污点，看第 2 节的实查结果。`,
    };
  }

  // ---- 三处全空，但有一项没查成：不许说干净 ----
  const unknownBits: string[] = [];
  if (dnsUnknown) unknownBits.push('当前 DNS');
  if (cert.state === 'unknown') unknownBits.push('证书日志');
  if (passive.state === 'unknown') unknownBits.push('被动 DNS');

  if (unknownBits.length) {
    return {
      ...base,
      state: 'unknown',
      strength: 'unknown',
      note: `已经查到的几处都没痕迹，但${unknownBits.join('、')}没查成——不能拿这个当"干净"。过一会儿重跑一次。`,
    };
  }

  // ---- 三处都查成、都没痕迹 ----
  return {
    ...base,
    state: 'clean',
    strength: 'none',
    note: 'DNS、证书日志、解析历史三处都没有痕迹。它也可能以前被人囤着但一路没建站——那种情况没有黑名单历史可继承，对你是好事。',
  };
}

// ---- 组装 ------------------------------------------------------------------

/** self = 客户自己十分钟能做完；us = 要人帮忙，这才是我们能接的活。 */
export interface NextStep {
  text: string;
  who: 'self' | 'us';
}

/**
 * 两个场景的答案完全不同，所以结论必须先分场景：
 * buy      = 这个域名还没人持有，回答"能不能买"
 * diagnose = 已经在用，回答"有没有问题"
 */
export interface Headline {
  scenario: 'buy' | 'diagnose';
  tone: 'ok' | 'warn' | 'bad';
  title: string;
  detail: string;
}

export interface DomainCheckResult extends Out {
  ok: boolean;
  domain: string;
  checkedAt: string;
  /** 纯标识，不参与任何判断。作用是让这份东西像凭证，而不是一张聊天截图。 */
  reportId: string;
  headline: Headline;
  email: EmailSection;
  google: GoogleSection;
  registration: RegistrationSection;
  next: NextStep[];
}

/** 报告编号：日期+时分+域名哈希，够短、可口头报、不用查库就能对上一份报告。 */
export function reportIdOf(domain: string, iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'PG-00000000-0000-0000';
  const p = (n: number) => String(n).padStart(2, '0');
  let h = 0x811c9dc5;
  for (const ch of domain) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const tail = h.toString(16).toUpperCase().padStart(8, '0').slice(0, 4);
  return `PG-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}-${tail}`;
}

/**
 * 结论只回答一句话：可以注册 / 不能注册；有问题 / 没发现问题。
 * 判断依据（DNS、证书、被动 DNS、SPF/DKIM）全部放在后面的段落里罗列，
 * 不许塞进结论——客户要的是"能不能"，不是推理过程。
 */
export function buildHeadline(email: EmailSection, google: GoogleSection, reg: RegistrationSection): Headline {
  // ---- 场景一：还没人持有，回答"能不能注册" ----
  if (reg.state === 'available') {
    const res = reg.residue;

    // 「被用过」是痕迹，「有黑历史」是污点——两件事。只有黑名单能拦人。
    const listChecks = email.checks.filter(c => c.key === 'dbl' || c.key === 'surbl');
    const listed = listChecks.filter(c => c.state === 'listed');
    const listUnknown = listChecks.filter(c => c.state === 'unknown');

    if (listed.length) {
      return {
        scenario: 'buy',
        tone: 'bad',
        title: '不能注册',
        detail: `可能有问题：${listed.map(c => c.label).join('、')} 里还留着它的记录，买下来也发不出信。注册商那能下单，但买了用不了。`,
      };
    }

    // 黑名单本身就是"能不能注册"的判据，它没查通，这一票不能投。
    if (listUnknown.length) {
      return {
        scenario: 'buy',
        tone: 'warn',
        title: '判断不了',
        detail: `黑名单这一项没查通（${listUnknown.map(c => c.label).join('、')}），判断不了它有没有黑历史。重跑一次再看。`,
      };
    }

    if (res?.state === 'traces') {
      const why: string[] = [];
      if (res.cert?.state === 'hit') why.push('证书日志');
      if (res.passive?.state === 'hit') why.push('解析历史');
      if (!why.length) why.push('DNS');
      return {
        scenario: 'buy',
        tone: 'warn',
        title: '可以注册',
        detail: `没查到黑名单记录，可以注册。但这名字以前被人用过（${why.join('、')}里留着记录）——用过不等于有问题，介意的话换个没人碰过的更省心。`,
      };
    }

    if (res?.state === 'unknown') {
      return {
        scenario: 'buy',
        tone: 'warn',
        title: '可以注册',
        detail: '没查到黑名单记录，可以注册。但它以前有没有被用过没查通——痕迹也可能早被清掉了，这一点不打包票。',
      };
    }

    return {
      scenario: 'buy',
      tone: 'ok',
      title: '可以注册',
      detail: '没发现问题：现在没人持有，也没查到黑历史。',
    };
  }

  // ---- 场景二：已经在用，回答"有没有问题" ----
  if (reg.state === 'unknown') {
    // 后缀根本没有 RDAP 接口，和"网络没查通"是两回事：前者重试一万次也没用。
    if ((reg.error ?? '').includes('没有公开的注册查询接口')) {
      const r = reg.residue;
      const inUse = Boolean(r && (r.a.length || r.ns.length || r.mx.length));
      if (inUse) {
        return {
          scenario: 'diagnose',
          tone: 'warn',
          title: '判断不了',
          detail: `${reg.error}，能不能注册只有注册商能回答。不过它的解析和邮箱都在跑，说明现在有人持有——想接手得先问报价。`,
        };
      }
      return {
        scenario: 'diagnose',
        tone: 'warn',
        title: '判断不了',
        detail: `${reg.error}，DNS 里也没有记录。能不能注册只能去注册商网站搜。`,
      };
    }
    return {
      scenario: 'diagnose',
      tone: 'warn',
      title: '判断不了',
      detail: `注册信息取不到（${reg.error ?? '未知原因'}），不知道这域名归谁。`,
    };
  }

  const hard: string[] = [];
  if (email.checks.some(c => c.state === 'listed')) hard.push('域名在黑名单里');
  if (google.siteReach.state === 'unreachable') hard.push('网站打不开');
  if (email.checks.some(c => c.key === 'spf' && c.state === 'invalid')) hard.push('SPF 放行了伪造邮件');

  // 站点没配 HTTPS 不是"打不开"，但访客会看到"不安全"、Google 也扣分，算小问题。
  const softMail = email.checks
    .filter(c => c.state === 'missing' || (c.state === 'invalid' && c.key !== 'spf'))
    .map(c => c.label);
  const softSite = google.siteReach.state === 'insecure';
  const soft = [...softMail, ...(softSite ? ['站点没配 HTTPS'] : [])];
  const unknown = email.checks.filter(c => c.state === 'unknown');

  if (hard.length) {
    return {
      scenario: 'diagnose',
      tone: 'bad',
      title: '有问题',
      detail: `${hard.join('、')}。大问题还是小问题、怎么修，往下看 02、04 段，一次改一处。`,
    };
  }
  if (soft.length) {
    const bits: string[] = [];
    if (softMail.length) bits.push(`${softMail.join('、')} 没配好`);
    if (softSite) bits.push('站点没配 HTTPS（访客浏览器会提示不安全）');
    return {
      scenario: 'diagnose',
      tone: 'warn',
      title: '有问题',
      detail: `小问题：${bits.join('；')}。不影响现在能不能用，但都会扣分，往下看具体是哪一段。`,
    };
  }
  if (unknown.length) {
    // 一项结果都没有才叫判断不了；只要查出过正常项，就按"没发现问题"给，
    // 没查成的项在下面逐条标「没查成」，绝不当成干净。
    const checked = email.checks.filter(c => c.state !== 'unknown');
    if (!checked.length) {
      return {
        scenario: 'diagnose',
        tone: 'warn',
        title: '判断不了',
        detail: `有 ${unknown.length} 项没查通，一项都没拿到结果，没法下判断。稍后重跑一次。`,
      };
    }
    return {
      scenario: 'diagnose',
      tone: 'ok',
      title: '没发现问题',
      detail: `查到的 ${checked.length} 项都正常。另有 ${unknown.length} 项没查通，下面标了「没查成」——那几项不算干净，过一会儿重跑一次就能补上。`,
    };
  }
  return {
    scenario: 'diagnose',
    tone: 'ok',
    title: '没发现问题',
    detail: '黑名单、邮件配置、网站都查了，没发现异常。',
  };
}

/** 每一条建议后面必须跟一个能动手的动作，所以按"谁来干"分开，别混成一串。 */
export function buildNext(email: EmailSection, google: GoogleSection, reg: RegistrationSection): NextStep[] {
  const out: NextStep[] = [];

  if (reg.state === 'available') {
    if (reg.residue?.state === 'traces') {
      out.push({
        who: 'self',
        text: '想更放心就换个没人碰过的名字；执意用这个，注册商一般给 3–5 天删除退款期，先问清',
      });
      out.push({ who: 'self', text: '注册后头两天发一封测试信验证——以前用过不等于发不出信，试一次就有答案' });
      out.push({ who: 'us', text: '想用这个域名、又怕它有历史包袱，我们可以先把它的历史痕迹过一遍再决定' });
    } else if (reg.residue?.state === 'unknown') {
      out.push({ who: 'self', text: '过一会儿重跑一次这个命令——刚才有几处没查通，没查通不等于干净' });
      out.push({ who: 'self', text: '注册时就把自动续费打开：域名过期被别人抢注，再买回来通常要几千块' });
    } else {
      out.push({ who: 'self', text: '注册时就把自动续费打开：域名过期被别人抢注，再买回来通常要几千块' });
      out.push({ who: 'self', text: '注册前把名字念给同事听一遍——太长或带连字符的域名，电话里报出来容易拼错' });
    }
    out.push({ who: 'us', text: '注册完把企业邮配好、再跑一次这个命令，才知道邮件到底发不发得出去' });
    out.push({ who: 'us', text: '域名、企业邮、CF、建站这一套不想自己折腾，我们可以一起配好' });
    return out;
  }

  // 查不到注册状态、DNS 又是空的，才值得让他去注册商搜一次；
  // 解析和邮箱都在跑就说明有人持有，这时候再叫他"去查能不能注册"是废话。
  const seemsUnused = !reg.residue || (!reg.residue.a.length && !reg.residue.ns.length && !reg.residue.mx.length);
  if (reg.state === 'unknown' && seemsUnused && (reg.error ?? '').includes('没有公开的注册查询接口')) {
    out.push({ who: 'self', text: `${reg.error}——去注册商网站搜一下这个域名，能不能注册只有他们能告诉你` });
  }

  const missing = email.checks.filter(c => c.state === 'missing' || (c.state === 'invalid' && c.key !== 'spf'));
  if (missing.length) {
    out.push({
      who: 'self',
      text: `补齐 ${missing.map(c => c.label).join(' / ')}：在域名解析后台加 TXT 记录，十分钟能生效`,
    });
  }
  if (email.checks.some(c => c.state === 'invalid' && c.key === 'spf')) {
    out.push({ who: 'self', text: 'SPF 里的 +all 必须改掉：它等于告诉全世界"谁都可以用我的域名发信"' });
  }
  if (email.checks.some(c => c.state === 'listed')) {
    out.push({ who: 'self', text: '先去 check.spamhaus.org 看被列入的原因，再申请移除；根因不除会反复被列' });
  }
  if (google.siteReach.state === 'insecure') {
    out.push({
      who: 'self',
      text: '给站点装一张 SSL 证书（主机商后台基本一键，很多还免费），装完把 http 强制跳 https',
    });
  } else if (google.siteReach.state !== 'ok') {
    out.push({ who: 'self', text: '先确认网站本身打得开（换网络、换设备各试一次），站不通的时候别的检测都没意义' });
  }
  out.push({ who: 'self', text: '自己点开 Safe Browsing 查询页看一眼，Google 的判定是实时的（链接在 02 段）' });
  out.push({
    who: 'us',
    text: '想把 Search Console 那边打通（要先验证网站所有权），或者站建好了却一直没询盘，这些是我们日常在做的活',
  });
  return out;
}

export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/^www\./, '');
  d = d.split('/')[0].split('?')[0].split('#')[0].split(':')[0];
  return d;
}

export function isValidDomain(d: string): boolean {
  return /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(d) && d.includes('.');
}

export async function cmdDomainCheck(ctx: CmdCtx): Promise<DomainCheckResult> {
  const raw = ctx.positional[0];
  if (!raw) {
    return {
      ok: false,
      code: 'usage',
      message: DOMAIN_USAGE,
      checkedAt: '',
      domain: '',
    } as unknown as DomainCheckResult;
  }
  const domain = normalizeDomain(raw);
  if (!isValidDomain(domain)) {
    return {
      ok: false,
      code: 'bad_domain',
      message: `这不是一个合法域名：${raw}`,
      checkedAt: '',
      domain,
    } as unknown as DomainCheckResult;
  }

  const [email, siteReach, registration] = await Promise.all([
    checkEmail(domain),
    checkSiteReach(domain),
    checkRegistration(domain),
  ]);

  // 域名还没注册 = 场景一（要买域名）。这时候该回答的不是"邮件配没配"，
  // 而是"能不能买"——对一个还没买的域名报缺 SPF/DKIM，客户会莫名其妙。
  //
  // 但"能注册"不等于"干净"：注册局不管历史，到期没人续就回到可注册状态，
  // 前主人的黑名单记录会跟着域名走。所以补一次 DNS 残留探测，
  // 有记录就说明它以前被用过，这时候黑名单那两项才有查的意义。
  let reach = siteReach;
  if (registration.state === 'available') {
    registration.residue = await probeResidue(domain);
    email.skipped = '域名还没注册，没有邮箱配置可查——这一项等注册完、邮箱配好之后再跑。';
    email.verdict = '域名还没注册，现在判断不了邮件发不发得出去。';
    reach = { state: 'unknown', detail: '域名还没注册，没有站点可查' };
  } else if (registration.state === 'unknown') {
    // 后缀查不到注册状态时（ccTLD 基本都没有 RDAP），改用 DNS 判断"它现在在不在用"。
    // 一条解析记录都没有，就去报"缺 SPF / 缺 DKIM"是荒谬的——没配邮箱，缺是必然的。
    registration.residue = await probeResidue(domain);
    const r = registration.residue;
    if (!r.a.length && !r.ns.length && !r.mx.length) {
      email.skipped = '这个域名现在没有任何解析记录，没有邮箱配置可查。';
      email.verdict = '域名没在解析，判断不了邮件发不发得出去。';
      reach = { state: 'unknown', detail: '域名没有解析记录，没有站点可查' };
    }
  }

  const google = googleSection(domain, reach);
  const checkedAt = new Date().toISOString();

  return {
    ok: true,
    domain,
    checkedAt,
    reportId: reportIdOf(domain, checkedAt),
    headline: buildHeadline(email, google, registration),
    email,
    google,
    registration,
    next: buildNext(email, google, registration),
  };
}

// ---- 人话渲染 ---------------------------------------------------------------

const ICON: Record<string, string> = {
  ok: '✅',
  clean: '✅',
  warn: '⚠️',
  missing: '❌',
  invalid: '❌',
  listed: '❌',
  unknown: '⚠️',
};

const ARCH_TEXT: Record<EmailSection['architecture'], string> = {
  'third-party': '第三方企业邮',
  'self-hosted': '主机自带邮件',
  null: '声明了不接收邮件（MX 是 0 .）',
  unknown: '判断不了（MX 没查到）',
};

/**
 * RDAP 的 status 是 EPP 状态码，客户看不懂 clientTransferProhibited。
 * 这里只做人话注解，原文留在括号里——不翻译的照原样输出，绝不猜。
 */
export const STATUS_TEXT: Record<string, string> = {
  active: '正常持有',
  ok: '正常',
  inactive: '未配置解析',
  clienttransferprohibited: '禁止转移',
  clientdeleteprohibited: '禁止删除',
  clientupdateprohibited: '禁止修改',
  clientrenewprohibited: '禁止续费',
  clienthold: '注册商暂停解析',
  serverhold: '注册局暂停解析',
  pendingdelete: '待删除',
  pendingtransfer: '转移中',
  redemptionperiod: '赎回期',
  autorenewperiod: '自动续费宽限期',
  addperiod: '新注册宽限期',
};

export function statusText(code: string): string {
  const t = STATUS_TEXT[code.toLowerCase()];
  return t ? `${t}（${code}）` : code;
}

/** 中文占两个字符宽，padEnd 按码点数补空格会错位。按显示宽度对齐。 */
function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    const wide =
      c >= 0x1100 &&
      (c <= 0x115f ||
        (c >= 0x2e80 && c <= 0xa4cf) ||
        (c >= 0xac00 && c <= 0xd7a3) ||
        (c >= 0xf900 && c <= 0xfaff) ||
        (c >= 0xfe30 && c <= 0xfe6f) ||
        (c >= 0xff00 && c <= 0xff60) ||
        (c >= 0xffe0 && c <= 0xffe6));
    w += wide ? 2 : 1;
  }
  return w;
}

const padDisplay = (s: string, width: number): string => s + ' '.repeat(Math.max(0, width - displayWidth(s)));

function stampOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(d)
    .replace(/\//g, '-');
}

const RULE = '  ' + '─'.repeat(60);

export function renderDomainCheck(r: DomainCheckResult): string {
  const L: string[] = [];
  const line = (s = ''): void => void L.push(s);
  const g = r.registration;
  const h = r.headline;

  // 两栏：左边告诉客户哪些不用找人，右边才是我们能接的活
  const renderNext = (no: string): void => {
    const self = r.next.filter(s => s.who === 'self');
    const us = r.next.filter(s => s.who === 'us');
    line();
    line(`【${no} 接下来做什么】`);
    if (self.length) {
      line();
      line('  你自己十分钟能搞定');
      self.forEach((s, i) => line(`    ${i + 1}. ${s.text}`));
    }
    if (us.length) {
      line();
      line('  要人帮忙的（这些是我们日常在做的）');
      us.forEach((s, i) => line(`    ${i + 1}. ${s.text}`));
    }
  };

  line();
  line(`  ${r.domain}`);
  line(`  ${r.reportId} · 检测于 ${stampOf(r.checkedAt)}`);
  line(RULE);

  // 结论永远放最前面。客户不会读完三十行再自己归纳。
  line();
  line(`【结论】${h.title}`);
  line(`  ${h.detail}`);

  if (g.state === 'available') {
    // ---- 场景一：还没人持有，按"能不能注册"组织 ----
    const res = g.residue;
    const hasDnsRecords = Boolean(res && (res.a.length || res.ns.length || res.mx.length));
    line();
    line('【1 能不能注册】');
    line(
      `  持有状态    ${
        res?.state === 'traces'
          ? '现在没人持有 → 能注册（以前被用过，看第 2 节有没有污点）'
          : res?.state === 'clean'
            ? '现在没人持有 → 能注册'
            : '现在没人持有，历史有一项没查通'
      }`,
    );
    const dnsBit = hasDnsRecords
      ? `还留着记录（A ${res!.a.length} / NS ${res!.ns.length} / MX ${res!.mx.length}）`
      : '现在是空的';
    line(`  当前 DNS    ${hasDnsRecords ? '⚠️ ' : '·  '} ${dnsBit}`);
    if (res?.cert) {
      const mark = res.cert.state === 'hit' ? '⚠️ ' : res.cert.state === 'miss' ? '✅ ' : '⚠️ ';
      line(`  证书日志    ${mark} ${res.cert.note}`);
    }
    if (res?.passive) {
      const mark = res.passive.state === 'hit' ? '⚠️ ' : res.passive.state === 'miss' ? '✅ ' : '⚠️ ';
      line(`  被动 DNS    ${mark} ${res.passive.note}`);
      if (res.passive.hosts?.length) line(`              ${res.passive.hosts.slice(0, 4).join('、')}`);
    }
    if (res?.parked) line(`  停放痕迹    ⚠️  正挂在 ${res.parked} 的停放页上，有人在囤着等卖`);
    if (res) {
      const verdict =
        res.strength === 'hard'
          ? '⚠️  用过'
          : res.strength === 'weak'
            ? '⚠️  用过（只有 DNS 证据）'
            : res.strength === 'none'
              ? '✅  三处都没痕迹'
              : '⚠️  有项没查成';
      line(`  判定        ${verdict}`);
      line(`              ${res.note}`);
    }

    line();
    line('【2 有没有历史污点】');
    if (res?.state === 'traces') line('  以前被用过不等于有污点，这一节才是判据：');
    for (const c of r.email.checks.filter(c => c.key === 'dbl' || c.key === 'surbl')) {
      line(`  ${padDisplay(c.label, 20)} ${ICON[c.state] ?? '·'} ${c.detail}`);
    }
    line('  以前被罚过  ⚠️  查不到：只有原站主的 Search Console 能看');
    line('  以前做什么  ⚠️  查不到：不存在这种名单');

    line();
    line('【3 注册之后】');
    line('  邮件        配好企业邮再跑一次这个命令，才知道邮件发不发得出去');
    line('  Google      站建起来之后再看，现在没有站可拦（提早查是空转）');
    line('  注册商      挑一家能改 DNS 的，SPF/DKIM/DMARC 都要在这里加');

    renderNext('4');
  } else {
    // ---- 场景二：已经在用，按"你担心的是什么"组织 ----
    line();
    line('  ' + (h.scenario === 'diagnose' ? '你在担心的通常是这三件事，逐条给结果：' : ''));

    line();
    line('【1 邮件能不能送到别人手上】');
    if (r.email.skipped) {
      line(`  ${r.email.skipped}`);
      line(`  结论        ${r.email.verdict}`);
    } else {
      if (r.email.architecture === 'third-party') {
        line(`  邮箱托管    ${r.email.provider}`);
        line('              发信 IP 是服务商的，不是你独占的——IP 黑名单查了也没用，这项跳过');
      } else if (r.email.architecture === 'self-hosted') {
        line(`  邮箱托管    主机自带邮件（${r.email.mx.join(', ')}）`);
        line('              发信 IP 是你自己的，所以要连 IP 一起查');
      } else {
        line(`  邮箱托管    ${ARCH_TEXT[r.email.architecture]}`);
      }
      for (const c of r.email.checks) {
        line(`  ${padDisplay(c.label, 20)} ${ICON[c.state] ?? '·'} ${c.detail}`);
        if (c.fix && c.state !== 'ok' && c.state !== 'clean') line(`  ${' '.repeat(20)}   → ${c.fix}`);
      }
      for (const ip of r.email.ipChecks ?? []) {
        line(`  发信 IP ${ip.ip.padEnd(14)} ${ICON[ip.state] ?? '·'} ${ip.note}`);
      }
      line(`  结论        ${r.email.verdict}`);
    }

    line();
    line('【2 会不会被 Google 拦】');
    line('  打开会不会弹警告');
    line(`      ${r.google.safeBrowsing.url}`);
    line('      Google 自己的判定最准，点开看到的就是实时的。第三方转述都可能过时，所以这一项我不给结论。');
    line('  有没有被搜索处罚');
    line(`      ${r.google.searchConsole.url}`);
    line('      只有站主本人能看，而且要先验证网站所有权。第三方永远看不到，这是 Google 的设计。');
    line(`  站点现在能不能打开  ${r.google.siteReach.detail}`);

    line();
    line('【3 这个域名什么来路】');
    if (g.state === 'registered') {
      line('  注册情况    已经被持有，注册不了 —— 想接手这个域名的话，下面这些信息才是判断依据');
      line(`  注册        ${g.created ?? '—'}${g.ageDays !== undefined ? `（${g.ageDays} 天）` : ''}`);
      line(`  到期        ${g.expires ?? '—'}${g.registrar ? `  ·  注册商 ${g.registrar}` : ''}`);
      if (g.changed) line(`  最近变更    ${g.changed}`);
      if (g.status?.length) line(`  域名状态    ${g.status.map(statusText).join(', ')}`);
      line(`  判断        ${g.kindNote ?? '—'}`);
      line(`  以前是谁的  查不到 —— ${g.ownerNote}`);
    } else {
      line(`  查不了      ${g.error ?? '未知原因'}`);
      line('  以前是谁的  查不到');
    }

    // 下一步分两栏：能自己做的别浪费客户时间，做不了的才是我们的活
    renderNext('4');
  }

  line();
  line(RULE);
  line('本次查了什么');
  line('  RDAP 注册信息 · Spamhaus DBL / SURBL 域名名单 · SPF / DKIM / DMARC（DoH）· 站点可达性');
  if (g.state === 'available') {
    line('  历史痕迹三处：当前 DNS（A / NS / MX）· 证书透明度日志 · 被动 DNS');
  }
  line('没查什么');
  line('  IP 黑名单（邮箱托管在第三方，IP 不归你，查了也换不了）· Google 搜索处罚（无公开接口）');
  line(
    g.state === 'available'
      ? '  历史 WHOIS（付费库）· 网页快照（archive.org 在国内不可达，已用证书和被动 DNS 替代）'
      : '  历史 WHOIS 与网页快照（隐私保护 / 数据源在国内不可达）',
  );
  line('  查不到的项已单独标注，没有按"干净"处理。');
  line();
  line('  免费的域名体检，由 PufferGo 提供 —— https://puffergo.com');
  line();

  return L.join('\n');
}
