import type { DomainCheckResult } from './domainCmd';
import { statusText } from './domainCmd';

/**
 * 域名体检报告（单文件 HTML）。
 *
 * 为什么要有这个：文本版在终端里读没问题，但客户是外贸老板，他看的是手机和微信。
 * 一份能直接发过去、点开就能看的网页，比让他在聊天窗口里读三十行等宽字强得多。
 *
 * 硬约束：
 * - 单文件、零外链（不发一个请求），离线也能打开，能直接当附件发
 * - 不做评分、不做进度条。三项检查本来就不可加总，凑一个分数就是编
 * - "查不了"必须显式画出来，不能因为不好看就省掉
 */

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]!);

type Tone = 'ok' | 'bad' | 'warn';

const STATE_MAP: Record<string, { tone: Tone; text: string }> = {
  ok: { tone: 'ok', text: '通过' },
  clean: { tone: 'ok', text: '干净' },
  missing: { tone: 'bad', text: '缺失' },
  invalid: { tone: 'bad', text: '有问题' },
  listed: { tone: 'bad', text: '命中' },
  unknown: { tone: 'warn', text: '没查成' },
  // 历史痕迹专用的两态：查到痕迹 / 查通了但没记录。别和"命中黑名单"混用。
  hit: { tone: 'warn', text: '有痕迹' },
  miss: { tone: 'ok', text: '无记录' },
  // 跟 unknown 分开：这一项不是我们没查通，是根本不存在可查的接口 —— 别让客户以为换个网络就能查到
  cannot: { tone: 'warn', text: '查不到' },
  unreachable: { tone: 'bad', text: '打不开' },
  redirected: { tone: 'warn', text: '有跳转' },
  insecure: { tone: 'warn', text: '没配 HTTPS' },
};

const ICONS: Record<Tone, string> = {
  ok: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.6l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bad: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.6 4.6l6.8 6.8M11.4 4.6l-6.8 6.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  warn: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.2v5.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="8" cy="12.2" r="1.05" fill="currentColor"/></svg>',
};

const ARCH_LABEL: Record<string, string> = {
  'third-party': '第三方企业邮',
  'self-hosted': '主机自带邮件',
  null: '本域不收信',
  unknown: '无法判断',
};

/**
 * RDAP 的 status 是 EPP 状态码，客户看不懂 "clientTransferProhibited"。
 * 这里只做人话注解，原文留在括号里——不翻译的照原样输出，绝不猜。
 * 文本版故意保留状态码原文：那是给 AI 读的，原始值更准。
 */
function pill(state: string): string {
  const s = STATE_MAP[state] ?? { tone: 'warn' as Tone, text: state };
  return `<span class="pill ${s.tone}">${ICONS[s.tone]}<b>${esc(s.text)}</b></span>`;
}

function checkRow(label: string, state: string, detail: string, fix?: string): string {
  const s = STATE_MAP[state] ?? { tone: 'warn' as Tone, text: state };
  return `<div class="row">
      <div class="row-label">${esc(label)}</div>
      <div class="row-body">
        <div class="row-head">${pill(state)}<span class="row-text">${esc(detail)}</span></div>
        ${fix ? `<div class="row-fix"><span>怎么改</span>${esc(fix)}</div>` : ''}
      </div>
    </div>`;
}

function kv(k: string, v: string, dim = false): string {
  return `<div class="kv"><dt>${esc(k)}</dt><dd${dim ? ' class="dim"' : ''}>${esc(v || '—')}</dd></div>`;
}

function linkCard(title: string, url: string, note: string): string {
  return `<a class="linkcard" href="${esc(url)}" target="_blank" rel="noopener">
      <div class="linkcard-main">
        <div class="linkcard-title">${esc(title)}</div>
        <div class="linkcard-note">${esc(note)}</div>
        <div class="linkcard-url">${esc(url)}</div>
      </div>
      <svg class="arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 15L15 5M8.4 5H15v6.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </a>`;
}

export function renderDomainCheckHtml(r: DomainCheckResult): string {
  const built = new Date(r.checkedAt);
  const stamp = Number.isNaN(built.getTime())
    ? r.checkedAt
    : new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
        .format(built)
        .replace(/\//g, '-');

  const e = r.email;
  const h = r.headline;
  const unregistered = r.registration.state === 'available';
  const listed = e.checks.some(c => c.state === 'listed');
  const gaps = e.checks.filter(c => c.state === 'missing' || c.state === 'invalid');

  // 顶部状态标签：只用事实，不做加权。未注册时第一条永远是黑名单（判据），
  // 痕迹只能当第二条提示——否则"可以注册"旁边挂个红标，客户以为结论是错的。
  const residue = r.registration.residue;
  const listUnknown = e.checks.some(c => (c.key === 'dbl' || c.key === 'surbl') && c.state === 'unknown');
  const chips: Array<{ tone: Tone; text: string }> = [];
  if (unregistered) {
    if (listed) chips.push({ tone: 'bad', text: '黑名单已命中' });
    else if (listUnknown) chips.push({ tone: 'warn', text: '黑名单没查通' });
    else chips.push({ tone: 'ok', text: '黑名单干净' });

    if (residue?.state === 'traces') chips.push({ tone: 'warn', text: '以前被人用过' });
    else if (residue?.state === 'unknown') chips.push({ tone: 'warn', text: '历史有几项没查通' });
  } else {
    if (e.skipped) chips.push({ tone: 'warn', text: '邮箱配置未查' });
    else if (listed) chips.push({ tone: 'bad', text: '邮件黑名单已命中' });
    else chips.push({ tone: 'ok', text: '邮件黑名单干净' });
    if (!e.skipped) {
      chips.push(
        gaps.length ? { tone: 'bad', text: `邮件身份缺 ${gaps.length} 项` } : { tone: 'ok', text: '邮件身份齐全' },
      );
    }
    const reach = r.google.siteReach.state;
    chips.push(
      reach === 'ok'
        ? { tone: 'ok', text: '站点可访问' }
        : reach === 'redirected'
          ? { tone: 'warn', text: '站点有跳转' }
          : reach === 'insecure'
            ? { tone: 'warn', text: '站点没配 HTTPS' }
            : reach === 'unknown'
              ? { tone: 'warn', text: '站点未检测' }
              : { tone: 'bad', text: '站点打不开' },
    );
  }

  const emailBlock = e.skipped
    ? `<div class="note warn">${esc(e.skipped)}</div>`
    : `
      <div class="arch">
        <div class="arch-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.8 6.6L12 12.4l8.2-5.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div>
          <div class="arch-title">${
            e.architecture === 'unknown'
              ? '没有 MX 记录，邮件不走这个域名'
              : e.architecture === 'null'
                ? '这个域名声明了不收信（MX 记 0 .）'
                : `邮箱托管在 <b>${esc(e.provider)}</b>（${esc(ARCH_LABEL[e.architecture] ?? e.architecture)}）`
          }</div>
          <div class="arch-sub">${
            e.architecture === 'third-party'
              ? '发信 IP 归服务商，不是你独占的 —— IP 黑名单查了也做不了什么，这一项我们主动跳过，下面只查属于你的东西。'
              : e.architecture === 'self-hosted'
                ? '发信 IP 是你自己的（多半是共享主机），邻居出事会连累你，所以要连 IP 一起查。'
                : e.architecture === 'null'
                  ? '空 MX（RFC 7505）的意思是「本域本来就不接信」。没有发信 IP 可查，域名级名单和 DNS 配置仍然照查。'
                  : '没有发信 IP 可查，但域名级名单和 DNS 配置照样能查——下面这几项都属于你的域名本身。'
          }</div>
        </div>
      </div>
      <div class="rows">
        ${e.checks.map(c => checkRow(c.label, c.state, c.detail, c.fix)).join('')}
        ${(e.ipChecks ?? [])
          .map(
            c =>
              `<div class="row"><div class="row-label">IP ${esc(c.ip)}</div><div class="row-body"><div class="row-head">${pill(c.state)}<span class="row-text">${esc(c.note)}</span></div></div></div>`,
          )
          .join('')}
      </div>
      <div class="verdict">
        <div class="verdict-label">结论</div>
        <p>${esc(e.verdict)}</p>
      </div>`;

  const reg = r.registration;

  // ---- 场景一：还没人注册，报告回答"能不能买"，不回答"邮件配没配" ----
  // 黑名单是"不能注册"的唯一判据，所以永远列出实查结果，不能写"不需要查"——
  // 结论说没黑历史，却不肯给查询结果，客户第一反应就是你在猜。
  const mailRows = r.email.checks
    .filter(c => c.key === 'dbl' || c.key === 'surbl')
    .map(c => checkRow(c.label, c.state, c.detail, c.fix))
    .join('');

  // 三处证据强度不同：DNS 是配置、随手能清；证书和被动 DNS 是别人的账本，抹不掉。
  const hasDnsRecords = Boolean(residue && (residue.a.length || residue.ns.length || residue.mx.length));
  const dnsDetail = hasDnsRecords
    ? `还留着记录：A ${residue!.a.join('、') || '无'}；NS ${residue!.ns.join('、') || '无'}；MX ${residue!.mx.join('、') || '无'}`
    : 'A、NS、MX 都没有记录';
  const traceRows = residue
    ? [
        checkRow('当前 DNS（弱证据）', hasDnsRecords ? 'hit' : 'miss', dnsDetail),
        residue.cert ? checkRow('证书日志（强证据）', residue.cert.state, residue.cert.note) : '',
        residue.passive ? checkRow('被动 DNS（强证据）', residue.passive.state, residue.passive.note) : '',
        residue.parked ? checkRow('停放 / 挂牌', 'hit', `正挂在 ${residue.parked} 的停放页上 —— 有人在囤着等卖`) : '',
      ].join('')
    : '';

  // 用函数延迟求值：它依赖下面才算出来的 nextBlock，直接拼会踩 TDZ。
  const buySections = (): string => `
    <section>
      <div class="sec-head">
        <div class="sec-no">01</div>
        <div>
          <h2 class="sec-title">能不能注册</h2>
          <p class="sec-sub">只要没人持有就能注册。能不能用，看 02 段的黑名单——有没有被前主人用过，是另一件事。</p>
        </div>
      </div>
      <div class="bigstate ${residue?.state === 'clean' ? 'ok' : 'warn'}">
        <div class="bigstate-title">${
          residue?.state === 'traces'
            ? '以前被人用过'
            : residue?.state === 'clean'
              ? '没人用过，是干净的'
              : '历史有几项没查成'
        }</div>
        <div class="bigstate-sub">${esc(residue?.note ?? '')}</div>
      </div>
      <div class="rows" style="margin-top:16px">${traceRows}</div>
      <div class="note warn" style="margin-top:14px">
        下面三处按可信度排：DNS 只是配置，换了人就能清空；证书和解析历史是别人记的账，删不掉。
      </div>
    </section>

    <section>
      <div class="sec-head">
        <div class="sec-no">02</div>
        <div>
          <h2 class="sec-title">有没有历史污点</h2>
          <p class="sec-sub">能查的和查不到的都写清楚 —— 不拿查得到的那部分冒充当全查过了。</p>
        </div>
      </div>
      <div class="rows">
        ${mailRows}
        ${checkRow('Google 搜索处罚', 'cannot', '只有原站主的 Search Console 能看，第三方没有接口 —— 这一项谁都查不到')}
        ${checkRow('历史行业（成人 / 博彩）', 'cannot', '不存在这种名单。没有机构登记过，只能靠网页快照推断')}
        ${checkRow('网页历史快照', 'cannot', 'archive.org 在国内网络连不上。替代办法是查证书和被动 DNS（见 01 段），有站就一定会留痕')}
      </div>
    </section>

    <section>
      <div class="sec-head">
        <div class="sec-no">03</div>
        <div>
          <h2 class="sec-title">注册之后</h2>
          <p class="sec-sub">这几项现在还查不了 —— 域名还没到手，查了也是空转。</p>
        </div>
      </div>
      <dl class="kvs">
        ${kv('邮件能不能发', '配好企业邮后重跑一次这个命令，才知道发不发得出去')}
        ${kv('会不会被 Google 拦', '站建起来之后再看，现在没有站可拦')}
      </dl>
      <div class="note info">
        注册商要挑一家能改 DNS 的：SPF、DKIM、DMARC 都是 DNS 记录，全都要在解析后台加。
      </div>
    </section>

    <section>
      <div class="sec-head">
        <div class="sec-no">04</div>
        <div>
          <h2 class="sec-title">接下来做什么</h2>
          <p class="sec-sub">左边这些你自己十分钟能做完，不用找人；右边这些才是需要人帮忙的。</p>
        </div>
      </div>
      ${nextBlock}
    </section>`;

  // ---- 场景二：已经在用，按"你担心的是什么"组织 ----
  // 用函数延迟求值：它依赖下面才算出来的 regBlock / nextBlock，直接拼会踩 TDZ。
  const diagSections = (): string => `
    <section>
      <div class="sec-head">
        <div class="sec-no">01</div>
        <div>
          <h2 class="sec-title">邮件能不能送到别人手上</h2>
          <p class="sec-sub">发不进去只有三个原因：域名在黑名单、IP 在黑名单、邮件身份没配好。前两个查名单，第三个查 DNS。</p>
        </div>
      </div>
      ${emailBlock}
    </section>

    <section>
      <div class="sec-head">
        <div class="sec-no">02</div>
        <div>
          <h2 class="sec-title">会不会被 Google 拦</h2>
          <p class="sec-sub">这一项我们不给判断，只给官方入口 —— 因为第三方拿不到可靠数据，说了就是编。</p>
        </div>
      </div>
      ${linkCard('Safe Browsing 查询页', r.google.safeBrowsing.url, r.google.safeBrowsing.note)}
      ${linkCard('Search Console 后台', r.google.searchConsole.url, r.google.searchConsole.note)}
      <div class="rows" style="margin-top:14px">
        ${checkRow('站点能不能开', r.google.siteReach.state, r.google.siteReach.detail)}
      </div>
      <div class="note warn" style="margin-top:14px">${esc(r.google.caveat)}</div>
    </section>

    <section>
      <div class="sec-head">
        <div class="sec-no">03</div>
        <div>
          <h2 class="sec-title">这个域名什么来路</h2>
          <p class="sec-sub">已经在用就要知道：它什么时候注册的、有没有转过手、还能用多久。</p>
        </div>
      </div>
      <div class="note ${reg.state === 'registered' ? 'info' : 'warn'}" style="margin-bottom:14px">${
        reg.state === 'registered'
          ? '已经被持有，注册不了 —— 想接手这个域名的话，下面这些才是判断依据。'
          : '查不到注册状态，不能断言它已经被持有 —— 下面只列能查到的东西，别把"查不到"当成"没人要"。'
      }</div>
      ${regBlock}
      <div class="note warn" style="margin-top:14px">以前是谁的：查不到 —— ${esc(reg.ownerNote)}</div>
    </section>

    <section>
      <div class="sec-head">
        <div class="sec-no">04</div>
        <div>
          <h2 class="sec-title">接下来做什么</h2>
          <p class="sec-sub">左边这些你自己十分钟能做完，不用找人；右边这些才是需要人帮忙的。</p>
        </div>
      </div>
      ${nextBlock}
    </section>`;

  const regBlock =
    reg.state === 'registered'
      ? `<dl class="kvs">
            ${kv('注册时间', reg.created ?? '')}
            ${kv('到期时间', reg.expires ?? '')}
            ${kv('注册商', reg.registrar ?? '')}
            ${kv('最近变更', reg.changed ?? '')}
            ${kv('域名状态', (reg.status ?? []).map(statusText).join(' · '))}
          </dl>
          <div class="note info">${esc(reg.kindNote ?? '')}</div>`
      : `<div class="note warn">注册信息取不到：${esc(reg.error ?? '未知原因')}</div>`;

  // 分两栏：左边告诉客户我们自己不赚这个钱，右边才是我们能接的活
  const nextSelf = r.next.filter(s => s.who === 'self');
  const nextUs = r.next.filter(s => s.who === 'us');
  const nextBlock = `<div class="twocol">
    <div class="col">
      <div class="col-head">你自己十分钟能搞定</div>
      <div class="col-sub">这些不用找人，也不用花钱</div>
      <ol>${nextSelf.map(s => `<li>${esc(s.text)}</li>`).join('')}</ol>
    </div>
    <div class="col ours">
      <div class="col-head">要人帮忙的</div>
      <div class="col-sub">这些是我们日常在做的活</div>
      <ol>${nextUs.map(s => `<li>${esc(s.text)}</li>`).join('')}</ol>
    </div>
  </div>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>域名体检报告 · ${esc(r.domain)}</title>
<style>
  :root {
    --ink: #0c1a2b;
    --ink-2: #33475f;
    --muted: #6b7f96;
    --line: #e3e9f1;
    --bg: #f4f7fb;
    --brand: #0ea5e9;
    --brand-deep: #0369a1;
    --ok: #0f9d70;
    --ok-bg: #e8f7f1;
    --bad: #d93a3a;
    --bad-bg: #fdeded;
    --warn: #b06f06;
    --warn-bg: #fdf3e2;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    background:
      radial-gradient(1100px 420px at 12% -8%, #e2f2fd 0%, rgba(226,242,253,0) 62%),
      radial-gradient(900px 400px at 100% 0%, #eef4ff 0%, rgba(238,244,255,0) 55%),
      var(--bg);
    color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", sans-serif;
    font-size: 15px;
    line-height: 1.72;
    -webkit-font-smoothing: antialiased;
    padding: 40px 20px 64px;
  }
  .sheet { max-width: 900px; margin: 0 auto; }

  /* 顶部 */
  .hero {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 18px 18px 0 0;
    border-bottom: none;
    padding: 30px 38px 26px;
    position: relative;
    overflow: hidden;
  }
  .hero::before {
    content: "";
    position: absolute; inset: 0 0 auto 0; height: 4px;
    background: linear-gradient(90deg, var(--brand) 0%, #38bdf8 42%, var(--brand-deep) 100%);
  }
  .hero-top { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .brandline { display: flex; align-items: center; gap: 9px; color: var(--brand-deep); font-size: 12.5px; font-weight: 650; letter-spacing: .06em; }
  .brandline svg { width: 20px; height: 20px; }
  .stamp { color: var(--muted); font-size: 12.5px; font-variant-numeric: tabular-nums; }
  h1 {
    margin: 18px 0 6px;
    font-size: 34px;
    line-height: 1.24;
    letter-spacing: -.02em;
    font-weight: 700;
    word-break: break-all;
  }
  .lede { margin: 0; color: var(--muted); font-size: 14px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
  .chip {
    display: inline-flex; align-items: center; gap: 6px;
    border-radius: 999px; padding: 5px 13px;
    font-size: 12.5px; font-weight: 600; border: 1px solid;
  }
  .chip svg { width: 13px; height: 13px; }
  .chip.ok { color: var(--ok); background: var(--ok-bg); border-color: #bfe9d8; }
  .chip.bad { color: var(--bad); background: var(--bad-bg); border-color: #f6cdcd; }
  .chip.warn { color: var(--warn); background: var(--warn-bg); border-color: #f3ddb7; }

  /* 结论条：客户不会读完三屏再自己归纳，答案必须在第一屏 */
  .verdictbar { margin-top: 20px; border-radius: 14px; padding: 17px 19px; border: 1px solid; }
  .verdictbar.ok { background: var(--ok-bg); border-color: #bfe9d8; }
  .verdictbar.warn { background: var(--warn-bg); border-color: #f3ddb7; }
  .verdictbar.bad { background: var(--bad-bg); border-color: #f6cdcd; }
  .vb-label { font-size: 10.5px; font-weight: 700; letter-spacing: .14em; margin-bottom: 5px; }
  .verdictbar.ok .vb-label { color: var(--ok); }
  .verdictbar.warn .vb-label { color: var(--warn); }
  .verdictbar.bad .vb-label { color: var(--bad); }
  .vb-title { font-size: 21px; font-weight: 700; line-height: 1.36; color: var(--ink); letter-spacing: -.01em; }
  .vb-detail { margin: 7px 0 0; font-size: 13.5px; color: var(--ink-2); line-height: 1.72; }

  /* 主体 */
  .body {
    background: #fff;
    border: 1px solid var(--line);
    border-top: none;
    padding: 4px 38px 8px;
  }
  section { padding: 30px 0; border-top: 1px solid #eef2f7; }
  section:first-of-type { border-top: 1px solid var(--line); }
  .sec-head { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 18px; }
  .sec-no {
    flex: 0 0 auto; width: 34px; height: 34px; border-radius: 10px;
    background: linear-gradient(160deg, #e6f5fe, #f2f9ff);
    border: 1px solid #cfe8f8;
    color: var(--brand-deep);
    font-size: 13px; font-weight: 700; letter-spacing: .02em;
    display: flex; align-items: center; justify-content: center;
    font-variant-numeric: tabular-nums;
  }
  .sec-title { margin: 0; font-size: 18.5px; font-weight: 700; letter-spacing: -.01em; line-height: 1.5; }
  .sec-sub { margin: 3px 0 0; color: var(--muted); font-size: 13px; }

  /* 架构说明 */
  .arch {
    display: flex; gap: 13px; align-items: flex-start;
    background: #f7fbff; border: 1px solid #dceaf7; border-radius: 12px;
    padding: 15px 17px; margin-bottom: 18px;
  }
  .arch-icon { flex: 0 0 auto; width: 34px; height: 34px; border-radius: 9px; background: #fff; border: 1px solid #d9e8f5; color: var(--brand-deep); display: flex; align-items: center; justify-content: center; }
  .arch-icon svg { width: 19px; height: 19px; }
  .arch-title { font-size: 14.5px; font-weight: 620; }
  .arch-sub { color: var(--ink-2); font-size: 13px; margin-top: 4px; line-height: 1.65; }

  /* 检查行 */
  .rows { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  .row { display: grid; grid-template-columns: 152px 1fr; gap: 4px 16px; padding: 13px 16px; }
  .row + .row { border-top: 1px solid #eff3f8; }
  .row:nth-child(odd) { background: #fcfdff; }
  .row-label { font-size: 13.5px; font-weight: 650; color: var(--ink-2); padding-top: 1px; }
  .row-head { display: flex; gap: 10px; align-items: flex-start; }
  .row-text { font-size: 13.5px; color: var(--ink-2); }
  .row-fix {
    margin-top: 8px; font-size: 12.5px; color: var(--ink-2);
    background: #fbfcfe; border-left: 2px solid var(--brand);
    border-radius: 0 6px 6px 0; padding: 6px 10px;
  }
  .row-fix span { color: var(--brand-deep); font-weight: 650; margin-right: 8px; }

  .pill {
    flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px;
    border-radius: 6px; padding: 2px 7px; font-size: 12px; font-weight: 650; border: 1px solid;
  }
  .pill svg { width: 12px; height: 12px; }
  .pill b { font-weight: 650; }
  .pill.ok { color: var(--ok); background: var(--ok-bg); border-color: #c8ecdd; }
  .pill.bad { color: var(--bad); background: var(--bad-bg); border-color: #f7d4d4; }
  .pill.warn { color: var(--warn); background: var(--warn-bg); border-color: #f4e0c0; }

  .verdict {
    margin-top: 16px; border-radius: 12px; padding: 15px 17px;
    background: linear-gradient(180deg, #f8fbff, #f4f9ff);
    border: 1px solid #dbe9f7;
  }
  .verdict-label { font-size: 11.5px; font-weight: 700; letter-spacing: .12em; color: var(--brand-deep); margin-bottom: 5px; }
  .verdict p { margin: 0; font-size: 14.5px; font-weight: 550; color: var(--ink); line-height: 1.72; }

  /* 链接卡 */
  .note { border-radius: 10px; padding: 12px 15px; font-size: 13px; line-height: 1.68; }
  .note.warn { background: var(--warn-bg); border: 1px solid #f3ddb7; color: #7a4e05; }
  .note.info { background: #f7fbff; border: 1px solid #dceaf7; color: var(--ink-2); margin-top: 16px; }
  .linkcard {
    display: flex; align-items: center; gap: 14px; justify-content: space-between;
    text-decoration: none; color: inherit;
    border: 1px solid var(--line); border-radius: 12px; padding: 14px 17px;
    background: #fff; transition: border-color .16s, box-shadow .16s, transform .16s;
  }
  .linkcard + .linkcard { margin-top: 10px; }
  .linkcard:hover { border-color: #b9dcf5; box-shadow: 0 6px 18px -10px rgba(3,105,161,.35); transform: translateY(-1px); }
  .linkcard-title { font-size: 14.5px; font-weight: 650; }
  .linkcard-note { font-size: 12.5px; color: var(--ink-2); margin-top: 3px; }
  .linkcard-url { font-size: 11.5px; color: var(--muted); margin-top: 6px; word-break: break-all; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .arrow { flex: 0 0 auto; width: 18px; height: 18px; color: var(--brand); }

  /* 键值 */
  .kvs { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; margin: 0; background: var(--line); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  .kv { background: #fff; padding: 12px 16px; }
  /* 奇数项时最后一格横跨两列，否则右半边会露出网格线的灰色，像少填了一格 */
  .kv:last-child:nth-child(odd) { grid-column: 1 / -1; }
  .kv dt { font-size: 12px; color: var(--muted); margin-bottom: 3px; }
  .kv dd { margin: 0; font-size: 13.5px; font-weight: 600; color: var(--ink); word-break: break-word; }
  .kv dd.dim { font-weight: 500; color: var(--ink-2); }

  .bigstate { border-radius: 12px; padding: 18px 20px; border: 1px solid; }
  .bigstate.ok { background: var(--ok-bg); border-color: #c8ecdd; }
  .bigstate.warn { background: var(--warn-bg); border-color: #f3ddb7; }
  .bigstate-title { font-size: 15.5px; font-weight: 650; color: var(--ink); }
  .bigstate-sub { font-size: 13px; color: var(--ink-2); margin-top: 5px; }

  /* 下一步 */
  .todo { list-style: none; margin: 0; padding: 0; counter-reset: t; }
  .todo li { counter-increment: t; display: flex; gap: 12px; padding: 11px 0; font-size: 14px; color: var(--ink-2); }
  .todo li + li { border-top: 1px dashed var(--line); }
  .todo li::before {
    content: counter(t); flex: 0 0 auto; width: 22px; height: 22px; border-radius: 7px;
    background: #f1f7fd; border: 1px solid #d9e8f5; color: var(--brand-deep);
    font-size: 11.5px; font-weight: 700; display: flex; align-items: center; justify-content: center;
    margin-top: 2px;
  }

  /* 下一步分两栏：能自己做的别浪费客户时间，做不了的才是我们能接的活 */
  .twocol { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .col { border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; background: #fff; }
  .col.ours { background: #f7fbff; border-color: #dceaf7; }
  .col-head { font-size: 13px; font-weight: 700; color: var(--ink-2); }
  .col.ours .col-head { color: var(--brand-deep); }
  .col-sub { font-size: 12px; color: var(--muted); margin: 3px 0 9px; line-height: 1.6; }
  .col ol { margin: 0; padding-left: 17px; }
  .col li { font-size: 13px; color: var(--ink-2); line-height: 1.66; padding: 5px 0; }

  /* 方法脚注：客户拿报告去问任何人，这些数据源都经得起核 */
  .method { margin-top: 6px; padding-top: 18px; border-top: 1px solid #eef2f7; font-size: 12px; color: var(--muted); line-height: 1.78; }
  .method div + div { margin-top: 7px; }
  .method b { color: var(--ink-2); font-weight: 650; }

  /* 页脚 */
  .foot {
    background: linear-gradient(140deg, #0c2338 0%, #10375a 58%, #0b4f74 100%);
    border-radius: 0 0 18px 18px;
    padding: 24px 38px 26px;
    color: #cfe4f4;
    display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap;
  }
  .foot-brand { font-size: 14.5px; font-weight: 650; color: #fff; letter-spacing: .01em; }
  .foot-sub { font-size: 12.5px; margin-top: 4px; color: #a8c7de; max-width: 470px; line-height: 1.65; }
  .foot-cta {
    text-decoration: none; color: #062338; background: #7dd3fc; font-weight: 700; font-size: 13px;
    padding: 10px 18px; border-radius: 10px; white-space: nowrap;
  }

  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

  @media (max-width: 680px) {
    body { padding: 18px 12px 40px; font-size: 14px; }
    .hero, .body, .foot { padding-left: 20px; padding-right: 20px; border-radius: 0; }
    .hero { border-radius: 14px 14px 0 0; }
    .foot { border-radius: 0 0 14px 14px; }
    h1 { font-size: 25px; }
    .row { grid-template-columns: 1fr; gap: 6px; }
    .row-label { font-size: 12.5px; color: var(--muted); }
    .kvs { grid-template-columns: 1fr; }
    .twocol { grid-template-columns: 1fr; }
    .vb-title { font-size: 18.5px; }
    .foot { flex-direction: column; align-items: flex-start; }
  }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { max-width: none; }
    section { break-inside: avoid; }
    .linkcard:hover { transform: none; box-shadow: none; }
  }
</style>
</head>
<body>
<div class="sheet">

  <header class="hero">
    <div class="hero-top">
      <div class="brandline">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="13" r="6.4" fill="none" stroke="currentColor" stroke-width="1.7"/>
          <path d="M12 6.6V3.2M9.4 9.6l-3.1-2.4M14.6 9.6l3.1-2.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <circle cx="9.9" cy="12.6" r="1" fill="currentColor"/>
          <circle cx="14.1" cy="12.6" r="1" fill="currentColor"/>
          <path d="M6.2 16.2c-1.6 1.3-2.4 2.9-2.4 4.6 1.7 0 3.2-.7 4.4-2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
        PUFFERGO · 域名体检
      </div>
      <div class="stamp">${esc(r.reportId)} · ${esc(stamp)}</div>
    </div>
    <h1>${esc(r.domain)}</h1>
    <p class="lede">${
      unregistered
        ? '买之前的体检：这个域名能不能注册、有没有被前主人留下的污点。'
        : '只查三件事：邮件能不能送到、站会不会被 Google 拦、这个域名是什么来路。'
    }</p>
    <div class="verdictbar ${h.tone}">
      <div class="vb-label">结论</div>
      <div class="vb-title">${esc(h.title)}</div>
      <p class="vb-detail">${esc(h.detail)}</p>
    </div>
    <div class="chips">
      ${chips.map(c => `<span class="chip ${c.tone}">${ICONS[c.tone]}${esc(c.text)}</span>`).join('')}
    </div>
  </header>

  <div class="body">

    ${unregistered ? buySections() : diagSections()}

    <div class="method">
      <div><b>本次查了什么</b>　RDAP 注册信息 · 当前 DNS（A / NS / MX）· 证书透明度日志（crt.sh / Cert Spotter）· 被动 DNS 历史（HackerTarget / subdomain.center）· Spamhaus DBL / SURBL 域名名单 · SPF / DKIM / DMARC（DoH）· 站点可达性（https，不通再试 http）</div>
      <div><b>没查什么</b>　IP 黑名单（邮箱托管在第三方，IP 不归你，查了也换不了）· Google 搜索处罚（无公开接口）· 历史 WHOIS（付费库）· 网页快照（archive.org 在国内不可达，已用证书和被动 DNS 替代）</div>
      <div>查不到的项已逐条标注，没有按「干净」处理。三处历史痕迹都不保证覆盖全量：早年只有 HTTP 的站没有证书记录，痕迹也会随时间被清掉。</div>
    </div>

  </div>

  <footer class="foot">
    <div>
      <div class="foot-brand">PufferGo · 外贸独立站</div>
      <div class="foot-sub">这份体检免费，随便查。我们做的是外贸独立站和 Google SEO —— 域名、企业邮、建站、上线、引流。查出来的问题，自己能改的自己改；改不动的，找我们。</div>
    </div>
    <a class="foot-cta" href="https://puffergo.com" target="_blank" rel="noopener">puffergo.com</a>
  </footer>

</div>
</body>
</html>
`;
}
