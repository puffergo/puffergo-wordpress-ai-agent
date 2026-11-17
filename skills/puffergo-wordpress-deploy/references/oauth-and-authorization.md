# 授权与连接排障（AI 操作手册）

客户全程只在浏览器点「允许 / 批准」。这份文档是给 AI 看的：怎么把授权跑通、客户点错了怎么救、token 怎么验证。遇到连接问题先照这里做，别把浏览器操作甩给客户。

## 两个 MCP 都连好了没有

凭据落盘位置（本机实测 2026-11-17）：

| 服务 | 凭据文件 | 内容 |
|---|---|---|
| Hostinger | `~/.config/hostinger-mcp/credentials.json` | `client_id` / `access_token` / `refresh_token` / `expires_at` |
| Cloudflare | `~/.mcp-auth/mcp-remote-v1/<hash>_tokens.json` | `access_token` / `refresh_token` / `scope` / `issuer` |

**两个 MCP 现在都是 Code Mode**：对外只暴露 `search` / `execute`（Hostinger 还有 `multi-execute`；Cloudflare 还有 `docs` / `whoami`）。没有「添加 DNS 记录」这种现成工具——先 `search` 找操作名，再 `execute` 传 `operation` + `params` 调。看到工具列表只有三四个不要以为没连上。

**token 过期不用重新授权**：两个 MCP 的 access_token 都会在下次调用时自动用 refresh_token 续期并写回磁盘。判断「连没连上」的标准是**能不能调通工具**，不是看 `expires_at` 是不是过期——过期的 token 调一次就自动刷新了（实测 Hostinger 过期 42 分钟仍自动续成功）。所以不要一看到过期就让用户重新点授权。

## 快速自检（都用 Node 脚本，别一次性 pipe）

MCP 是 stdio 协议，**用 `printf ... | mcp进程` 一次性喂入会因为 stdin 提前关闭拿不到响应**。要用 `spawn` 保持连接、逐条读写。模板见本机 `/tmp/cf-whoami.mjs`（Cloudflare）、`/tmp/hg-call2.mjs`（Hostinger）——照这个形态写临时脚本即可。

- Cloudflare 验账号：调 `whoami`，返回 `email` 就是当前账号。
- Hostinger 验连通：`execute` 传 `operation: "hosting_websites_list"`，能返回站点数组就是通的。
- **注意**：Cloudflare 的 MCP token 是不透明串（约 82 字符），**不能**直接拿去 `curl https://api.cloudflare.com/client/v4/user`（会返回 `success:false`）。验账号必须走 MCP 的 `whoami`。

## Cloudflare OAuth 全流程（含踩坑）

端点 `https://mcp.cloudflare.com/mcp`，走 `mcp-remote` 代理，授权页在 `mcp.cloudflare.com`。完整步骤：

1. 本机起代理（后台）：
   ```
   node /tmp/cf-mcp-client/node_modules/mcp-remote/dist/proxy.js https://mcp.cloudflare.com/mcp > /tmp/cf-oauth.log 2>&1
   ```
   日志里 `Please authorize this client by visiting:` 后面就是**授权地址**。
2. 在客户浏览器里打开那个 `/authorize?...` 地址。
3. 选权限模板：**必须选 Full access**。默认 Minimal 没有 `dns.write`，后面写 DNS 会 403。Full access 有 402 项权限，含 DNS & Zones 写权限。
4. 点 Continue。
5. 可能跳到一个超长的 `dash.cloudflare.com/login?login_challenge=...` 页面并白屏——**刷新一次**就进入 `oauth/consent-form` 同意页。（这是实测踩到的坑，白屏不等于失败。）
6. 同意页确认账号邮箱是客户要的那个，点 Authorize。
7. 自动回调 `localhost:<port>/oauth/callback?code=...`，token 落盘，日志出现 `Proxy established successfully` 即成功。

### 报错：`Invalid Request` / `This authorization was not started in this browser; start again`

- **根因**：打开的是**回调地址**（`/oauth/callback?code=...`）而不是授权地址（`/authorize?...`），或者这个 OAuth 会话是在另一个浏览器发起的，两边 state/cookie 对不上。**不是客户点错了。**
- **解法**：丢掉那个回调页，重新走上面的全流程，从 `/authorize` 地址开始。不要试图在同一个浏览器里刷新回调页救回来。

## Hostinger OAuth 全流程

官方 MCP（`npx -y @hostinger/mcp`）首次调用自动开浏览器走 OAuth 2.1 PKCE，客户点 Allow 即可，凭据落 `~/.config/hostinger-mcp/credentials.json`。支持直接用 `HOSTINGER_API_TOKEN` 环境变量跳过 OAuth。

浏览器自动化的两个坑（CDP 点击）：

1. **非前台 tab 点击静默失效**：必须先 `tab_focus` 把目标 tab 置前，再点，否则 DOM 毫无变化。
2. **同意页可能两步**：先选 scope / Continue，再 Authorize，别点一次就以为完了。
3. Hostinger 风控：客户本机若开着 Clash Verge / 代理，可能触发风控或页面超长 challenge，导致白屏；遇到白屏先刷新，再考虑让客户临时关代理。

## AI 代点原则（客户零操作）

目标是让不懂技术的人只做「登录 / 注册 + 点允许」两件事。**授权页上的按钮 AI 应该自己点掉**，不要把「请你点一下 Continue / Authorize」当成任务甩给客户——客户不懂这些词，也容易点错到回调页。

判断标准：这个动作如果不需要客户的账号密码或银行验证，AI 就能代劳。需要客户本人凭证的只有三处：① 服务登录（账号密码/验证码）；② 付款确认（银行 App / hPanel）；③ WordPress 后台的应用密码批准。其余全部 AI 做。
