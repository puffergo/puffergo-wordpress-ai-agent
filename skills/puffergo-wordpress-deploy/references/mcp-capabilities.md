# 建站链路能力对照

这份表让 AI 拿到技能就知道哪一步用什么。核心原则：**主机层走 Hostinger MCP（官方连接卡片 → 连接不上切脚本兜底 → 都不行才 hPanel 网页兜底），域名解析走 Cloudflare，站点侧走 CLI**。

## 三个能力是什么、怎么用

| 能力 | 标识 | 端点 / 位置 | 授权方式 | 客户做什么 |
|---|---|---|---|---|
| Cloudflare（DNS / SSL） | `cloudflare` | `https://mcp.cloudflare.com/mcp` | OAuth，首次开浏览器，模板选 full-access | 浏览器里点「允许」一次 |
| Hostinger MCP（买主机 / 开站 / 装 WP） | `hostinger` | 主通道：官方 HTTP MCP `https://mcp.hostinger.com`；兜底：技能脚本 `scripts/hostinger.mjs`（调官方包，国内镜像） | 主通道走 WorkBuddy 内置 OAuth（凭据 `~/.mcp-auth/`）；兜底走包自己的 OAuth（凭据 `~/.config/hostinger-mcp/`）。两条都是浏览器点一次「Allow」 | 首次点一次「Allow」+ 结账页扫码付款 |
| puffergo 脚本（站点侧全部操作） | CLI | 本技能 `scripts/puffergo.mjs` | 应用密码（客户后台点「批准」生成） | 后台点一次「批准」 |

**Hostinger MCP 是核心链路，能连通就用它买主机、开站、装 WordPress。** 关键事实（实测 2026-11-17/18）：

- **两条通道，按顺序试**：
  1. **主通道**：WorkBuddy 官方 MCP（`type:http` + `https://mcp.hostinger.com`），走 WorkBuddy 内置标准 OAuth 2.1（DCR + PKCE），凭据 `~/.mcp-auth/`。这是标准对接，跟 Cloudflare 同类。
  2. **兜底通道**：技能自带 `scripts/hostinger.mjs`。WorkBuddy 的官方连接卡片在部分环境会静默失败（`MCP-ManagerAuth failed error=空`、浏览器不弹授权页）——这是 WorkBuddy 客户端 bug，已反馈。**遇到就切兜底，不要让客户反复点重试**。脚本调的还是 Hostinger 官方包（stdio，`npx` 从腾讯云镜像拉，凭据 `~/.config/hostinger-mcp/`），客户体验一样（也是弹浏览器点 Allow）。
- 它和 Cloudflare 一样是 **Code Mode**：`search` 传 `{query, limit?}` 找操作名，`execute` 传 `{operation, params}` 调。参数名传错报 `Invalid input: expected string, received undefined`。
- **兜底脚本用法**：`node scripts/hostinger.mjs --check`（只读查凭据 READY/NEED_LOGIN）→ 首次 `--login`（输出 `AUTH_URL`，AI 用浏览器工具打开让客户点 Allow）→ `--search "xxx"` 找操作 → `hostinger.mjs <operation> '<params-json>'` 调用。详见 SKILL.md「主机连接兜底」。
- **只有两条通道都跑不通**（授权重试无效、接口持续报错、域名归属超范围）才降级到 hPanel 网页，让客户手动开站装 WP（SKILL 阶段 2 网页兜底）。别一上来就把成本转嫁给客户。

Cloudflare 的 token 过期后**自动用 refresh_token 续期并写回磁盘**，不需要客户重新授权。判断连没连上看「工具能不能调通」，不是看 `expires_at`。**授权页按钮一律客户本人点**（Hostinger 的 Allow、Cloudflare 的 Continue、WordPress 的批准），AI 只负责把页面送到眼前、配一张示意图、留一条聊天里的备用链接，不代点。**Cloudflare 那页还要让客户把 Base scopes 切到 `Full access`**——默认的 `Minimal` 没有 `dns.write`，加记录会 403；这一次切换和 Continue 一样属于授权动作，也不代点。完整流程与报错排障见 `oauth-and-authorization.md`。

**开工前一次性引导话术**（只在要配解析时说）：

> 我需要连接 Cloudflare 来帮你配域名解析，等下浏览器会弹一次授权，点「允许」就行。

客户连好之前不要写 DNS。连好后不要反复确认「连上了吗」——直接用，工具能调通就是连上了。

## Cloudflare MCP 是 Code Mode

它**没有**「添加 DNS 记录」「设置 SSL」这种现成工具。对外暴露：`search` / `execute` / `docs` / `whoami`。

`search` 按自然语言找操作名，`execute` 传 `operation` + `params` 调用。所以配 DNS 的正确姿势是：`search` 找 DNS record / SSL setting 的操作 → `execute` 调。看到工具列表只有三四个不要以为没连上——先 `search` 拿真实操作名，别自己编，`execute` 会报 `Unknown operation`。

## 阶段 → 能力 → 调用对照

| 阶段 | 谁做 | 调用（要点） | 写前必读 |
|---|---|---|---|
| 0 只读摸底 | AI（dig/curl） | `dig +short NS <domain>` 看 NS；`curl` 看域名现在能不能打开；主机问客户一句（还没授权） | 全部只读；Hostinger 授权后阶段 1 再查 |
| 1 主机 | AI 查套餐 + 客户付款 | `execute` 传 `operation:"hosting_websites_list"` 查已有套餐；无套餐则给带推荐码的链接 → Unlimited / 48 months / Country Hong Kong / AliPay+ 扫码 | 客户确认后才给链接；不代付 |
| 2 开站装 WP | AI（Hostinger MCP） | 先 `puffergo site password` 生成密码+落登录卡；再 `POST /api/hosting/v1/orders/{order_id}/onboardings`（type=wordpress + domain + **wordpress.admin 必填**）；轮询 `is_valid`；**跑不通才降级 hPanel 网页兜底** | 密码由 AI 生成、写进客户桌面登录卡，装完再也查不回来；域名解析没到位先用免费临时子域 |
| 3 DNS / SSL | AI（Cloudflare MCP）或客户（hPanel） | NS 在 CF：`search`→`execute` 写 A/CNAME（**必须 `proxied: true` 橙云**）、SSL 设 `full`、开 HTTPS 跳转；NS 在别家：给记录值让客户在 hPanel/注册商加 | 先读现有记录存快照；不覆盖 MX/SPF/DKIM；灰云＝没接 CF，国内访问慢 |
| 4 装 PufferGo | CLI | 客户用桌面登录卡里的账号密码进 `/wp-admin` → `puffergo login` 客户点批准 → `site setup install --customer-said` 装插件 → `site setup` 确认 | 装插件要先有应用密码；**不要让他从 hPanel 点 WP Admin 进后台** |
| 5 交接 | CLI | `puffergo site setup` + `puffergo plugins list` + `puffergo pages find`，自访首页确认 200；**接着做站点画像**：`puffergo profile ask` → 一次性问 → `profile set` | 上手卡不写密码；画像没做完不要开始写页面 |

## 客户动作 vs AI 动作

客户做：首次连主机时点一次「Allow」、输入域名、说「可以」、结账页扫码付款、连一次 PufferGo 账号、点一次「批准」。**开站装 WordPress 不用客户在 hPanel 点**——那是 MCP 跑不通时的兜底才用。

AI 做：查域名现状、查主机套餐、报价、开站装 WP、配 DNS/SSL、装插件、授权、验站、写页面/产品。客户不该看到 API 路径、记录类型、vhost、Host 头这些词——报错先用「报错 → 人话」表翻译再告诉他。

**密码边界**：Hostinger 账号密码、邮箱密码、SMTP 授权码——AI 一律不要、不读明文。**WordPress 后台密码是唯一例外**：它由 AI 建站时生成（`puffergo site password`）、提交给建站接口、同时写进客户桌面的登录卡；装完之后没有任何接口能读回来，所以“生成一次、落盘一次、之后不再提”——不在聊天里念，也不让客户发回来。AI 改站靠客户点「批准」生成的应用密码，存在本机、客户可随时撤销。

## 范围边界

域名或其主域绑在**另一个 Hostinger 账号**下（如 `422 Hosting:9999 ... isn't owned by this Hostinger account`）超出本技能范围：停止自动处理，只提醒客户换域名或把域名挪到当前账号，再找 AI 继续聊。不要写 Worker、改 Host 头、配反代去绕。

## 凭据边界与存量兼容

两处凭据，都不要让明文进对话：

| 凭据 | 位置 | 谁用 |
|---|---|---|
| Cloudflare OAuth token | `~/.mcp-auth/mcp-remote-v1/*_tokens.json` | Cloudflare MCP 自己持有 |
| Hostinger OAuth token（兜底通道） | `~/.config/hostinger-mcp/credentials.json` | 官方包（stdio）自己持有，过期自动刷新 |
| Hostinger OAuth token（主通道） | `~/.mcp-auth/mcp-remote-v1/*_tokens.json` | WorkBuddy 内置 OAuth，与 Cloudflare 同一套 |
| WordPress 应用密码 | `~/.puffergo/credentials.json`（权限 600） | `puffergo` 脚本在进程内注入 Basic 头 |

三处凭据都让 AI 不碰明文——工具/脚本自己在进程内注入。客户的 Hostinger 账号密码、WordPress 后台登录密码 AI 一概不知道也不需要。

WordPress 那条**永远不要交给 AI**。专属命令不够用时走 `puffergo api <METHOD> /wp-json/...`：CLI 内部读凭据、注入、发请求，只回响应。直接读 `credentials.json` 再自己 curl 等于把长期有效的管理员密码抄进上下文和日志，撤销前一直有效。

**存量客户不用重新登录。** `api` 只是多了一条读同一份凭据的路径，存储位置、文件格式（含早期单站 `{siteUrl,username,appPassword}`）、解析顺序都没变。返回 `no_site` 是「没指定站点或名字打错」（凭据还在），只有 `not_logged_in` 才代表真的没有凭据。

## 更多参考

- `api-command.md`：`puffergo api` 通用 REST 调用的语法、三道护栏、错误码、凭据边界、已验证范围。专属命令不够用时读它。
- `oauth-and-authorization.md`：Cloudflare 和 Hostinger 的 OAuth 全流程、客户点授权的标准话术与配图、token 验证、`Invalid Request` 等授权报错排障。连接卡住时读它。
- `validation-notes.md`：一整天端到端实测沉淀的两条完整链路、接口参数速查（含 Hostinger `onboardings` / `websites` / `billing`）、CDP 自动化踩坑、产品形态结论。要复现实测结果或查接口参数时读它。
