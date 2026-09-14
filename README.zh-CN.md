# PufferGo WordPress AI 智能体

给外贸独立站的 WordPress AI 智能体：用 Codex、Claude Code 等 AI 工具对话式批量上架产品、规划 SEO Silo。

- **网站是你的，凭据也只在你电脑上。** AI 看不到你的 WordPress 密码。在浏览器里一键授权后，应用密码只保存在你电脑的 `~/.puffergo/credentials.json`（仅本人可读），只有自带的脚本会读它。
- **用代码校验，而不是靠提示词。** 每个产品写入前，脚本和你的网站都会检查一遍。错误以结构化 JSON 返回（`path`、`code`、`message`、`fix: "ai" | "user"`），AI 能改的自己改，需要你确认的会停下来问你。
- **默认存草稿，永远不删除。** 发布必须有你亲口说「发布」；没有删除命令。

## 包含什么

| | |
|---|---|
| `skills/wordpress-bulk-product-upload` | 把产品照片和资料整理成产品页（标题、参数、价格/起订量/交期、图库、图文详情），推送为草稿，之后可以接着改，你说发布才发布。 |
| `skills/wordpress-seo-silo` | 把网站定位展开成关键词和支柱/集群结构，写文章，带 Rank Math 标题、关键词和内链推送为 WordPress 草稿，并做 SEO 体检。 |
| `packages/cli` | 两个 Skill 共用的 `puffergo` 命令（打包进每个 Skill 的 `scripts/puffergo.mjs`，Node 18+，无依赖）。 |
| `packages/silo-core` | `@puffergo/silo-core`：Silo 数据模型、WordPress REST 客户端、同步和体检。 |

## 需要

- Node.js 18 或更新版本。
- 一个你有管理员权限的 WordPress 网站。
- **上架产品**需要安装 PufferGo WordPress 插件（提供产品类型和校验接口）。
- **SEO Silo** 需要 Rank Math 写 SEO 字段；导入已有关键词需要 PufferGo 插件。

## 安装 Skill

把 `skills/` 下的文件夹复制到 AI 工具的 skills 目录，例如 Claude Code 的 `~/.claude/skills/`（所有项目）或 `<项目>/.claude/skills/`。然后直接说：

> 把桌面 pg-500 文件夹里的照片上架成新产品：PG-500 Industrial 3D Printer，成型尺寸 500×500×500 mm，起订量 1 台，交期 15–25 天，先存草稿。

第一次使用会在浏览器打开 WordPress，点一次「批准」即可。

## 许可

MIT
