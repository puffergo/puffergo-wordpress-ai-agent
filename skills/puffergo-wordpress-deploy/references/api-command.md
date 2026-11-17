# `puffergo api` — 通用 REST 调用

专属命令（`pages` / `products` / `site`）覆盖不到的 WordPress 端点，用这条命令调。它在 CLI 进程内读凭据、拼 Basic 头、发请求，只把响应交回调用方。**AI 全程看不到应用密码**，这是这条命令存在的理由。

本文只写已验证的行为。没覆盖到的写在最后一节。

## 1. 语法

```
puffergo api <METHOD> <path> [--body <json>] [--yes] [--site <url>] [--config <path>]
```

| 位置/参数 | 必填 | 说明 |
|---|---|---|
| `METHOD` | 是 | `GET` / `POST` / `PUT` / `PATCH` / `DELETE`，大小写不限 |
| `path` | 是 | 必须以 `/wp-json/` 开头，拼接在站点地址之后 |
| `--body` | 否 | JSON 字符串。含空格时**必须加引号**：`--body '{"title": "x"}'`；不加引号 shell 会按空格把它拆成多个参数 |
| `--yes` | 写操作必填 | 见第 3 节。裸写 `--yes` 等价于 `--yes true`（已实测） |
| `--site` | 多站时必填 | 完整地址或裸域名都可以，如 `https://x.com` 或 `x.com` |
| `--config` | 否 | 指定另一个凭据文件；不传则按 `PUFFERGO_CONFIG` → `~/.puffergo/credentials.json` 顺序找 |

示例：

```
puffergo api GET /wp-json/wp/v2/types --site https://example.com
puffergo api POST /wp-json/wp/v2/posts --yes --body '{"title":"hi"}' --site https://example.com
```

## 2. 路径护栏

只接受干净相对路径。下列全部拒绝（部分实测，全部有单测覆盖）：完整网址 `https://evil.test/x`、协议相对 `//x`、双斜杠 `/wp-json//x`、`..` 跳转段、`#` 片段、大写 `/WP-JSON/`、含空白或控制字符或反斜杠的路径。

拒绝时不发任何请求，直接返回 `code: "bad_path"`。这条护栏防的是「提示注入让 AI 把 Basic 头发到攻击者域名」。

## 3. 写操作护栏

`POST` / `PUT` / `PATCH` / `DELETE` 必须带 `--yes`（或 `--yes true`），否则不执行、不发请求：

```json
{ "ok": false, "code": "confirm_required",
  "message": "DELETE 是写操作，会改动站点。确认要执行就加 --yes true；只是查询请用 GET。" }
```

`GET` 不需要。命令**不判断**这次写操作是否危险，只看方法——所以 `--yes` 该由人来点头，不由 AI 自己加。

## 4. 返回值

固定是 JSON。成功只多 `status` 与 `body`（下面这条来自实测，`body` 内容已截断）：

```json
{ "ok": true, "siteUrl": "https://example.com", "status": 200,
  "body": { "post": { "name": "文章", "slug": "post", "rest_base": "posts" } } }
```

失败带 `code`，HTTP 非 2xx 时 `code` 是 `http_<状态码>`。下面是一条实测的 404 原文：

```json
{ "ok": false, "code": "http_404", "siteUrl": "https://example.com", "status": 404,
  "body": { "code": "rest_no_route", "message": "未找到匹配 URL 和请求方式的路由。", "data": { "status": 404 } } }
```

响应里出现密码类字段（`password`、`appPassword`、`authorization`、`access_token` 等）会被替换成 `[redacted]`，并额外返回 `"redacted": true`，让调用方知道某个字段是被隐藏而不是不存在。这条由单元测试覆盖（构造一个回显密码的响应），**真实 WordPress 站点上没有触发过**——正常端点不会回显密码。

## 5. 错误码

| code | 含义 | 怎么处理 |
|---|---|---|
| `usage` | 方法或路径没写、或方法不在五种之内 | 看 `message` 里的用法重写 |
| `bad_path` | 路径没通过第 2 节护栏 | 改成 `/wp-json/...` 形式 |
| `confirm_required` | 写操作没带 `--yes` | 向人确认后加 `--yes` |
| `bad_body` | `--body` 不是合法 JSON | 修 JSON；注意引号 |
| `no_site` | **凭据在**，但没指定站点或站点名对不上 | 从 `message` 里的已登录清单挑一个加 `--site` |
| `not_logged_in` | 这台机器没有任何凭据 | 先 `puffergo login <站点>` |
| `network_error` | 请求没发出去 | 看 `message`；提示 Node 太旧就升级到 18+ |
| `http_<N>` | 请求发出去了，站点返回 N | 按 N 处理：401/403 是权限或密码被撤销，404 是端点不存在 |

`no_site` 与 `not_logged_in` 是刻意分开的。多站环境下没指定站点时报前者——凭据一直在，不需要重新登录。

## 6. 凭据

| 项目 | 事实 |
|---|---|
| 位置 | `~/.puffergo/credentials.json`，权限 600 |
| 内容 | WordPress 应用密码，等同该账号权限，后台可随时撤销 |
| 读取方 | CLI 进程内；命令没有、也不该有导出明文的参数 |
| 输出 | 响应里不含密码（单测断言 `JSON.stringify(结果)` 不含密码原文） |

不要绕过这条命令去 `cat` 这个文件、再自己拼 Basic 头。那样密码就进了对话、日志和模型上下文，而应用密码在撤销前一直是有效的。

## 7. 存量兼容（实测）

Skill 更新后，老客户**不需要重新登录、不需要迁移文件**。依据：

- 存储位置、文件格式、解析顺序都没有改动。格式同时接受多站 `{ "sites": { ... } }` 和早期单站 `{ siteUrl, username, appPassword }`。
- 实测：用本机真实凭据（8 个站点）跑产物文件 `api GET /wp-json/wp/v2/users/me --site <站点>`，返回 200；`site setup` 用同一份凭据同样正常。
- 实测：把同一个站点的真实凭据改写成早期单站格式，用 `--config` 指向它，`api GET` 同样返回 200。老格式不需要迁移。
- 实测：`--config` 指向不存在的文件时返回 `not_logged_in`，不是 `no_site`。
- 裸域名 `--site example.com` 能匹配存成 `https://example.com` 的记录。

**判断凭据是否有效，必须用需要认证的端点。** `/wp-json/wp/v2/types` 这类是公开端点，匿名访问也返回 200——用它测出 200 不能说明密码有效（实测：撤销密码后打 `/wp-json/wp/v2/types` 仍是 200，打 `/wp-json/wp/v2/users/me` 才是 401）。同一个端点上，正确密码 200、错误密码 401，这样对照才算测准。

## 8. 已验证范围与已知边界

已验证：macOS、Node 24、真实 WordPress 站点（Hostinger 主机）；只读 GET、`--yes` 裸写、非法 JSON、写操作拦截、路径拦截、多站与单站凭据、`no_site` / `not_logged_in` 分支。回归测试 22 条。

未覆盖或需注意：

- **没有超时设置**。目标站长时间无响应时命令会一直等，不会自己中断。
- **没有重试**。失败就是失败，重试由调用方决定。
- **不校验响应语义**。`ok: true` 只代表 HTTP 2xx，不代表 WordPress 真的完成了你要的业务动作。
- **未在 Windows 上实测**，也未在 Node 18/20 上实测（代码依赖全局 `fetch`，Node 18 起才有）。
- **未实测**：非 JSON 响应、大文件上传（`--body` 是 JSON 字符串，不适合二进制）。

这些边界当中，前三条是设计取舍，后两条是尚未验证的情形——用之前先按小请求试一次。
