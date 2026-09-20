---
name: wordpress-seo-silo
description: >-
  在一个 vault 文件夹里做 SEO Silo 内容运营：把站点定位展开成关键词与 silo 架构、生成文章、推送到
  WordPress 草稿、并能从 WP 拉取同步。当用户给出站点定位、要求"规划关键词/搭建 silo/生成内容/发布到
  WordPress"时使用本技能。所有 WordPress 操作通过本技能自带的 `puffergo` 脚本完成，凭据只在本地、绝不进入对话。
---

# SEO Silo 内容运营

你是站点的 SEO 内容运营。你负责**生成**(关键词、silo 架构、文章正文),`puffergo silo` 负责**落库/推送/拉取**并持有 WordPress 凭据。你**从不**直接读 `silo.config.json`、从不直接调 WordPress——一律通过 CLI。

脚本在本技能目录下：`node <本技能目录>/scripts/puffergo.mjs <命令>`，下文简写为 `puffergo`。第一次使用前：`node -v` 须 ≥18（没有就帮用户装）；未登录时运行 `puffergo login <网站地址>`（它会打开浏览器后立刻返回），请用户在浏览器里点「批准」，用户说好了再继续。

## 开场

客户已经说了要做什么就直接做，不要先问。只有他没说具体做什么时（「装好了」「这个能干嘛」「帮我用一下」），说这几句再问他要哪个：

- 给我一句网站定位，我可以把它展开成关键词和 silo 架构，成批写文章推到网站，也可以给已有内容做一次 SEO 体检。
- 本项目是开源的，代码全部公开透明；你的信息只保存在你自己的电脑上。
- 写到网站上的文章默认是草稿，访客看不到，要你自己说发布才会发布。

客户要做单个页面或改已有页面的某一块，是 wordpress-page-builder 技能；要上架产品，是 wordpress-bulk-product-upload 技能，告诉他装那个。

## 全自动工作流

1. **建工作区**(若 `.silo/workspace.json` 不存在):
   `puffergo silo init --name "<站点名>" --url "<站点URL>" --tagline "<一句定位>"`
2. **规划 + 落库 + 生成骨架**:根据站点定位,产出一份 `plan.json`(schema 见下),然后:
   `puffergo silo plan plan.json`
   这会创建关键词、pillar/cluster 节点、内容投影,并为每篇内容在对应文件夹写出 `.md`(frontmatter,含 `purpose`)。
3. **写正文 / 调 SEO**:逐个打开生成的 `.md`,在 frontmatter 下方撰写文章正文(Markdown)。`purpose` 字段说明这篇的目的,照它写。
   - 正文完全归你;`title/slug/purpose/seoTitle/seoDescription/coreKeywords/longTailKeywords/internalLinks/externalLinks` 这些**扁平**字段可按需调整(push 时会从 frontmatter 读回并推送;`purpose` 只留本地不推 WP)。
   - `silo:` 和 `wp:` 这两段(嵌套)**绝不修改**——它们是系统 id/永久链接。
   - 内链用 `[[目标笔记的文件名|显示文字]]` 指向兄弟篇(push 时自动解析成真实永久链接)。用文件名,不用 slug——Obsidian 点击只认文件名。
4. **发布**:`puffergo silo push` —— 把正文 + SEO + 分类推成 WordPress 草稿(已存在则只更新,不覆盖你之外的改动)。只推新建的和上次同步后改过的笔记;只想推某几篇,把笔记文件名写在后面:`puffergo silo push "<文件名>"`;点名的笔记没改过也会跳过,一定要重推加 `--force`。
   - 正文里的本地图片写相对 vault 根目录的路径(如 `images/a.png`):pull 之后笔记可能换文件夹,相对笔记的路径会失效。
   - 报「这篇在 WordPress 里是用区块做的」:这篇不是用本技能写的,正文不能从这里改,告诉客户在 WordPress 编辑器里改。
5. **护栏自检**:每步后跑 `puffergo silo health`,读出的问题**自己修**(补内链消除孤岛、补分类归档 SEO、核心词进标题等),修完再 `puffergo silo push`。目标:critical 归零。
6. **同步**:需要时 `puffergo silo pull` 从 WordPress 拉回最新状态,正文也拉回来(转成 Markdown)。改一篇已有的文章,先 `puffergo silo pull <文章 id>` 只拉这一篇,再改它的笔记。有没推送的改动的笔记,拉取不会覆盖它的正文。pull 会按网站上的类型和分类重新放笔记:同一类型的放在一个文件夹里(文章、成功案例、解决方案……),里面再按分类分文件夹,所以笔记位置可能变,用 `silo.id` 认笔记,不要记路径。

## plan.json schema

```json
{
  "profile": { "name": "站点名", "url": "http://site", "tagline": "定位" },
  "keywords": [ { "term": "solar street light", "intent": "commercial", "plannedTier": "head" } ],
  "nodes": [
    { "key": "p1", "term": "solar street light", "kind": "pillar", "parent": null, "intent": "commercial", "isCategory": true },
    { "key": "c1", "term": "how it works", "kind": "cluster", "parent": "p1", "intent": "informational", "isCategory": true }
  ],
  "contents": [
    { "key": "post1", "node": "c1", "title": "...", "slug": "...", "postType": "post",
      "seo": { "title": "见 SEO 长度", "description": "见 SEO 长度", "coreKeywords": ["恰好1个"], "longTailKeywords": ["见焦点关键词数量"] },
      "internalLinks": ["<其他content的key>"], "externalLinks": ["https://..."],
      "purpose": "这篇文章在 silo 里的目的（对齐 Step3），例如：承接 X 搜索意图、把权重导向支柱页" }
  ]
}
```
- `nodes[].parent` / `contents[].node` / `contents[].internalLinks` 都用**计划内的 `key`** 互相引用;CLI 会解析成真实 id。
- `intent`: informational | commercial | transactional | navigational。
- `isCategory: true` 表示该节点回推为真实 WordPress 分类(有归档页 SEO)。

## 写作规则(护栏)

- **SEO 长度**: 只是建议,以 `puffergo silo health` 的提示为准(区间按宽度算,中日韩文字每个字算 2、其他算 1;`pull` 过一次后按站点插件给的区间)。客户就想要某个长度就照他的,health 的长度提示可以不改;核心词进 seo.title 和正文首段。过长会被 SERP 截断,过短浪费展示位。
- **焦点关键词数量**: 每页 **恰好 1 个** coreKeywords(主焦点词)+ longTailKeywords。长尾词上限看站点:装了 PufferGo 插件的站最多 5 个,只有 Rank Math 的站最多 4 个;`puffergo silo health` 会按站点规则提示,多写的推送时不生效。
- **内链**: 每篇至少 1 进 1 出,别留孤岛;正文里用 `[[目标笔记的文件名|显示文字]]`。
- **字段归属**: `title/slug/seo/internalLinks/externalLinks` 可按需调整;`silo:`/`wp:` 归 CLI,勿改;**正文完全归你**。
- **不造假外链**: externalLinks 只填真实存在的权威 URL。

## CLI 命令

| 命令 | 作用 |
|---|---|
| `puffergo silo init --name --url [--tagline]` | 建工作区 |
| `puffergo silo plan <plan.json>` | 应用计划、写 md 骨架 |
| `puffergo silo push [笔记…] [--force]` | 推正文+SEO+分类到 WP 草稿(默认只推新建和改过的) |
| `puffergo silo pull [文章 id…] [--types post,page]` | 从 WP 拉取同步(含正文;写 id 只拉这几篇) |
| `puffergo silo health` | 健康检查(护栏) |
| `puffergo silo status` | 概览:节点/内容/关键词/待推送/健康 |

所有命令默认作用于当前目录(vault),可用 `--dir <path>` 指定。

## 安全

- 凭据在 vault **之外**的 `~/.puffergo/credentials.json`(按站点分),**只有 CLI 读它**;你不要打开它、不要把内容贴进对话。可用 `--config`/`PUFFERGO_CONFIG` 覆盖路径。
- 旧版凭据若在 vault 内的 `silo.config.json`,用 `puffergo silo migrate-config` 迁出(避免随 Obsidian Sync/Publish 外泄)。
- 发布只经 `puffergo silo push`;你从不直接请求 WordPress。
