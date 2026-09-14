# Silo Vault 文件契约 (草案 v0)

> 这是 AI 工具(Claude Code / Cursor / Codex / Qoder)与 Silo 之间的**唯一接口**:
> 一个内容 = vault 里一个 markdown 文件。frontmatter 由 **Silo 拥有**,正文由 **AI 工具撰写**。
> 将来应固化成 silo-core 的一个 schema 模块(扩展/Obsidian/CLI/web 四宿主共用)。

## 目录结构 = silo 树

```
~/.puffergo/credentials.json       # 站点 + App Password，vault 之外(品牌目录)，绝不随笔记同步/发布
<vault>/
  .silo/workspace.json             # SiloWorkspace(隐藏)
  <pillar 关键词>/
    <cluster 关键词>/
      <content-slug>.md            # 一篇内容
```
文件夹层级 = 关键词 pillar → cluster 层级。文件放在它所属节点的文件夹下。**凭据不在 vault 里**——放在
`~/.puffergo/credentials.json`(按 siteUrl 分站点)，避免随 Obsidian Sync/Publish 外泄。可用 `--config <path>`
或环境变量 `PUFFERGO_CONFIG` 覆盖；旧版 vault 内 `silo.config.json` 用 `silo migrate-config` 一键迁出。

## 单篇 frontmatter(字段对齐 ContentItem + Seo)

**可编辑字段扁平化**:Obsidian 属性面板只支持 Text/List/Number/… 等原生类型,**不支持嵌套对象**(嵌套只能在源码模式看,面板里只读)。所以用户/agent 可编辑的内容字段(`title`/`slug`/`seoTitle`/`seoDescription`/`coreKeywords`/`longTailKeywords`/`internalLinks`/`externalLinks`)都是**扁平原生类型**,面板里可直接改;系统所有的 `silo:`/`wp:` **保留嵌套**——正好被 Obsidian 渲染成只读,当护栏防误改。

```yaml
---
silo:                    # ⚠️ 系统所有(嵌套=Obsidian 只读)，勿改
  id: c_a1b2c3           # 稳定内容 id
  node: "solar street light / how it works"   # silo 路径(pillar/cluster)
  postType: post         # 站点真实类型(post/page/product/...)，由 Silo 决定
title: "How Do Solar Street Lights Work?"
slug: how-do-solar-street-lights-work     # 留空则 WP 生成
purpose: "承接'原理'类信息意图，把权重导向支柱页"   # 这篇的目的(对齐 Step3)，可编辑，不推 WP
seoTitle: "How Solar Street Lights Work | Brand"   # 30–60 字符
seoDescription: "A clear guide to ..."             # 120–160 字符
coreKeywords:            # 恰好 1 个
  - "solar street light"
longTailKeywords:        # ≤ 4 个（核心+长尾 总数 ≤ 5）
  - "how do solar street lights work"
internalLinks:           # 规划的内链目标(正文里也要以 [[wikilink]] 出现)
  - "[[solar-street-light-guide-africa]]"
externalLinks:           # 引用的站外权威源(只记录，人工确认)
  - "https://example.org/standard"
status: draft            # draft | publish(发布权归人)
wp:                      # ⚠️ 运行时事实，系统所有(嵌套=Obsidian 只读)，勿改
  postId: null           # 入库后由 Silo 回填
  link: null
---

<!-- 正文从这里开始，由 AI 工具撰写 -->
```

## 铁律(写进 SKILL.md 交给 agent)

1. **字段归属**:`silo:` 和 `wp:` 归 Silo(嵌套=Obsidian 只读),**绝不修改**;`title/slug/seoTitle/seoDescription/coreKeywords/longTailKeywords/internalLinks/externalLinks` 可编辑;**正文完全归 agent**。
2. **frontmatter 是内容字段的事实源**:一旦笔记存在,`push` 会先把上述可编辑字段从 frontmatter **读回** workspace 再推——所以在 Obsidian 里改 SEO/关键词会真正生效。改完 `silo push` 即可。
3. **内链 = wikilink**:正文里用 `[[slug]]` 链到兄弟篇(Obsidian 原生图谱渲染)。**push 时由 body-codec 胶水层自动把 `[[slug]]` 解析成目标文章的真实 WP 永久链接** `<a href>`——所以线上是正常链接,不是中括号文本。目标还没推送时本次降级为纯文本,下次 push 自动补链。不要硬塞裸 URL 内链。
4. **图片 = 本地引用**:正文里用 `![alt](本地图.png)` 或 Obsidian 嵌入 `![[本地图.png]]`(图放笔记同目录或 vault 根)。**push 时自动上传到 WP 媒体库**,并把引用改写成线上 media 地址(笔记也改写,Obsidian 可预览;再次 push 不重复上传)。远程 URL / `data:` 引用原样保留。
4. **SEO 约束**:seoTitle 30–60、seoDescription 120–160;coreKeywords 恰好 1 个、longTailKeywords ≤ 4(总数 ≤ 5);核心词进 seoTitle 和正文首段。
5. **发布只经 CLI**:agent 不自己读 `silo.config.json`、不自己调 WP;发布一律 `silo push`(密码只由 CLI 碰)。
6. **不覆盖正文**:对已存在的内容,Silo 推送只更新 SEO/结构,绝不覆盖正文——所以正文的事实源是这个 md 文件。
