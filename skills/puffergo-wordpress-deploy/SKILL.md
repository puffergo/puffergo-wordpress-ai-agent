---
name: puffergo-wordpress-deploy
description: >-
  把客户的 WordPress 站点从零建起来并挂上域名：买域名、买主机、开站点、装 WordPress、
  装 PufferGo 插件、配 DNS 与 SSL，站能打开之后交给内容技能写页面。
  面向不懂技术的用户，他说得很模糊时也要接住：「我想做个网站」「帮我搞个官网」
  「我要卖货到国外」「公司要个网站」「我买了域名不知道怎么弄」。
  Use when the user says 建站 / 帮我把站搭起来 / 装 WordPress / 绑域名 / 域名解析 /
  网站打不开 / 买主机 / 买域名 / 部署 / deploy my site / connect my domain /
  point my domain to my site / my domain is not working / 403 Forbidden。
  这台电脑上没有站点、或者站点还没上线时用它；已经有站只想改内容，用 puffergo-wordpress-content。
  Hostinger 与 Cloudflare 的操作走 MCP 工具，WordPress 侧走脚本自带的 puffergo 命令。
---

# 建站与上线

你负责把客户从「我想做个网站」带到「网站能打开、PufferGo 插件已装好、有人能替他改内容」。他手上可能什么都没有，也可能域名主机都齐了——先看再动。内容写得好不好不是这一步的事，写完页面是 content 技能的事。

**目标用户是不懂技术的人。** 整条链路里他们只做 7 件事，剩下的全是你的活：

| 客户只做 | 什么时候 | 为什么你替不了 |
|---|---|---|
| 登录 / 注册（Hostinger、Cloudflare） | 第一次连接服务时，浏览器里点一下授权 | 账号密码只有他有 |
| 输入他要的域名 | 阶段 0 你问的时候 | — |
| **买主机、扫码付款** | 阶段 1 | 账单国家、新付款方式、扫码只有结账页能做 |
| 说一句「买」（域名） | 你报完价之后，付款前 | 花钱必须他点头 |
| 在银行 App / hPanel 确认付款 | 订单卡在 `awaiting_payment`，或支付宝授权过期时 | 验证码和支付密码在你手上没有 |
| **在后台点 Connect now 连 PufferGo 账号** | 阶段 4，插件装好后 | 要他的 puffergo.com 账号 |
| 在 WordPress 后台点一次「批准」 | 你调 `puffergo login` 授权应用密码时 | 应用密码只能站主本人批准 |

**域名那边最容易漏绑卡。** 新的 Cloudflare 账号第一次买域名必须先在 dashboard 绑付款方式、填联系人地址，接口改不了。阶段 0 查完账号就顺手看一眼有没有付款方式，没有就先给链接让他绑，绑卡期间你去准备域名候选，两边并行。

客户不懂 DNS、不懂 vhost、不懂 API。任何一步都不要把他们带到后台去填表、写代码、配记录——那是你的工作。真需要他们动浏览器，只给一个链接 + 一句「点这里，允许一下」。

## 开工前：把能力备齐

按顺序确认，缺哪个就先补哪个，**别等走到一半才发现没工具**：

1. **Hostinger MCP**（开站 / 装 WP / DNS / 装插件）：首次调用会打开浏览器走 OAuth，客户点「允许」即可。主机付款不走它，见阶段 1。
2. **Cloudflare MCP**（DNS / SSL）：域名 NS 在 Cloudflare 时需要。
3. **puffergo 脚本**：本技能自带的 `scripts/puffergo.mjs`，WordPress 侧全走它。

**两个 MCP 都是 Code Mode**：对外只暴露 `search` / `execute`（Cloudflare 另有 `docs` / `whoami`，Hostinger 另有 `multi-execute`），没有「添加 DNS 记录」这种现成工具。正确姿势是先 `search` 找操作名，再 `execute` 传 `operation` + `params` 调。看到工具列表只有三四个不要以为没连上。

如果客户环境里这两个 MCP 还没连：**一次性**告诉他「我需要连接 Hostinger 和 Cloudflare，等下浏览器会各弹一次授权，点允许就行」，然后引导他连。不要让他自己去搜连接器名字、也不要让他填 JSON。客户连好之前不要开始建站。

**授权页上的按钮你自己点，别甩给客户**——客户不懂 Continue / Authorize 这些词，还容易点到出错的回调页。需要客户本人的只有：登录账号密码、付款确认、WordPress 后台批准；其余授权动作 AI 代劳。token 过期也不用重新授权，下次调用会自动刷新。完整的 OAuth 流程、代点步骤、`Invalid Request` 报错根因，见 `references/oauth-and-authorization.md`——连接卡住时先读它。

每个 MCP 的端点、授权方式、以及「哪个阶段用哪个工具」的对照，见 `references/mcp-capabilities.md`——开工前读一遍，照着调，别猜工具名。

## 这条链路谁干什么

| 环节 | 谁做 | 说明 |
|---|---|---|
| 买域名 | Cloudflare Registrar | **不在 Hostinger 买**，Hostinger 域名贵且和主机账号绑死 |
| 买主机 | 客户本人在 Hostinger 结账页 | 账单国家、新付款方式只有页面能填；你给带推荐码的定价页链接 + 四句话 |
| 开站点 + 装 WordPress | Hostinger MCP | **一次调用同时做**（`onboardings`），不要分两步 |
| DNS + SSL | Cloudflare MCP | 域名 NS 不在 Cloudflare 的，先问客户要不要迁 |
| 装 PufferGo 插件 | Hostinger MCP（WordPress 组） | 装完用一键登录链接，不要向客户要密码 |
| 写页面 / 产品 | `puffergo` 脚本 | 本技能只负责到「站能打开 + 插件已激活」 |

**客户第一次开口、还说不清要干什么时，先给他 `GETTING-STARTED.md`。** 那份文档第一段就是一句可以直接复制给你发过来的开场话，后面每一步都写了对话长什么样、他要怎么答。他照抄着说，比你现编问题清单有效得多。你自己也照着那条线走，别漏站、别跳步。

## 铁律

1. **花钱之前先报价**。域名和主机付款前，把「买什么、多少钱、几年」说清楚，**等客户说「买」**才动手。域名注册不可退款。报价后必须补一句「价格随汇率和活动变动，具体以官网结账页为准」——catalog 和定价页的数字是当天实价，不是承诺价，别让客户以为这个月都是这个钱。
2. **域名只在 Cloudflare 买**。Hostinger 的域名贵，且跨账号会带来一堆归属校验问题。
3. **不碰客户已有的站点**。客户说「老的还在用」，那就只在新站点/新域名上操作；要改老站解析，先问。
4. **写之前先读**。每个写操作前先查现状（是否已存在、是否已装、是否已绑），保证重跑不会重复建。
5. **失败要说人话**。把接口原始报错翻译成「发生了什么 + 你现在可以选哪两条路」，不要只说「失败了请重试」——客户不知道怎么重试。

## 阶段 0：先读，不改

**客户的第一句话几乎都是模糊的**——「我想做个网站」「帮我搞个官网」，没范围、没下一步，而且他不会主动补充。**不要甩问题清单反问他**（他答不上来），开场就按这三步走：

1. 先接住：「我先看看你手上有什么，再告诉你下一步。」然后跑下面三个只读查询。
2. 把结果翻译成一句人话：「你有 Hostinger 账号和一台主机，域名还没买。」
3. **只给一个下一步动作**：「现在只差一个域名，我帮你想几个，你挑一个我去报价。」

一次只给一个动作。不要一次列出五个步骤让他自己排期——他不会排，只会卡住。

先跑这三个只读查询，把现状念给客户听，再决定走哪条路：

- 域名：注册商是谁、NS 指向哪里（Cloudflare 还是别家）
- Hostinger：有哪些 order、哪些 website、哪个套餐还能建站
- 目标域名：是否已经被某个站点占用

输出一张三行的表：域名 / 主机 / 站点现状，然后问一句「按这个继续吗」。客户没意见就往下走。

**这些查询全部是只读的。** 阶段 0 不许出现任何写操作。

**边界检查（重要）**：如果目标域名或它的主域绑定在**另一个 Hostinger 账号**名下（典型报错：`422 Hosting:9999 This domain isn't owned by this Hostinger account`），**停止自动处理**。这不在本技能的范围内，不要试图用 CNAME、Worker 反代、改 Host 头之类的办法绕过——那些是给懂技术的人兜底用的，客户接不住。告诉客户：「这个域名绑在另一个账号上，当前账号没法直接用它建站。你可以换个域名，或者把域名挪到当前账号，需要的话跟 AI 助手继续聊，让它帮你处理。」然后停在这里等客户决定。

## 阶段 1：主机

客户已经有可用套餐就跳过，直接拿 `order_id`。

**新客户首购，让他自己在网页买，不要走接口下单。** 账单国家（决定加不加税）和新付款方式只有结账页能填。给他这个链接，一打开就是带优惠价的定价页：

```
https://www.hostinger.com/pricing?REFERRALCODE=puffergo
```

**优惠是链接带进去的，不是让客户填码。** 这个 `REFERRALCODE=puffergo` 就是我们给的推荐码，命中后页面自己出现绿色 `Referral code applied`；结账页没有「填优惠码」这一步，也别教客户去填 `PUFFERGO`（`?coupon=` 实测无效）。**必须让他从这条链接直接进、一路走到付款**——自己搜「Hostinger」进官网、或中途从别的地方再进一次，优惠就丢了（推荐码靠 30 天 cookie）。链接别转述、别改写、别只给域名。

**判据看价格，不看客户说「应该行了」：**

| | Unlimited 月价 | Today you pay（48 个月） | 绿色 `Referral code applied` |
|---|---|---|---|
| 优惠生效 | **$2.23** | **$107.04** | 有 |
| 没生效（贵 27 美元） | $2.79 | $133.92 | 没有 |

没生效按顺序让他试，别让他自己一项项排查：**重开链接 → 换浏览器或无痕窗口 → 换 Hostinger 账号**（优惠只算没买过的新账号）。三样都试完还是 $2.79，再让他截图给你看。

配这四句话，一条一句，别堆成一段：

1. 点**中间那张 Unlimited** 的 **Choose plan**（不是左边 Premium，也不是右边 Cloud）
2. **Period 保持 48 months**：一次付 107.04 美元用 4 年，平均 2.23 美元/月
3. **Country 选 Hong Kong**——香港没有增值税，价格就是最终价；选中国大陆会再加税
4. 付款方式选 **AliPay+**，扫码

**优惠是链接带进来的，不是结账页填码。** 网址上加 `?coupon=` 实测无效（带与不带价格完全一样），结账页那个 `Have a coupon code?` 也不是主路径——客户从链接进、看到绿色 `Referral code applied` 就够了，别再教他手填码。

付完先 `billing_subscriptions_list` 确认订阅进来了（刚付完就有，含套餐名和周期），再 `hosting_orders_list` 拿 `order_id`。订单要等开通后才出现在 hosting 列表里，刚付款查不到是正常的，别当成没买成功、更不要让他再付一次。

**只有客户已有账号、已绑卡、并且明确说「你帮我买」时才走接口：**

1. `billing_catalog_list`（`category: HOSTING`）拿**真实 `item_id` 和价格**。`item_id` 长得像 `hostingercom-hosting-premium-usd-1y`，**必须从返回里原样取**，不要自己拼（`hosting_premium_12m` 这种是错的，下单会失败）。同一条目有月付/1年/2年/4年多个 `prices`，用 `first_period_price` 报价、`price` 说明续费。
2. `billing_payment-methods_list` 确认有可用付款方式。`payment_method` 是 `alipay_cn` 就说明绑的是支付宝。
3. **报价给客户，等明确同意**
4. `POST /api/billing/v1/orders`
   ```json
   { "items": [{ "item_id": "<catalog 里的 item_id>", "quantity": 1 }], "coupons": ["PUFFERGO"] }
   ```
   `coupons` 字段是接口支持的，但**它和链接带来的推荐价是否同一档没验证过**——走接口下单前，用 `billing_catalog_list` 的价格跟客户确认，别承诺 $2.23。不传 `payment_method_id` 就用默认付款方式。**税费按账号里已有的账单国家算，接口改不了**——要免税得让他先去 hPanel 改账单地址。
5. 订单可能立刻 `completed`，也可能返回 202 表示付款在异步处理。`awaiting_payment` / `payment_initiated` 都说明卡在银行验证（信用卡 3DS 常见），**这时候要让客户去 hPanel 或银行 App 确认，不要重复下单**。
6. `GET /api/hosting/v1/orders` 拿到 `order_id`。

下单接口只负责下单，**不负责开通**。开通在下一步。

**付款方式 AI 加不了。** `billing_payment-methods_*` 只能查、只能删、只能设默认；官方明确「要加新的付款方式请去 hPanel」（`https://hpanel.hostinger.com/billing/payment-methods`）。客户没绑卡时不要「下单失败再重试」，直接把 hPanel 链接给他，说一句「在这里绑一下支付宝，绑完告诉我」。支付宝授权会过期（实测 `expires_at` 只给约 12 小时），到期同样让他回 hPanel 重新授权。

## 阶段 2：开站点 + 装 WordPress（一次调用）

```
POST /api/hosting/v1/orders/{order_id}/onboardings
{
  "type": "wordpress",
  "domain": "example.com",
  "wordpress": { "email": "...", "login": "...", "password": "...", "language": "zh_CN" }
}
```

几个必须记住的约束：

- `domain` **不能以 `www.` 开头**，**最多一级子域**（`shop.example.com` 可以，`a.b.example.com` 不行）
- 不传 `domain` 会用一个临时的免费子域（`xxx.hostingersite.com`），可以先用它把站跑起来，最后再挂正式域名
- 站是异步开的：轮询 `GET /api/hosting/v1/onboardings?domain=` ，**等到 `status: completed` 才算好**。`running` 期间调站点相关接口会返回 404/409，不是出错
- 管理员密码由你生成并写进调用里，所以**后面所有 WordPress 操作你都不需要再向客户要密码**

这一步做完，`https://<domain>` 或免费子域就应该能打开 WordPress 了。先自己访问一次确认，再往下走。

**实测差异**：`onboardings` 是官方的标准路径，但如果 `domain` 归属触发校验错误，改用已验证可行的分步路径——`POST /api/hosting/v1/domains/free-subdomains`（空 body，拿系统分配的合法免费子域，**不能自己编域名**，会报 `not reserved`）→ `POST /api/hosting/v1/websites` 建站 → `POST /api/hosting/v1/accounts/{username}/wordpress/installations` 装 WP（顶层 `/wordpress/installations` 只支持 GET，POST 必须带 `accounts/{username}`）。分步是异步的，轮询到 `is_valid:true` 才算装好。完整参数与踩坑见 `references/validation-notes.md`。注意：若域名/主域绑在**另一个 Hostinger 账号**，这属于范围外，按阶段 0 边界只提醒，不要用这套路径去绕。

## 阶段 3：DNS 与 SSL

前提：域名的 NS 已经在 Cloudflare。**不在的话不要自作主张迁**——迁 NS 会短暂影响客户的邮箱和现有站点，必须客户明确同意。

用 Cloudflare MCP（Code Mode：`search` 找 API → `execute` 调）：

- 写 `A`（或 `CNAME`）记录指向主机 IP / 主机给的免费子域
- SSL/TLS 模式按主机情况设为 `flexible` 或 `full`
- 打开 HTTPS 强制跳转

**两条不能破的规矩：**

1. **不要动已有的邮件记录**（MX / SPF / DKIM / 验证用 TXT）。加记录时用「追加」语义，不要用「覆盖」——覆盖会把同名的 SPF 和验证记录一起删掉。
2. **改之前记一份快照**。Cloudflare 侧先把改动前的记录读出来存在会话里，方便倒回去。

如果域名 NS 不在 Cloudflare，走 Hostinger 的 DNS（`dns/v1/zones/{domain}`）：`overwrite: true` 会删除同名同类型的全部记录，**加记录时必须显式传 `false`**。

## 阶段 4：装 PufferGo 插件

站已经能打开、WordPress 已经装好之后：

1. 用 Hostinger MCP 的 WordPress 工具装插件（或一键登录链接进后台手动装）
2. 装完激活
3. **让客户在后台连一次 PufferGo 账号。** 后台左侧点 **PufferGo**（`admin.php?page=puffergo`）→ 右侧深色卡片点 **Connect now (30s)** → 首次会跳 puffergo.com 登录/注册（几十秒）→ 回来点 **授权并连接** → 自动跳回后台显示已连接。
   - **全程两次点击，不抄密钥。** `puffergo.com/dashboard/connect` 拿到 `source/domain/callback` 后自己建 Key（`POST /api/api-keys`，名字 `WordPress - <域名>`，一 Key 一域），再 302 回 `callback?api_key=…&status=success&connect_source=puffer_dashboard`，插件前端调 `puffergo_verify_key` 直接落库。所以别教客户「去 dashboard 复制 API Key」，那是多余的一步。
   - 未登录时先跳 `/dashboard/login?redirect=…`，连接意图存在 sessionStorage 里，登录回来参数不丢——**这一点决定了「先登录」不会打断流程**，别让客户先手动打开 puffergo.com 注册再回来。
   - 这步解锁的是**插件里的 AI 功能**（AI 建站、生成内容、SEO）。不连也能用 CLI 改站，但客户自己在后台点 AI 按钮时是灰的。
   - 报 `Can't open the PufferGo authorization page` 是 VPN / 代理把 puffergo.com 绕到海外：让他关掉 VPN 点一次，连上后再开回来。
   - **跟下面 `puffergo login` 不是一回事**：那个是 WordPress 应用密码授权（给 CLI 改站权限），这个是 PufferGo 账号（给插件内 AI）。两步都只有「点一次」，别描述成注册 + 填 key + 授权三段。
4. `puffergo login <站点地址>` —— 会走浏览器授权，客户点一次「批准」
5. `puffergo login status` 等结果；点了就立刻返回，**不要反复问客户「点了吗」**
6. `puffergo site setup` —— 这一步返回站点的能力和后台链接，用它确认插件真的活了

**管理员密码你已经知道了**（阶段 2 是你传的），所以 `login` 走的是已有的凭据，不需要再向客户要任何密码。

## 阶段 5：交接

收尾必须自己验，不能听客户说「好像好了」：

- 首页返回 200，且是 WordPress 页面（不是主机默认页、不是 403）
- `puffergo site setup` 能拿到站点信息
- `puffergo pages find` 能列出页面

三条都过，告诉客户「站建好了，接下来要写什么页面/产品」，然后**交给 content 或 products 技能**。不要把写内容的事揽在这一步。

客户问「我不会用」「这个页面是干什么的」「怎么才能不让它动我的站」时，两份现成文档给他看，**按住处分流，别自己另编一套说法**：

- `GETTING-STARTED.md` —— 从零建站照做版（买域名 → 买主机 → 装 WordPress → 指域名 → 连 PufferGo 账号 → 点批准 → 开始用），**每一步都带对话实录**，客户照着说就行。买主机那步给了推荐链接、两条价格判据（$2.23 对 / $2.79 错）和两张对照截图（对的样子 / 错的样子），还有 Country 选 Hong Kong、支付宝扫码。开头还挂了一条「不想自己弄就免费代装」的入口（`https://puffergo.com/wp/free-wordpress-setup?from=ai`，前 100 位 0 元）——**客户明显不耐烦或想省事时，直接把这个链接给他，别硬推流程**。客户说「我不会」「不知道从哪开始」时先给他这份。
- `USER-GUIDE.md` —— 站已经能用之后怎么使（点哪个按钮、钥匙在哪、断开和撤销的区别）。客户问日常操作时给他。

两份文档都明确写了「你做什么 / AI 做什么」，直接指给客户看比自己讲一遍更省事，也更不容易说漏。

## 专属命令不够时：`api` 透传

`pages` / `products` / `site` 覆盖不了某个 REST 端点时，用逃生口，**不要**去读凭据文件、也不要自己拼 Basic 头：

```
puffergo api GET /wp-json/wp/v2/types --site <站点>
puffergo api POST /wp-json/wp/v2/posts --site <站点> --yes true --body '{"title":"x"}'
```

- 凭据在 CLI 内部读出并注入，**AI 全程看不到密码**；命令只回响应。这是设计上的边界，不是限制。
- 三道护栏：路径必须 `/wp-json/` 开头（挡外站 URL 外传）、写操作要 `--yes true`、响应里的密码类字段会被脱敏成 `[redacted]`。
- 只在这条路真的更省事时用。能 `pages create` 就不要用 `api POST /wp-json/wp/v2/pages` —— 专属命令会顺手处理 slug、SEO 字段、区块结构校验。

参数、错误码、返回结构、已知边界，全部在 `references/api-command.md`。遇到没见过的返回码先读它，别猜。

**存量客户的凭据不用动。** `api` 只是多了一条读同一份 `~/.puffergo/credentials.json` 的路径：存放位置、文件格式（含早期的单站 `{siteUrl,username,appPassword}`）、解析顺序（`--config` → `PUFFERGO_CONFIG` → 全局）全都没变。更新 Skill、换新产物后，客户**不需要重新登录、不需要迁移任何文件**，老凭据直接可用。

客户说「更新完好像要我重新登录」时，先看返回的 `code`：

- `no_site` —— 登录还在，只是没指定站点或名字打错，把返回里的已登录清单给他挑，**别让他去重登**；
- `not_logged_in` —— 这台机器真没凭据，才需要 `puffergo login`。

## 报错 → 人话

| 原始报错 | 真实含义 | 告诉客户什么 |
|---|---|---|
| `403 Forbidden` + 响应头有 `platform: hostinger` | DNS 已经到主机了，但主机上没有这个域名的站点配置 | 域名还没绑到站点上，不是你 DNS 配错了 |
| `This domain isn't owned by this Hostinger account` | 域名/父域在另一个 Hostinger 账号下，**超出本技能范围** | 停止自动处理，按阶段 0 的边界话术让客户换域名或挪域名，再找 AI 继续聊 |
| `already hosted` / 域名已被占用 | 域名已经绑在同一个账号的另一个站点 | 去 hPanel 解绑，或者换域名 |
| 订单 `awaiting_payment` | 银行/卡在验证 | 去银行 App 或 hPanel 确认这笔付款，别重复下单 |
| `onboardings` 一直是 `running` / 报 404、409 | 站还在开 | 正常，等就行；超过一小时还是 running 才算失败 |
| 站点能打开但跳到免费子域 | WordPress 的 `siteurl` 还是旧的 | 改站点地址，或按请求动态设 `WP_HOME`/`WP_SITEURL` |
| 授权页报 `Invalid Request` / `This authorization was not started in this browser` | 打开成了回调地址，或会话在别的浏览器发起 | AI 重新发起 OAuth，从 `/authorize` 地址开始；不是客户点错，别让他重试 |
| Cloudflare 授权后写 DNS 返回 403 | 授权时选了 Minimal 模板，没有 `dns.write` | 重新授权选 Full access；见 `oauth-and-authorization.md` |
| MCP 工具列表只有三四个 | Code Mode 正常形态，不是没连上 | 先 `search` 找操作名再 `execute`，别以为没能力 |
| `execute` 报 `Unknown operation "xxx"` | 操作名是自己编的 | 用 `search` 返回的真实操作名（如 `hosting_websites_list`） |
| 授权页白屏 / 超长 `login_challenge` | 页面没渲染出来，不是失败 | 刷新一次；Hostinger 若开着代理触发风控，让客户临时关代理 |
| `api` 返回 `no_site` | **凭据还在**，只是没指定站点或站点名打错 | 把返回里的已登录清单给客户挑，加 `--site`；**不要让他重新登录** |
| `api` 返回 `not_logged_in` | 这台机器确实没有任何凭据 | 才需要 `puffergo login` |
| `api` 返回 `network_error` 且提示 Node 太旧 | 机器 Node < 18，没有全局 `fetch` | 升级 Node 到 18+，不是站点或凭据的问题 |

## 不要做的事

- 不要为了「让它能访问」把客户老站点的域名解绑。
- 不要在 Hostinger 买域名。
- 不要用覆盖语义写 DNS 记录。
- 不要把「接口返回 200」当成「操作成功」——建站、装 WP 都是异步的，要看状态。
- 不要在客户没说过「买」的时候下单。
- 不要为了域名归属问题去写 Worker、改 Host 头、配反代——那是范围外的兜底，只提醒，不实施。
- 不要绕过 `puffergo api` 去读 `~/.puffergo/credentials.json`、也不要自己拼 Basic 头——密码出了 CLI 就进了对话和日志，这条边界一旦破掉就收不回来。
- 不要把 `no_site` 当成「凭据丢了」，那会让客户白重登一遍。
