---
name: wordpress-page-builder
description: >-
  Build or edit pages, blog posts, case studies and other content on the user's own WordPress site (PufferGo
  plugin) by writing Tailwind HTML sections. Use when the user says things like "做一个页面 / 写一篇博客 /
  加一个案例 / 改一下首页这一块 / 这段文字换一下 / make a landing page / add a case study / edit this section".
  Not for products (use wordpress-bulk-product-upload). All WordPress operations go through the bundled
  `puffergo` script; the site password never enters the chat.
---

# WordPress 页面与区块

你帮客户在他自己的 WordPress 网站上做新页面（也可以是博客文章、案例等），或者改已有页面里的某一块。你负责写内容和 Tailwind HTML；`puffergo` 脚本负责检查、编译、上传图片、写入网站，并持有网站凭据。网站上每一段（section）是一个 PufferGo 区块，客户之后也能在 WordPress 编辑器里改它。

产品不在这里做，客户要上架或修改产品，用 wordpress-bulk-product-upload 技能。

## 开场

客户已经说了要做什么就直接做，不要先问。只有他没说具体做什么时（「装好了」「这个能干嘛」「帮我用一下」），说这几句再问他要哪个：

- 可以建一个新页面、写一篇博客、加一个案例，也可以查看和修改网站上已有的内容，包括某一块的文字和图片、网址和 SEO 信息。
- 本项目是开源的，代码全部公开透明；你的信息只保存在你自己的电脑上。
- 写到网站上的内容默认是草稿，访客看不到，要你自己说发布才会发布。

## 命令

`node <本技能目录>/scripts/puffergo.mjs <命令>`，下文简写为 `puffergo`。在客户的工作目录里运行，结果是 stdout 上的 JSON。

| 命令 | 作用 |
|---|---|
| `puffergo login <网站地址>` | 在浏览器里授权，只需一次 |
| `puffergo pages types` | 网站能建哪些内容类型（页面、文章、案例…） |
| `puffergo pages find [--type 类型] [--status publish] [--search 词] [--url 链接]` | 找网站上已有的页面、文章，拿到 id 和链接 |
| `puffergo pages blocks <id或链接>` | 列出一个页面的区块：路径、类型、文字摘要 |
| `puffergo pages get <id或链接> [路径]` | 把区块的 HTML 存到 `pages/<id>/block-<路径>.html`（另存一份 `.orig.html` 备份）。不写路径就存整页所有能改的区块 |
| `puffergo pages create --type <类型> --title "标题" --slug <网址> --seo-title "…" --seo-description "…" --focus-keyword "…" [--keywords "长尾词1, 长尾词2"] [--featured-image <图片>] [--excerpt "摘要"] <文件或文件夹>…` | 建一个草稿（访客看不到），每个文件是一段 |
| `puffergo pages seo <id或链接> [--slug …] [--seo-title "…"] [--seo-description "…"] [--focus-keyword "…"] [--keywords "…"] [--featured-image <图片>] [--customer-said "客户原话"]` | 不带参数是查看网址、SEO 标题、描述、关键词、特色图和 Rank Math 评分；带参数是修改 |
| `puffergo pages preview <id或链接> <路径> <文件>` | 在整页里预览改过的这一块，不写入网站，随时可以用。只在改已发布页面之前用 |
| `puffergo pages replace <id或链接> <路径> <文件> [--customer-said "客户原话"]` | 用文件替换这个区块。已发布的页面要带客户同意上线的原话 |
| `puffergo pages publish <id或链接> --customer-said "客户原话"` | 发布草稿。只有客户明确说「发布」「上线」时才用 |
| `puffergo pages edit-live on --customer-said "客户原话" / off` | 一次改很多已发布页面时用：打开后所有已发布的页面和产品都能改，改完马上关 |

没有删除命令，客户要删页面或区块，请他在 WordPress 后台操作。

## 准备

`node -v` 低于 18 或没装，你自己装最新 LTS（macOS `brew install node` 或 nodejs.org 的 .pkg，Windows `winget install OpenJS.NodeJS.LTS`），系统弹窗要密码请客户自己输。然后运行 `pages types`；提示未登录就问网站地址，运行 `puffergo login <地址>`，请客户在浏览器里批准后再跑一次。报 `no_site`（这台电脑登录过几个网站，没选是哪个）：客户说过网站地址，就把那条命令加上 `--site <地址>` 再跑，之后在这个文件夹里会记住，不用每次都加；没说过，把 `sites` 列给客户问是哪一个，不要自己挑。报 `update_plugin`（网站的 PufferGo 插件或 WordPress 太旧）或 `update_skill`（本技能太旧），把 `message` 转告客户，等他升级好再继续。

## 做新页面

新页面一律先建成**草稿**（访客看不到），客户在 WordPress 编辑页里看效果，可以自己动手改，也可以让你改。**客户没明确说「发布」「上线」，你就不发布。**要问客户的事攒在一起，在发编辑链接的那一条消息里一次问完。

发给客户的链接（`editUrl`、`previewUrl`）照脚本输出原样给，不要把 `&` 写成 `&amp;`。客户要在打开链接的浏览器里登录过 WordPress 后台才能看。

1. **问做什么**：客户没说清楚要做哪种内容，就把 `pages types` 里 `canCreate` 为 true 的类型用它们的 `label` 列给客户选（如 页面 / 文章 / 案例）。再问清这一页的目的、内容和素材（文字、图片、数据）。
2. **写段落**：一段一个文件，放在 `pages/<英文短名>/` 里，按顺序命名 `01-hero.html`、`02-features.html`…（写法见下面「HTML 规则」）。客户给的图片复制到同一文件夹的 `images/` 里，HTML 里写相对路径 `images/xxx.jpg`，脚本会自动上传。
3. **定好 SEO 信息**：建之前要有这几样，客户没给就问他，或者和他商量定下来：
   - **网址 `--slug`**：小写英文和数字，用 `-` 连接，简短、说清这一页是什么，如 `gate-valves-vietnam-water-plant`。
   - **SEO 标题 `--seo-title`**：搜索结果和分享卡片上的标题。要带网站名就自己写进去，脚本不会自动加。
   - **SEO 描述 `--seo-description`**：搜索结果里标题下的那段话，写客户给的真实信息。
   - **长度只是建议**：建议区间在输出的 `seo.limits` 里（`titleRecommended`、`descriptionRecommended`），按宽度算，中日韩文字每个字算 2，英文字母、数字、空格算 1。不在区间时 `seo.checks` 会提示 `too_short` / `too_long`，告诉客户即可；客户就想要这个长度就照他的，不用改。
   - **核心关键词 `--focus-keyword`**：这一页最想被搜到的一个词，如 `gate valves`。
   - **长尾关键词 `--keywords`**（可选）：最多 5 个，用英文逗号隔开，如 `"water plant valves, vietnam valve supplier"`，不要和核心词重复。
   - **特色图 `--featured-image`**：文章、案例这类会显示在列表页和分享卡片上，问客户要一张；页面可以不要。
   - 核心关键词要出现在 SEO 标题、SEO 描述、网址、页面大标题（H1）和正文开头里。
4. **建草稿**：`pages create --type <类型> --title "标题" --slug … --seo-title "…" --seo-description "…" --focus-keyword "…" [--keywords "…, …"] [--featured-image images/cover.jpg] pages/<短名>`。文章、案例这类可以加 `--excerpt` 写一句摘要。以下情况什么都不会写入网站，改好再运行：
   - 报 `invalid_sections`：按 `errors` 里每条的 `file` 和 `message` 改文件。
   - 报 `invalid_seo`：`slug_taken` 是网址被网站上别的内容占了（`message` 里写了是哪个），换一个；`keyword_repeated` 是长尾词和核心词重复了；`no_seo_plugin` 是网站没装 SEO 插件，请客户装好启用 Rank Math SEO（或 Yoast SEO）。
5. **处理提醒**：结果里 `seo.checks` 列出核心关键词还缺在哪些地方（`where`：`seoTitle` / `seoDescription` / `slug` / `h1` / `intro`），能补的补上：段落里的按下一节改区块，SEO 标题和描述用 `pages seo` 改，草稿的网址也可以用 `pages seo` 改。`warnings` 有 `unsupported_claim` 的，是客户没说过的说法：在段落里的，按下一节「改已有页面的一块」把那几段改掉（草稿上改不用预览）；在 `--seo-title` / `--seo-description` 里的，用 `pages seo` 改掉。段落在页面上的路径就是它的顺序：`01-*.html` 是 `1`，`02-*.html` 是 `2`…
6. **给客户看**：把 `editUrl` 发给客户，说明这是草稿，请他看电脑和手机两种宽度（编辑页右上角可切换预览），可以直接在编辑页里改，也可以告诉你要改什么。满意了可以自己在后台点「发布」；他让你发布，就先 `pages get <id>` 看一眼当前内容，再 `pages publish <id> --customer-said "客户原话"`。「改」「推」「更新」不算让你发布。报 `post_locked` 请他先保存关掉编辑页，报 `conflict` 就重新 `pages get` 给他看一遍再发布。Rank Math 的 SEO 评分在客户打开编辑页时才算出来（编辑页顶部的 Rank Math 按钮），保存一次后 `pages seo` 里的 `score` 才有值。
7. **之后再改**：一律走下一节「改已有页面的一块」，不要再 `create`：同一批文件再运行会报 `already_created`（带已建好的 `id`）。只有客户明确要再建一个单独的副本，才加 `--new`。客户可能已经在编辑页里改过，所以每次都先 `pages get` 拿最新的内容再改，不要用 `pages/<短名>/` 里的旧文件。

## 改已有页面的一块

1. **找到页面**：客户给了链接就直接用；没给就 `pages find --search 词`（或加 `--type`）找，拿不准是哪一页就列出来问客户。
2. **找到那一块**：`pages blocks <id或链接>`，按每块的 `text` 找客户说的那一块，拿不准就把几块的文字列出来问客户。
   - `kind` 是 `static`（静态区块）和 `config`（配置型组件）的能在这里改。
   - `other`（WordPress 自带区块）：告诉客户请他在 WordPress 编辑器里改。
   - 报 `not_block_content`：整页都不是区块做的（经典编辑器或页面构建器），见下面的报错表。
3. **取出整页，只改一块**：`pages get <id>`（不写路径）把整页能改的区块都存下来，`notSaved` 里是存不了的块的文字。配置型组件存成 `block-<路径>.json`：只改 `data`，写法见 `references/blocks/blocks.md`「配置型组件」。预览、替换用法和 `.html` 一样，把文件换成这个 `.json`。先把其他块都看一遍，改的这一块要和它们协调：沿用它们的颜色、字号、间距、按钮样式。然后只改要改的那个文件，只改客户要改的地方；其他文件只作参考，不要改，也不要替换。
4. **已发布的页面先预览**：页面 `status` 是 `publish`（已上线）或 `future`（定时发布）的，替换后访客马上看到，所以先 `pages preview <id> <路径> pages/<id>/block-<路径>.html`。它打开的是这个页面本身，只有这一块换成了新的，线上页面不变。把 `previewUrl` 给客户看（要登录后台，7 天内有效；同一块再预览会覆盖上一次），客户可以来回改，预览多少次都行，线上页面一直不变。草稿不用预览，直接替换，让客户在编辑页里看。
5. **替换**：`pages replace <id> <路径> pages/<id>/block-<路径>.html`，把 `editUrl` 发给客户看效果。已发布的页面，客户看完预览说可以（「可以」「换上去」「上线吧」），这句话就是同意，不用再问一遍，替换时加 `--customer-said "客户原话"`。只对这一次、这一页有效，不用开关任何东西。客户没表态就不要替换。
   - 客户要一次改很多已发布的页面（比如每篇文章的同一块），才用 `pages edit-live on --customer-said "客户原话"`，改完马上 `pages edit-live off`，中间报错也要记得关。这个开关打开期间所有已发布的页面和产品都能改。
   - 报错怎么办：

     | 错误 | 意思 | 谁处理 | 怎么做 |
     |---|---|---|---|
     | `live_locked` | 页面已上线，没带客户的同意 | 你 | 给客户看预览，他同意后带 `--customer-said "原话"` 重试 |
     | `post_locked` | 这一页正开在 WordPress 编辑器里，现在改，客户一保存就会冲掉你的改动 | 客户 | 请客户在编辑器里保存并关掉这一页，最多等两三分钟再重试 |
     | `conflict` | 你取出之后页面被改过（客户可能在后台动过） | 你 | 重新 `pages get`，在新文件上把改动重做一遍 |
     | `slug_locked` | 已上线页面的网址不改，客户同意了也不改 | 客户 | 见下一节第 4 条 |
     | `not_block_content` | 这一页是用经典编辑器或 Elementor 等页面构建器做的，内容这里改不了 | 客户 | 把 `message` 转告客户，请他在原来的编辑器里改（`editUrl`）；SEO 标题、描述、关键词、特色图照常用 `pages seo` 改 |
   - 客户后悔了：`get` 时原样存了一份 `pages/<id>/block-<路径>.orig.html`，用它再 `replace` 一次就恢复了。结果里 `revision` 为 true 的，客户也可以在编辑器的「修订」里自己恢复。

## 改网址、SEO 标题、描述、关键词、特色图

1. `pages seo <id或链接>` 看现在的值：网址、SEO 标题、描述、核心和长尾关键词、特色图、Rank Math 评分 `score`（没算过是 null），以及 `checks`（核心关键词还缺在哪）。
2. 把要改的列成「现在 → 改成」给客户确认，再 `pages seo <id> --seo-title "…"`（只带要改的项；只改长尾词时核心词不变，反过来也一样）。规则和上面「定好 SEO 信息」一样。关键词缺在正文或大标题里的，按上一节改区块。
3. SEO 没有预览，第 2 步客户确认的那句话就是同意。已发布的页面加 `--customer-said "客户原话"`。报 `conflict` 就重新 `pages seo <id>` 再改，其他报错看上一节的表。
4. **已发布页面的网址不改**：搜索引擎收录的、别处链过来的都是这个网址，改了旧链接会失效。报 `slug_locked` 时（带了客户原话或开了 edit-live 也一样），把 `message` 转告客户：真要改，请他在 WordPress 后台自己改，并加上旧网址到新网址的跳转。标题、描述、关键词、特色图照常可以改。草稿的网址可以随便改。

## HTML 规则

写或改 HTML 之前，先读 `references/blocks/static.md`（静态区块的写法），页面里各种区块是什么见 `references/blocks/blocks.md`。这里只补页面特有的两条：

- **链接**：网站上已发布页面的地址，用 `pages find --status publish` 查到的 `link`。
- **类型的版式**：`pages types` 里 `layout` 是 `fullWidth` 的（页面），段落就是整页，第一段通常是标题大图。`inTemplate` 的（文章、案例等），网站模板已经有标题、特色图和导航，段落放在文章栏里：不要再写一个带标题的大 hero，多用 `max-w-focus`，以正文、图片、要点为主。

## 内容规则

- 公司信息、数据、客户名称、认证、价格只来自客户，没给就问，不编。也不加客户没说过的评价，如 leading、best、top、state-of-the-art、world-class。
- 产品名和行业术语照客户的原意准确翻译（例如 截止阀 是 globe valve，止回阀 才是 check valve）；拿不准的，过目时把中英对照列给客户确认。
- 文案用英文（客户另有要求除外），和客户对话用客户的语言。

## 安全

网站凭据在客户电脑的 `~/.puffergo/credentials.json`，只有脚本读它，你不要打开，也不要把内容贴进对话。你不直接请求 WordPress，一律通过 `puffergo`。
