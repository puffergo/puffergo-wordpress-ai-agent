# PufferGo WordPress AI 智能体

给外贸独立站的 WordPress AI 智能体：用 Codex、Claude Code 等 AI 工具对话式批量上架产品、建页面和改页面、规划 SEO Silo。

📖 **图文教程：[用 AI 上传网站产品](https://puffergo.com/docs/ai-product-upload/)**——在豆包、千问、WorkBuddy、Claude Code、Codex 里安装 Skill，连接网站，核对草稿，发布。

- **网站是你的，凭据也只在你电脑上。** AI 看不到你的 WordPress 密码。在浏览器里一键授权后，应用密码只保存在你电脑的 `~/.puffergo/credentials.json`（仅本人可读），只有自带的脚本会读它。
- **用代码校验，而不是靠提示词。** 每个产品写入前，脚本和你的网站都会检查一遍。错误以结构化 JSON 返回（`path`、`code`、`message`、`fix: "ai" | "user"`），AI 能改的自己改，需要你确认的会停下来问你。
- **默认存草稿，永远不删除。** 发布、改已经上线的内容，都必须有你亲口同意；没有删除命令。

## 包含什么

| | |
|---|---|
| `skills/wordpress-bulk-product-upload` | 把产品照片和资料整理成产品页（标题、参数、价格/起订量/交期、图库、图文详情），推送为草稿，之后可以接着改，你说发布才发布。 |
| `skills/wordpress-page-builder` | 用 Tailwind 分段建页面、文章、案例草稿，带 SEO 标题、描述和关键词；预览后改已有页面的某一块；改 SEO 信息。 |
| `skills/wordpress-seo-silo` | 把网站定位展开成关键词和支柱/集群结构，写文章，带 Rank Math 标题、关键词和内链推送为 WordPress 草稿，并做 SEO 体检。 |
| `packages/cli` | 所有 Skill 共用的 `puffergo` 命令（打包进每个 Skill 的 `scripts/puffergo.mjs`，Node 18+，无依赖）。 |
| `packages/silo-core` | `@puffergo/silo-core`：Silo 数据模型、WordPress REST 客户端、同步和体检。 |

## 需要

- Node.js 18 或更新版本（没有的话 AI 会自己装）。
- 一个你有管理员权限的 WordPress 网站。
- **上架产品**需要安装 PufferGo WordPress 插件（提供产品类型和校验接口）。
- **建页面**需要安装 PufferGo WordPress 插件（提供 Tailwind 区块和内容接口）。
- **SEO Silo** 需要 Rank Math 写 SEO 字段；导入已有关键词需要 PufferGo 插件。

## 安装 Skill

把这句话发给你的 AI 工具（豆包、千问电脑版先切到「工作」模式；WorkBuddy、Codex、Claude Code 等直接发）：

```text
帮我安装这个技能：https://github.com/puffergo/puffergo-wordpress-ai-agent/tree/main/skills/wordpress-bulk-product-upload
```

AI 会自己下载装好；电脑上没有 Node.js 的话，第一次用时 AI 也会自己装。装好后直接说：

> 把桌面 pg-500 文件夹里的照片上架成新产品：PG-500 Industrial 3D Printer，成型尺寸 500×500×500 mm，起订量 1 台，交期 15–25 天，先存草稿。

第一次使用会在浏览器打开 WordPress，点一次「核准」即可。

连接网站、核对草稿、产品样板、交易信息字段和常见问题，见[图文教程](https://puffergo.com/docs/ai-product-upload/)。

## 参与贡献

欢迎提 Pull Request。这个仓库是从 PufferGo 内部仓库生成的，所以 PR 不会在这里直接合并：维护者会把它导入内部仓库（作者仍然是你），随下一次发布回到这里，然后关闭你的 PR 并附上那次提交的链接。

## 许可

MIT
