# Silo CLI 命令速查

`silo` 是一套普通终端命令(Node 程序),**运行不消耗任何 AI token**。你可以自己在终端直接跑,也可以让 AI 工具(Claude Code/Cursor)通过 bash 帮你跑。只有让 AI **生成**关键词/架构/正文时才产生模型推理成本;**运维类操作(推送/拉取/体检)完全免费**。

> 约定:下面用 `silo` 代表 `puffergo silo`(打包后的 `puffergo` 命令,即 Skill 里的 `scripts/puffergo.mjs`)。所有命令默认作用于当前目录(vault),可用 `--dir <path>` 指定。

## 谁消耗 token?

| 动作 | 由谁做 | 消耗 AI token |
|---|---|---|
| 规划关键词 / 设计 silo / 写正文 / 定 SEO | AI(Skill,模型推理) | ✅ 是(生成成本) |
| 下面所有 `silo` 命令 | 用户或 agent 在终端执行 | ❌ 否 |

## 命令表

| 命令 | 作用 | 消耗 token |
|---|---|---|
| `silo init --name "站点名" --url "http://site" [--tagline "定位"]` | 在当前目录建工作区(`.silo/workspace.json`) | ❌ |
| `silo plan <plan.json>` | 应用 AI 出的计划:建关键词/节点/内容,按 silo 路径写出 `.md`(含 `purpose`);幂等(重跑不重复) | ❌ |
| `silo push [--force]` | 把正文+SEO+分类推成 WP 草稿。顺带:内链 `[[笔记文件名]]`→真实永久链接、本地图片→上传 WP 媒体库、frontmatter 编辑读回、回写 `wp.postId/link` | ❌ |
| `silo pull [--types post,page]` | 从 WP 拉回内容,更新工作区并刷新 `.md` | ❌ |
| `silo health` | 健康检查(孤岛页/自噬/缺 SEO/关键词超限/标题描述长度…) | ❌ |
| `silo status` | 概览:节点/内容/关键词/待推送/健康问题数 | ❌ |
| `silo view [--no-open] [--out <path>]` | 生成只读预览页(关系图 + 结构树)并用系统默认浏览器打开。默认写到临时目录(不进 vault,避免随同步/Git 走);`--out` 指定留存路径,`--no-open` 只写文件 | ❌ |
| `silo migrate-config` | 把旧版 vault 内 `silo.config.json` 迁到 `~/.puffergo/credentials.json` 并删除 vault 副本 | ❌ |

### 通用选项
- `--dir <path>` — 指定 vault 目录(默认当前目录)。
- `--site <域名>` — vault 连了多个站点时指定操作哪个(默认读 `.silo/state.json` 的活动站点)。
- `--config <path>` / 环境变量 `PUFFERGO_CONFIG` — 指定凭据文件(默认 `~/.puffergo/credentials.json`)。

## 凭据(一次性,在 vault 之外)

凭据**不放 vault 里**(避免随 Obsidian Sync/Publish 外泄),放品牌目录 `~/.puffergo/credentials.json`,按站点分:

```json
{
  "sites": {
    "https://example.com": { "username": "admin", "appPassword": "xxxx xxxx xxxx xxxx" }
  }
}
```
> App Password 在 WP 后台「用户 → 个人资料 → 应用程序密码」生成。CLI 只读它、绝不打印、绝不进 AI 对话。

## 典型工作流

**A. 让 AI 从零生成一个站的内容(耗 token 的只有生成)**
```bash
silo init --name "太阳能出海站" --url "http://site"
# AI 依据定位产出 plan.json（模型推理，耗 token）
silo plan plan.json
# AI 逐篇写正文进 .md（模型推理，耗 token）
silo push          # 推 WP 草稿（免费）
silo health        # 体检，按提示让 AI 修（修正耗 token，跑命令免费）
```

**B. 日常运维(完全不碰 AI,零 token)**
```bash
silo status        # 看现状
silo push          # 你在 Obsidian 里改了 SEO/关键词/正文/图片后，一键同步
silo pull          # 从 WP 拉回最新（发布后拉一次，内链自动升级成漂亮永久链接）
silo health        # 定期体检
```

**C. 发布后升级内链为漂亮永久链接**
草稿的永久链接是 `?p=ID`;文章**发布后**跑:
```bash
silo pull          # 拉回已发布文章的漂亮永久链接
silo push          # 用新永久链接重写正文内链（根相对、无域名）
```
