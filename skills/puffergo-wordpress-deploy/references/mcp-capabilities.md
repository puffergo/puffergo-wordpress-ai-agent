# MCP 能力对照（建站链路）

这份表让 AI 拿到技能就能直接开工，不用猜用哪个工具、走哪条授权。客户全程只在浏览器做简单动作，其余都是你调 MCP / 脚本完成。

## 两个 MCP 是什么、怎么连

| 能力 | 标识 | 端点 | 授权方式 | 客户做什么 |
|---|---|---|---|---|
| Hostinger（下单 / 开站 / 装 WP / DNS） | `hostinger` | 官方 MCP（stdio：`npx -y @hostinger/mcp`，或远程 `https://mcp.hostinger.com`） | OAuth 2.1，首次调用自动开浏览器；或 `HOSTINGER_API_TOKEN` 跳过 | 浏览器里点「允许」一次 |
| Cloudflare（DNS / SSL） | `cloudflare` | `https://mcp.cloudflare.com/mcp` | OAuth，首次经 mcp-remote 开浏览器，模板选 full-access | 浏览器里点「允许」一次 |

两个 MCP 的 token 过期后都会**自动用 refresh_token 续期并写回磁盘**，不需要客户重新授权。判断连没连上看「工具能不能调通」，不是看 `expires_at`。授权页按钮由 AI 代点，客户只负责服务登录/付款确认/WP 批准。完整流程与报错排障见 `oauth-and-authorization.md`。

**开工前一次性引导话术**（别等走到一半才发现没连）：

> 我需要连接 Hostinger 和 Cloudflare 两个服务来帮你建站。等下浏览器会各弹一次授权页面，你点「允许」就行，其他都不用管。

客户连好之前不要开始。连好后不要反复确认「连上了吗」——直接用，工具能调通就是连上了。

## 两个 MCP 都是 Code Mode

它们**没有**「添加 DNS 记录」「设置 SSL」这种现成工具。对外暴露的工具很少：

- Cloudflare：`search` / `execute` / `docs` / `whoami`
- Hostinger：`search` / `execute` / `multi-execute`

`search` 按自然语言找操作名，`execute` 传 `operation` + `params` 调用。所以配 DNS 的正确姿势是：`search` 找 DNS record / SSL setting 的操作 → `execute` 调。看到工具列表里没有「add_dns_record」「listWebsites」这种名字不要以为没能力——先 `search` 拿到真实操作名（如 Hostinger 列站点是 `hosting_websites_list`），别自己编操作名，`execute` 会报 `Unknown operation`。

## 阶段 → 能力 → 调用对照

| 阶段 | 能力 | 调用（要点） | 写前必读 |
|---|---|---|---|
| 0 只读摸底 | Hostinger + Cloudflare | 列 orders / websites / 套餐；查域名注册商与 NS；查目标域名是否被占用 | 全部只读 |
| 1 主机 | Hostinger | `GET billing/v1/catalog` → `GET billing/v1/payment-methods` → **报价等「买」** → `POST billing/v1/orders` → `GET hosting/v1/orders` 取 `order_id` | 客户说「买」才下单 |
| 2 开站装 WP | Hostinger | `POST hosting/v1/orders/{order_id}/onboardings`（type=wordpress + domain + 管理员账号）；轮询 `GET hosting/v1/onboardings?domain=` 到 `completed` | domain 不带 `www.`、最多一级子域 |
| 3 DNS / SSL | Cloudflare（NS 在 CF）；否则 Hostinger | `search`→`execute` 写 A/CNAME、设 SSL 模式、开 HTTPS 跳转 | 先读现有记录存快照；不覆盖 MX/SPF/DKIM |
| 4 装 PufferGo | Hostinger WordPress 工具 + 本地脚本 | MCP 装插件并激活 → `puffergo login` → `login status` → `site setup` | 密码阶段 2 已生成，不再问客户 |
| 5 交接 | 本地脚本 | `puffergo site setup` + `puffergo pages find`，并自访首页确认 200 | 验完交给 content / products 技能 |

## 客户动作 vs AI 动作

客户只做：登录/注册、输入域名、说「买」、付款确认、后台点一次「批准」。

其余全部 AI 做：查现状、报价、下单、轮询开通、写 DNS/SSL、装插件、授权、验站。客户不该看到 API 路径、记录类型、vhost、Host 头这些词——报错先用「报错 → 人话」表翻译再告诉他。

## 范围边界

域名或其主域绑在**另一个 Hostinger 账号**下（如 `422 Hosting:9999 ... isn't owned by this Hostinger account`）超出本技能范围：停止自动处理，只提醒客户换域名或把域名挪到当前账号，再找 AI 继续聊。不要写 Worker、改 Host 头、配反代去绕。

## 凭据边界与存量兼容

三处凭据，各管一段，都不要让明文进对话：

| 凭据 | 位置 | 谁用 |
|---|---|---|
| Cloudflare OAuth token | `~/.mcp-auth/mcp-remote-v1/*_tokens.json` | Cloudflare MCP 自己持有 |
| Hostinger OAuth token | `~/.config/hostinger-mcp/credentials.json` | Hostinger MCP 自己持有（过期自动刷新） |
| WordPress 应用密码 | `~/.puffergo/credentials.json`（权限 600） | `puffergo` 脚本在进程内注入 Basic 头 |

WordPress 那条**永远不要交给 AI**。专属命令不够用时走 `puffergo api <METHOD> /wp-json/...`：CLI 内部读凭据、注入、发请求，只回响应。直接读 `credentials.json` 再自己 curl 等于把长期有效的管理员密码抄进上下文和日志，撤销前一直有效。

**存量客户不用重新登录。** `api` 只是多了一条读同一份凭据的路径，存储位置、文件格式（含早期单站 `{siteUrl,username,appPassword}`）、解析顺序都没变。返回 `no_site` 是「没指定站点或名字打错」（凭据还在），只有 `not_logged_in` 才代表真的没有凭据。

## 更多参考

- `api-command.md`：`puffergo api` 通用 REST 调用的语法、三道护栏、错误码、凭据边界、已验证范围。专属命令不够用时读它。
- `oauth-and-authorization.md`：两个 MCP 的 OAuth 全流程、AI 代点步骤、token 验证、`Invalid Request` 等授权报错排障。连接卡住时读它。
- `validation-notes.md`：一整天端到端实测沉淀的两条完整链路、接口参数速查、CDP 自动化踩坑、产品形态结论。要复现实测结果时读它。
