# 实战验证记录（2026-11-17）

这份记录来自一整天的端到端实测，目的是让「聊天 + 浏览器简单授权 → AI 全自动建站上线」这个形态可复现。所有接口名、参数、报错都是实跑验证过的，不是推测。给 AI 用：照着做能少踩坑。

## 已经跑通的两条链路

### 链路 A：给已有免费子域站点挂自定义子域（pgtest）

场景：客户域名 `amoluodg.com` 的 NS 已在 Cloudflare，但父域/`www` 老站占着另一个 Hostinger 账号，不能动。要用子域 `pgtest.amoluodg.com` 并行测新站。

- 新站是已有的免费子域 `varied-olivedrab-fox-79.hostingersite.com`。
- Cloudflare 加 `pgtest` 的 CNAME 指向免费子域，proxied。
- **裸 CNAME 不够**：HTTP 200，但返回的是 Hostinger 的 parked 页（title `Parked Domain name on Hostinger DNS system`）。原因是 CNAME 只改 DNS 指向，不改回源 Host 头。
- CF 免费版的 Origin Rule 改 Host Header 提示 **Enterprise only**，走不通。
- 解法是 Cloudflare Worker 反代：service worker 语法（`addEventListener("fetch", ...)`）里把 `url.hostname` 改成免费子域、删掉 `host` 头、`redirect:"manual"`，再绑 Workers → Domains → Route（`pgtest.amoluodg.com/*`）。ES module 语法（`export default`）在 Code Mode 的 FormData 上传会报错，别用。
- 验收：`https://pgtest.amoluodg.com/puffergo-e2e-check/` 返回真 WP 页面；`puffergo pages create` → `pages publish` → `pages find` 全通。
- 遗留：响应 HTML / canonical / Link 仍指向免费子域（约 26 处），要做生产得改写这些或改 WP 的 `siteurl`。
- `workers.dev` 预览地址在本机网络 `ERR_CONNECTION_CLOSED`（Clash 直连），**不能当验收标准**，必须用自定义域名 route 验。

### 链路 B：从零建新站 + 挂自定义子域（e2e-new）

场景：完全新站，最终通过 `e2e-new.amoluodg.com` 打开。

1. Hostinger `POST /api/hosting/v1/domains/free-subdomains`（空 body）→ 拿合法免费子域 `boreal-firebrick-camel-36.hostingersite.com`。**不能自己编 domain**（报 `not reserved`），也不能省略 domain（报 required）。
2. `POST /api/hosting/v1/websites` 带 `{domain, order_id}` 建站。
3. `POST /api/hosting/v1/accounts/{username}/wordpress/installations` 装 WP，body 带 `site_title` + `credentials{email,login,password}`。顶层 `/wordpress/installations` 只支持 GET，POST 必须带 `accounts/{username}`。异步，等约 20s 后 `GET /wordpress/installations` 见 `is_valid:true` 才算装好。
4. PufferGo 链路：`puffergo login <url>` → 浏览器开 authorizeUrl → WP 登录 → 点「是，核准此连接」→ `puffergo login status --wait 15`（**`--wait` 要带秒数、不带 `--site`**）返 approved → `site setup` 缺插件 → `site setup install --customer-said "..."` 装 PufferGo(schema6) + RankMath → `pages create` / `pages publish` → 页面 200。
5. Cloudflare 接入：裸 CNAME 同样返回 parked 页，仍需 Worker 反代（同链路 A）。route `e2e-new.amoluodg.com/*`。
6. 验收：`https://e2e-new.amoluodg.com/e2e-full-chain/` HTTP 200，title 对、正文命中、parked 残留 0。
7. 全程没动 `amoluodg.com` / `www` 记录（复测仍 301），只加了一条子域 CNAME + 一条 Worker route。测试 TXT 和临时 WP 密码文件都已删。

**重要边界**：这两条链路里的 Worker 反代 / 改 Host 头是针对「父域绑在另一个 Hostinger 账号」的兜底。用户已拍板**这种情况不在本技能业务范围**——标准场景是域名完全掌控在当前账号或 Cloudflare。上面的 Worker 方案是形态验证的实证，不是给客户的标准交付。遇到跨账号归属问题按 SKILL 阶段 0 只提醒，不要套用。

## 关键接口速查（Hostinger，Code Mode `execute` 的 operation 名）

| 目的 | operation / 端点 | 要点 |
|---|---|---|
| 列站点 | `hosting_websites_list` | 返回 domain / vhost_type / username / order_id / website_type |
| 生成合法免费子域 | `POST /api/hosting/v1/domains/free-subdomains` | 空 body；不能自编域名 |
| 建站 | `POST /api/hosting/v1/websites` | `{domain, order_id}` |
| 装 WP | `POST /api/hosting/v1/accounts/{username}/wordpress/installations` | 异步，轮询 `is_valid` |
| 下单 | `POST /api/billing/v1/orders` | 默认付款方式；3DS 会停在 `awaiting_payment` |
| 一次建站装 WP | `POST /api/hosting/v1/orders/{order_id}/onboardings` | type=wordpress + domain；标准路径，domain 不带 `www.`、最多一级子域 |

## 2026-11-17 深夜复测：域名 / 主机 / 付款方式（全程只读，未下单）

### 两个 MCP 的 Code Mode 参数不一样，别混

| MCP | `search` 参数 | `execute` 参数 |
|---|---|---|
| Cloudflare | `{ code }` —— JS 异步箭头函数，函数里能访问注入的 `spec.paths` | `{ code, account_id? }` —— JS 里用 `cloudflare.request({ method, path, query, body })` |
| Hostinger | `{ query, limit? }` —— 关键词 | `{ operation, params }` —— search 返回的真实操作名 + 参数对象 |

参数名传错报 `Invalid input: expected string, received undefined`。给 Cloudflare 的 `search` 传 `{query}` 就是这样错的。

### Cloudflare Registrar 全套可用（23 个端点，含转入）

| 用途 | 端点 |
|---|---|
| 查可用性 + 价格 | `POST /accounts/{id}/registrar/domain-check`（body `{domains:[...]}`，一次最多 20 个） |
| 搜索 | `GET /accounts/{id}/registrar/domain-search` |
| 转入资格检查 | `POST /accounts/{id}/registrar/domain-transfer-check` |
| 注册 | `POST /accounts/{id}/registrar/registrations` |
| 转入 | `POST /accounts/{id}/registrar/registrations/{domain}/transfer-in` |
| 已注册列表 / 状态 | `GET .../registrations`、`GET .../registrations/{domain}/registration-status` |

实测 `domain-check` 返回（2026-11-17，未注册域名）：

```json
{ "name": "example.com", "registrable": true, "tier": "standard",
  "pricing": { "currency": "USD", "registration_cost": "11.17", "renewal_cost": "11.17" } }
```

→ 报价可以给真实数字：`.com` 注册价 = 续费价 = 11.17 美元/年。同批 `.net` 为 11.86。

**硬前置（客户必须自己做）**：注册请求不传 `contacts` 时用账号的默认地址簿条目；官方原文「Dashboard settings currently provide the only way to manage address book entries」，地址簿和注册协议只能在 `https://dash.cloudflare.com/{account_id}/domains/registrations` 配。两者都没有，请求直接校验失败。付款同样走账号默认付款方式。**所以新账号第一次买域名，客户必须先去 dashboard 配一次，AI 绕不过。**

### Hostinger 真实 `item_id` 与价格

`billing_catalog_list` 传 `{category:"HOSTING"}` → 9 个条目，`item_id` 形如 `hostingercom-hosting-premium-usd-1y`。Premium Web Hosting（2026-11-17 实测，价格单位是**分**）：

| 周期 | item_id | 首期 | 续费 |
|---|---|---|---|
| 月付 | `hostingercom-hosting-premium-usd-1m` | $12.99/月 | — |
| 1 年 | `hostingercom-hosting-premium-usd-1y` | $23.88 | $131.88/年 |
| 2 年 | `hostingercom-hosting-premium-usd-2y` | $47.76 | $131.88/年 |
| 4 年 | `hostingercom-hosting-premium-usd-4y` | $95.52 | $131.88/年 |

`prices[]` 里 `first_period_price` 是首期实付、`price` 是全期总价，报价两个都要说（客户最容易误会"首年 = 以后每年"）。

当前推荐卖的 Unlimited Web Hosting（`hostingercom-hosting-unlimited`）：1 年 $33.48 首期 / $203.88 续费，4 年 $133.92 / $407.76（即 $2.79/月，续费 $16.99/月）。**这是不带推荐价的目录价**，客户实际该看到的是 $2.23/月，见下节。

**旧 SKILL.md 里的 `hosting_premium_12m` 是编的，照它下单会失败**，已改成「从 catalog 原样取」。

### 推荐价来自链接，不是结账页填码（2026-11-18 客户真机截图确证）

`https://www.hostinger.com/pricing?REFERRALCODE=puffergo` 打开即生效，页面上直接出现绿色 `Referral code applied`：

| | Unlimited 月价 | Today you pay（48 个月） | 绿色标识 |
|---|---|---|---|
| 带 REFERRALCODE | **$2.23**（原价 $18.99 划掉） | **$107.04** | 有 |
| 不带 | $2.79 | $133.92 | 没有 |

差 **$26.88**。续费都是 $16.99/月，跟首期价无关。

- **别再用 `?coupon=` 这条路。** 之前实测 `?coupon=PUFFERGO` / `?coupon=pgodev` / 不带参数，价格完全一样；真正起作用的是 `?REFERRALCODE=`（30 天 cookie）。
- **价格对不上时按顺序让客户试**：重开链接 → 换浏览器/无痕 → 换 Hostinger 账号。**「账号以前买过就拿不到新客价」是推断，未实测**——但这是最可能的第三种原因，所以排在最后再试，试完仍不对就让客户截图，不要自己下结论说码失效。
- 结账页的 `Have a coupon code?`（`button.link-button`，点开是 `Enter a coupon code to apply.` + `Apply`）保留现状：存在，但不是主路径，不要再教客户手填。
- 结账页默认周期就是**最长档 48 months**，客户不主动改就按 4 年付款。
- 税费原文：`Estimated VAT: 0%. Final amount will be calculated after you provide your billing address.`——**税在填完账单地址后才定**。香港不征 VAT/GST，中国大陆对数字服务征 6%。
- 付款方式实测列出 `AliPay+ China` 与 `AliPay+ Hong Kong`；Hostinger 官方 ToS 写明按「下单时账号里填的国家」计税。
- 结账页首屏要 30 秒以上才渲染，中途是骨架屏。抓取以「出现 Total」为信号，别用固定短超时。

### 付款方式：AI 只能查，不能加

`billing_payment-methods_list` 实测返回：

```json
{ "id": 45805290, "name": "AliPay+", "identifier": "AliPay+",
  "payment_method": "alipay_cn", "is_default": true, "expires_at": "2026-11-17T15:56:59Z" }
```

- 支付宝在接口里的类型是 `alipay_cn`；`expires_at` 会到期，到期后要让客户回 hPanel 重新授权。
- 操作描述原文：「If you want to add new payment method, please use hPanel」（`https://hpanel.hostinger.com/billing/payment-methods`）。`billing_payment-methods_*` 只有 list / delete / set-default，**加不了**。

### 结论：客户必须亲自做的 6 件事（其余全自动）

1. 登录 / 注册 Cloudflare、Hostinger 账号
2. 在两个账号里各绑一次付款方式（都在网页，AI 进不去）
3. 说出他要的域名（或让 AI 出候选后挑一个）
4. 说「买」
5. 付款验证（银行验证码 / 支付宝授权过期重确认）
6. WordPress 后台点一次「批准」

AI 全自动的部分：查域名可用性与价格、注册域名、转入域名、买主机、开站装 WP、加 DNS、装 PufferGo、写页面产品。

## PufferGo 账号连接（读源码 + 实测跳转，2026-11-18）

**这条链路是我们自己的，别把它写成比第三方授权更麻烦。** 事实来自两个仓：

- 插件前端 `src/admin/dashboard/App.jsx`：`onConnectPufferGoAccount` 先 1px 探测 puffergo.com 可达性（`probeUrl`，5s 超时），通不过就显示 VPN 排查卡；通过则 `goToConnect()` 拼 `connectUrl?source=wordpress&domain=<hostname>&name=<siteName>&callback=<当前后台 URL>` 整页跳转。
- 官网 `/dashboard/connect` 路由（Next.js App Router）：校验 `source/domain/callback`，展示「来源 / 网站 / 当前账户」三项，**只有一个主按钮「授权并连接」**。点击后 `POST /api/api-keys`（`name: WordPress - <domain>`，一 Key 一域）→ 302 回 `callback?api_key=…&status=success&connect_source=puffer_dashboard`。取消则回 `callback?status=cancelled`。
- 回跳后插件前端识别 `status=success && connect_source=puffer_dashboard`，调 `puffergo_verify_key` 写入 `puffergo_api_key`，并清掉 URL 上的敏感参数。**客户全程不接触密钥。**

登录态处理（实测未登录访问 connect 页）：

```
→ https://puffergo.com/dashboard/login?redirect=%2Fdashboard%2Fconnect%3Fsource%3Dwordpress%26domain%3D…
```

`(main)/layout.tsx` 的 `AuthRedirect` 把完整 query 塞进 `redirect`；同时 connect 页自己把参数写进 `sessionStorage('puffergo_pending_connect')`，参数丢了会用 `location.replace` 补回。**结论：先登录不会丢连接意图，不必让客户先单独打开 puffergo.com 注册。**

注册成本：`/dashboard/register` 三步——邮箱 → 6 位验证码（邮件）→ 姓名 + 密码；登录页另有「使用邮箱验证码登录」，不用记密码。

**所以客户侧是「点 Connect now → （首次）注册或登录 → 点授权并连接」，两次点击 + 一次注册。** 别再写「去 dashboard 复制 API Key 粘回后台」——那条路存在（api-keys 页能手动建），但对客户是多余的。

## 浏览器自动化踩坑（CDP）

- 非前台 tab 的 CDP 点击**静默失效**：先 `tab_focus` 置前，再点。
- Monaco 编辑器里 `dom_cua_type` 会因自动缩进把代码打乱；要贴代码用 API 直接部署，别在 Monaco 里敲。
- OAuth 同意页常有两步（选 scope → Continue → Authorize），别点一次就以为完了。
- 超长 `login_challenge` URL 白屏：刷新一次通常就好了。

## 产品形态结论（为什么做成这样）

- 插件包不能一套通吃所有 AI 平台。可复用的是「内容层」：`SKILL.md` + `scripts/puffergo.mjs` + 官方 MCP 端点。
- 主推 WorkBuddy 专家包（支持 `dependencies.mcpServers` + 连接引导卡）；Codex / Qwen Code 用 Agent Plugins v1（`plugin.json` + `mcp.json` + `SKILL.md`）；豆包用 Skill ZIP + 连接器引导。
- 零 MCP 的 `puffergo login` 始终是兜底——任何平台只要能跑脚本就能用。
- 本技能的源码衔接点：`packages/silo-cli/scripts/bundle.mjs` 的 SKILLS 数组、`scripts/oss/sync-ai-agent.mjs` 的循环数组，两者都要含 `puffergo-wordpress-deploy`；`sync-ai-agent.mjs` 用 `copyTree(skills)` 整目录复制，`references/` 下的文件会随发布带出，无需改脚本。
