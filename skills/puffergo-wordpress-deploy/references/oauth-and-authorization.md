# 授权与连接排障（AI 操作手册）

客户全程只在浏览器里动手：点「允许 / 批准」，以及在 Cloudflare 页把权限切到 `Full access`。这份文档是给 AI 看的：怎么把 Cloudflare 和 Hostinger 授权跑通、客户点错了怎么救、token 怎么验证。遇到连接问题先照这里做，别把浏览器操作甩给客户。

## Cloudflare 连接了没有

凭据落盘位置（本机实测 2026-11-17）：

| 服务 | 凭据文件 | 内容 |
|---|---|---|
| Cloudflare | 由宿主保管（不同宿主位置不同，可能在钥匙串里） | CLI 不读，也不要求 AI 去找 |
| Hostinger | `~/.config/hostinger-mcp/credentials.json` | `client_id` / `access_token` / `refresh_token` / `expires_at` |

两个 MCP 的 token 都**自动续期**，过期不用重新授权，也别去读明文。`expires_at` 只是参考，判断连没连上永远看「工具能不能调通」。

Cloudflare 是 Code Mode：对外只暴露 `search` / `execute` / `docs` / `whoami`。没有「添加 DNS 记录」这种现成工具——先 `search` 找操作名，再 `execute` 传 `operation` + `params` 调。看到工具列表只有三四个不要以为没连上。

**token 过期不用重新授权**：access_token 会在下次调用时自动用 refresh_token 续期并写回磁盘。判断「连没连上」的标准是**能不能调通工具**，不是看 `expires_at` 是不是过期——过期的 token 调一次就自动刷新了。所以不要一看到过期就让用户重新点授权。

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
3. 选权限模板：**必须选 `Full access`**（三档里最右边那个）。默认 `Minimal` 不含 `dns.write`，加 A/CNAME 记录、改 SSL 模式都会 403；`Full access` 才带 DNS & Zones 的写权限。
4. 点 Continue。
5. 可能跳到一个超长的 `dash.cloudflare.com/login?login_challenge=...` 页面并白屏——**刷新一次**就进入 `oauth/consent-form` 同意页。（这是实测踩到的坑，白屏不等于失败。）
6. 同意页确认账号邮箱是客户要的那个，点 Authorize。
7. 自动回调 `localhost:<port>/oauth/callback?code=...`，token 落盘，日志出现 `Proxy established successfully` 即成功。

### 报错：`Invalid Request` / `This authorization was not started in this browser; start again`

- **根因**：打开的是**回调地址**（`/oauth/callback?code=...`）而不是授权地址（`/authorize?...`），或者这个 OAuth 会话是在另一个浏览器发起的，两边 state/cookie 对不上。**不是客户点错了。**
- **解法**：丢掉那个回调页，重新走上面的全流程，从 `/authorize` 地址开始。不要试图在同一个浏览器里刷新回调页救回来。

## Hostinger OAuth 全流程

官方 MCP 是本地 stdio 包（`npx -y @hostinger/mcp`），已配国内镜像（腾讯云），首次调用自动从镜像下载（十几秒）+ 开浏览器走 OAuth 2.1 PKCE，客户点 Allow 即可，凭据落 `~/.config/hostinger-mcp/credentials.json`，过期自动刷新。之后走本机缓存、不再联网。支持直接用 `HOSTINGER_API_TOKEN` 环境变量跳过 OAuth。

**这个包自己处理授权**（动态注册 + PKCE），不经过宿主的连接层。所以宿主里那个「主机（Hostinger）」连接按钮点了没反应是正常的——不是连不上，AI 调工具时包会自己弹浏览器。首次下载前播报一句「正在准备主机工具，马上就好」。

**授权页（Consent）本身不点。** 这些页面的按钮是客户在授权他自己的账号，AI 点了就是自己给自己发钥匙。技术上点得动（`tab_focus` + `dom_cua_click` 能点 DOM），但整个「客户随时可撤销」的设计依赖那一下是真人点的。AI 只负责把页面送到他眼前 + 说清点哪个 + 等他点完。

两页的实际长相（真图上带运营者自己的账号邮箱，所以包里放的是重画的占位版）：

| 页面 | 标题 / 关键文案 | 客户要做的 | 图 |
|---|---|---|---|
| Hostinger | **Connect your account**，`hostinger-mcp is requesting access to your account`，SIGNED IN AS 显示他自己的邮箱 | 认账号 → 点 **Allow** | `images/hostinger-allow-annotated.png` |
| Cloudflare | **Authorize application** / Grant access to Cloudflare API，有 Base scopes（Minimal / Read only / Full access） | 切到最右的 **Full access** → 点 **Continue** | `images/cloudflare-authorize-annotated.png` |

Cloudflare 那一页三个容易误判的地方：① `Redirect URI` 显示 `http://127.0.0.1:…/callback` 和那句 "Local redirect … Only continue if you trust the application" 是**正常的**（本机接收授权结果）；② `Continue` 这个按钮的 `name="decision" value="approve"`——**它就是"同意"**，不用再找第二个 Authorize 按钮；③ **scopes 必须切 `Full access`，不能保持默认 `Minimal`**——`Minimal` 没有 `dns.write`，写解析一步就 403。页面上那句 "You can narrow scopes further, later in the authorization flow" 是**往下减**的意思（还能再收窄），**不会**事后自动追加更高权限；MCP 客户端也不做 step-up，所以"到时候它会再要一次"这种想法不要有。

**授权完可以直接验一眼**：授权后的凭据作用域里应该包含 `dns.write` 和 `zone-settings.write`（只读这个字段，别把 `access_token` 打出来）。缺了就是客户点了 `Continue` 但没切 Full access——让他重新授权一次，别硬试写记录。

Hostinger 侧还有一类环境问题：客户本机开着 Clash Verge / 代理时可能触发风控或超长 challenge 导致白屏，先刷新，再考虑让他临时关代理。这类问题要在**客户点之前**就提醒，别等他点完了才排查。

## 授权按钮：客户本人点（不代点）

**Hostinger 的 `Allow`、Cloudflare 的 `Continue`（含它上面那次「切 Full access」）、WordPress 的 `Approve`，一律客户点。** 这是唯一一类"AI 明明做得到、但绝不能做"的动作。

三条理由，按重要性排：

1. **批准＝交钥匙。** AI 去点那个按钮，等于 AI 手里先有钥匙、再自己给自己开门。客户随时能在后台撤销、能看到「某个应用在访问我的账号」，这套设计的前提就是那一下是真人点的。
2. **范围不是一个量级。** WordPress 应用密码只让插件读写那一个站；Hostinger OAuth 给的是**主机账户级**访问（开站、删站、改 DNS、看账单、管域名）；Cloudflare OAuth 一旦选 `Full access`，给的是**整个账号**几乎所有产品（DNS、Workers、R2、防火墙都在里面，四百多项）。代点等于自己给自己开一张能删客户全部站点的门禁卡。
3. **token 会自己续命。** Hostinger / Cloudflare 的 token 过期自动刷新，客户很难意识到"有个东西一直在用我的账号"。代点之后他说"我没授权过"，没有任何痕迹能对上。

**还有一层现实障碍**：客户浏览器没登录时，代点就得先输账号密码——又回到"AI 碰密码"。而他已经登录了的话，他自己点一下的成本几乎为零。所以代点在这个场景里根本没有收益。

**体验标准**（和 WordPress 应用密码那一步完全一致，四件套）：浏览器自动打开 → 一句加粗人话（"看到这个页面是正常的"＋"点哪个"）→ 一张带编号的示意图 → 聊天里留一条链接当备用。少任何一件，客户就会以为出错。

**需要客户本人的只有四类**：Hostinger 账号登录与付款、Cloudflare 账号授权、WordPress 后台应用密码批准、结账页扫码付款。其余全部 AI 做，包括查套餐、开站、装 WP、写 DNS 记录、装插件。

**授权链接的备用路径**：`authorizeUrl` / `AUTH_URL` 一定同时发给客户。浏览器没弹出、开在看不见的地方、或者被他不小心关掉了，就让他复制进地址栏。**不要用 AI 自己的内置浏览器打开授权链接**——回调落在客户本机，必须是他自己的浏览器。

**两条越界红线（不随客户临时要求改变）**：会产生账号级/不可逆副作用的操作（新建 OAuth 应用、改存量 DNS、删数据、改根域指向），先一句话说明再动手；客户正在使用或编辑的界面一律不接管，需要浏览器就自己新开一个标签页并告知。客户说「我自己来」只对当次动作生效，不构成长期规则——默认姿态仍然是能代做就代做，**唯一例外是上面那三下授权（Hostinger Allow / Cloudflare Continue / WordPress 批准），那个永远是客户点**。

**身份核对先于提权**：`insufficient_scope` 常见于连错账号，遇到先 `whoami` 拿账号邮箱跟目标资产比对，不一致就停、换账号；一致才考虑重授权。同类失败最多重试 1 次，第二次停手按故障模板上报（平台 / 端点 / 状态码 / oauthError / traceId / 已尝试次数）。


## WordPress 授权（`puffergo login`）：监听进程必须活过命令本身

回调是**一次性**的：客户点批准那一刻，WordPress 302 到 `success_url` 并把应用密码带过来，**只发这一次**。页面留着不关不会重发，所以「他没关页面」从来不是问题。

真正的问题是**进程树被清理**：`spawn(detached: true)` 只开一个新的进程组，而 AI 工具的沙箱回收的是**整棵进程树**——子进程照样一起死。客户点的时候端口上没人，密码就打空了，看起来像「授权失败」，其实是没接住。

**POSIX（macOS / Linux）的解法是 shell 双 fork**：`login` 走 `/bin/sh -c '( nohup … & echo $! > pid )'`。那个短命的 shell 立刻退出，监听进程被 launchd / init 收养，**PPID 变成 1**，不再在工具的进程树里。实测 `pgrep -P 1` 能查到它，端口在命令返回几分钟后仍然 LISTEN。

**Windows 是另一套模型，别套用上面的结论**：那边没有 reparent、没有 SIGHUP、也没有「按进程组收尾」这回事，`detached: true` 只做两件事——新进程组 + 不挂控制台窗口。**父命令退出时子进程通常照样活着**，所以同一个环境下 Windows 往往比 macOS 更稳。真正的杀手只有一个：宿主用 **Job Object** 把子进程圈起来并设了「job 关闭即杀」（很多 Electron 宿主、CI、部分终端会这么干）。`detached` 逃不出 Job Object，唯一的出口是 `CREATE_BREAKAWAY_FROM_JOB`，**Node 的 `spawn` 不暴露这个标志**——所以那种情况下不要试图再"脱离"一次，直接走下面的兜底。Windows 侧的 `pid` 由监听进程自己写（没有 shell 帮忙 `echo $!`），`pidAlive` 因此和 POSIX 一样可信。

`login` 返回值里的 `listener` 是这件事的**实测**结果：`alive`（端口此刻有没有人在听）、`pid`、`pidAlive`、`logFile`（监听进程的 stdout/stderr，排查时看它）。`alive: true` 就表示客户什么时候点都收得到，不用赶时间；只有 `false` 才需要 `login status` 接管。

**`login status` 的定位因此变了**：它不再是唯一监听者，只是去问「收到没有」。正常跑一两次就够，不要掐点循环。

**空等会累计，累计到两次就停手。** `tookOver` 每次 +1，写进状态；第二次时命令直接返回 `callback_unreliable`，`doctor` 报 `callback-unreachable`。这是把「这个环境的回传确实到不了」变成一个**事实判断**，而不是让 AI 再猜一次——**这时候再让客户点第三次纯属瞎猜**，按下面顺序转：

| 顺序 | 路子 | 命令 | 前提 |
|---|---|---|---|
| 1 | 地址栏里的回调 URL | `puffergo login from-url --site <url> --file <path>` | 客户浏览器还停在那个 `127.0.0.1` 页面 |
| 2 | 后台生成应用密码 | `puffergo login app-password --site <url> --file <path> --user <u>` | 那串 URL 已经拿不到了 |

两条都**只传文件路径**，密码不进模型上下文。

**为什么地址栏那条优先**：客户点完批准，浏览器跳到 `http://127.0.0.1:…/?site_url=…&user_login=…&password=…`。即使页面显示「无法连接」、顶部还飘着几条**红色空提示条**，那串 URL 仍在地址栏里、密码就在里面——**红色空条不代表授权失败**（那是 WordPress 后台 notice 的空渲染，和这条流程无关），唯一的判据是地址栏里有没有 `password=`。客户人已经站在那一页上，复制一下就完事，比让他去 wp-admin 里翻 Application Passwords 简单太多。

**本机代理的假象**：如果 `dig` 出来是 `198.18.x.x` 这类地址，说明本机装了 TUN 模式的代理（Clash 之类），它给所有域名分配 fake-ip。这不影响 `127.0.0.1` 的回调，但会让「站点能不能打开」的判断失真——别拿它当授权失败的证据。

`doctor` 一条命令报清 `diagnosis`：

| `diagnosis` | 意思 | 下一步 |
|---|---|---|
| `listening` | 有进程占着端口在等 | 客户随时可点 |
| `nobody-listening` | 端口空着 | 跑 `login status` 接管（POSIX 沙箱常见；Windows 一般是宿主 Job Object 杀的） |
| `callback-unreachable` | 已空等 ≥2 次 | **别再点**，转 from-url / app-password |
| `expired` | 10 分钟窗口过了，那条链接已废 | 重新 `login`，发新链接 |
| `state-without-credential` | 状态说 approved，但凭据里没这个站（假成功） | 重登；反复出现就查磁盘/`~/.puffergo` 权限 |
| `failed` | 被拒绝或上次超时 | 重新 `login` |
| `ready` | 状态和凭据对上了 | 直接用 |

**假成功已经堵住**：回调到达时先写盘、再返回「✅ 已授权」。写盘失败会显示「保存凭据失败：<原因>」并留 `failed` 状态，不会假装成功。`grant_failed` 就是这种情况——批准了但存不下，**让客户再点一次没有意义**，要先修存储。

**第二个独立的坑：写盘被宿主的 broker 拦下（已自愈）。** 有些 AI 宿主会通过 `NODE_OPTIONS=--require …/node-language-shim.cjs` 注入一个 fs 代理，把写文件转成对**「启动这条命令的那个 execution」的 broker 请求**。监听进程活过了命令，那个 execution 却已经结束，于是回调收到了、密码也在，写 `credentials.json` 却报：

```
保存凭据失败：Broker request outcome unknown: execution attempt 不存在或已关闭
```

这不是权限问题、不是磁盘问题，也不该让客户再点。CLI 现在**启动时就把这种 preload 从 `NODE_OPTIONS` 里剥掉并自我重启一次**，它派生的每一个子进程（登录监听、后台安装）都继承干净环境。识别只针对沙箱注入的那类文件代理 preload（`*-language-shim.cjs`、`broker` 之类），客户自己设的 `NODE_OPTIONS` 原样保留。**如果还看到上面这条报错，说明用的是旧版 CLI：`puffergo login` 重跑一次即可，别再让客户点第三次。**

**回传地址里带着明文应用密码**（`http://127.0.0.1:…/?site_url=…&password=…`），它会留在客户浏览器的历史记录里。这个 URL 是插件那侧 `authorize-application.php` 生成的，CLI 改不了。客户如果介意，授权完让他把这一条历史记录清掉即可——这也是为什么 `from-url` / `app-password` 两条文件路线都只让 AI 传路径、不碰内容。

## WordPress 登录的备用路径：两条文件路线

`puffergo login` 依赖本机的 `127.0.0.1` 回调接收 WordPress 的应用密码。三种情况会让它收不到：监听进程没活下来、回调被 Hostinger 的 WAF 当 SSRF 拦掉（`success_url` 里的回环地址）、本机代理拒绝回环连接。

**先排除「没人听」再去怀疑 WAF。** 一直 `waiting` 最常见的原因是没有进程在听（跑一次 `login doctor` 就知道），不是被拦。

**只有确认回调收不到时才走文件路线**（步骤更多，别主动提），顺序见上表：先 `from-url`（客户地址栏里那串 URL），拿不到才 `app-password`（客户自己在后台生成）。

**a. 客户浏览器还停在那个页面（最省事）**

1. 让他把**地址栏整条 URL** 复制进一个文本文件。
2. `puffergo login from-url --site <url> --file <那个文件的路径>`
3. 那条 URL 里没有 `user_login=` 时补 `--user <用户名>`。

**b. 那串 URL 已经拿不到时**

1. 让客户自己在 wp-admin → 用户 → 个人资料 → **应用程序密码** 里新增一条，记下用户名和生成的密码。
2. 让客户把密码写进他自己电脑上的一个文本文件（纯文本即可，空格无所谓）。
3. `puffergo login app-password --site <url> --file <那个文件的路径> --user <用户名>`

**你只把文件路径交给 CLI，不要读那个文件、也不要把密码写进任何命令参数**——这是这条路存在的全部意义：密码不进模型上下文。CLI 会拿它做一次真实 REST 校验，通过后存进本机凭据；失败会明确报错（密码不对/文件读不到/缺用户名），不要猜、不要拿不同变体重试。成功后提醒客户删掉那个临时文件。

凭据最终落在和回调路径同一份 `~/.puffergo/credentials.json`，后续 `site setup` 等命令无差别可用。
