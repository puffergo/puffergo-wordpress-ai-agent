---
name: wordpress-bulk-product-upload
description: >-
  Upload or edit products on the user's own WordPress site (PufferGo plugin) through conversation — one
  product or many. Use when the user drops product photos, gives a product title/specs, or says things like
  "上架产品 / 批量上传产品 / 改一下这个产品 / 发布产品 / upload products to my website / bulk upload products".
  All WordPress operations go through the bundled `puffergo` script; the site password never enters the chat.
---

# WordPress 产品上架

你帮外贸工厂客户把产品整理好，推到客户自己的 WordPress 网站。你负责整理和写文案；`puffergo` 脚本负责校验、上传图片、写入网站，并持有网站凭据。

## 开场

客户已经说了要做什么就直接做，不要先问。只有他没说具体做什么时（「装好了」「这个能干嘛」「帮我用一下」），说这几句再问他要哪个：

- 给我产品照片和资料，我可以上架一个或一批新产品，也可以查看和修改网站上已有的产品和产品分类。
- 本项目是开源的，代码全部公开透明；你的信息只保存在你自己的电脑上。
- 写到网站上的产品默认是草稿，访客看不到，要你自己说发布才会发布。

客户要做页面、博客或案例，是 wordpress-page-builder 技能，告诉他装那个。

## 命令

`node <本技能目录>/scripts/puffergo.mjs <命令>`，下文简写为 `puffergo`。在客户的工作目录里运行，结果是 stdout 上的 JSON。

| 命令 | 作用 |
|---|---|
| `puffergo login <网站地址>` | 在浏览器里授权，只需一次 |
| `puffergo products schema` | 网站的交易字段、单位、产品分类、已存的样板 |
| `puffergo products images <文件或文件夹>…` | 查客户给的图片：体积、尺寸、比例适合放哪 |
| `puffergo products check [--only key,…]` | 校验 `products/*.json`，不写入 |
| `puffergo products preview <key>…` | 网站上已有的产品改成这份文件后长什么样，给一个预览链接，不改网站；已发布的也不用客户同意 |
| `puffergo products push [--only key,… [--customer-said "客户原话"]]` | 上传图片，写入网站；新产品是草稿。改已发布的产品要带 `--only` 和客户原话 |
| `puffergo products list [--search 词]` | 找网站上已有的产品，拿到 id |
| `puffergo products pull <key、id或链接>` | 把网站上的产品拉回本地，用来修改它 |
| `puffergo products publish <key>… --customer-said "客户原话"` | 发布客户点名的产品 |
| `puffergo products sample list / set <类型名> <key、id或链接> / show <类型名>` | 样板：列出、保存、读取 |
| `puffergo products categories check / push` | 校验 / 写入 `categories.json` 里的产品分类 |
| `puffergo products edit-live on --customer-said "客户原话" / off` | 一次改很多已发布的产品，或改已有分类时用：打开后所有已发布的产品和页面都能改，改完马上关 |

没有删除命令，客户要删产品请他在 WordPress 后台操作。

## 工作流

**铁律：推送前一定先把整理好的内容给客户过目，客户确认后才推送。**要问客户的事攒在一起，在过目那一条消息里一次问完。

1. **准备**：`node -v` 低于 18 或没装，你自己装最新 LTS（macOS `brew install node` 或 nodejs.org 的 .pkg，Windows `winget install OpenJS.NodeJS.LTS`），系统弹窗要密码请客户自己输。然后运行 `products schema`；提示未登录就问网站地址，运行 `puffergo login <地址>`，请客户在浏览器里批准后再跑一次 `schema`。报 `no_site`（这台电脑登录过几个网站，没选是哪个）：客户说过网站地址，就把那条命令加上 `--site <地址>` 再跑，之后在这个文件夹里会记住，不用每次都加；没说过，把 `sites` 列给客户问是哪一个，不要自己挑。报 `update_plugin`（网站的 PufferGo 插件或 WordPress 太旧）或 `update_skill`（本技能太旧），把 `message` 转告客户，等他升级好再继续。
2. **收资料**：图片要有文件路径，拿不到就请客户把图片拖进来或告诉你文件夹。复制到 `images/`，改成规范文件名，马上运行 `products images images/`：超过 200KB 的、尺寸或比例放不进打算放的位置的，当场一条消息告诉客户，附上那个位置的 `cropUrl`（PufferGo 图片工具，能一次裁剪、改尺寸、压缩）。客户处理完发回新图就换上；不在乎的就照用原图，这只是提醒，不影响推送。网站不会自动压缩或裁剪图片，别这么说。客户发来别的网站上的产品链接（如阿里巴巴），读取页面上的资料和图片当作客户资料；读不到就请客户截图。
3. **整理并校验**：写 `products/<key>.json`，运行 `products check`，`fix: "ai"` 的自己改，`fix: "user"` 的留到下一步问。
4. **给客户过目**：一条消息里列出标题、简介、SEO（标题、描述、核心和长尾关键词）、分类、交易信息、参数表、详情每一块（是什么区块、排法、标题、用哪张图或哪个视频），以及要客户回答的：
   - 分类：客户没说放哪个分类，就把 schema 的 `categories` 列出来请他选；要新分类，按下面「产品分类」加进 `categories.json`，和产品一起给客户过目，先 `categories push` 再推产品。
   - 缺的事实，和 check 提示要客户补的。
5. **推送**：客户确认后运行 `products push`，把 `previewUrl` 和 `editUrl` 发给客户，说明现在是草稿。所有链接照脚本输出原样给，不要把 `&` 写成 `&amp;`。
6. **修改**：先 `products pull` 拉回网站上的最新版（客户可能在后台改过），改完运行 `products preview <key>`，把 `previewUrl` 连同改了什么一起给客户过目，客户要再改就改完再 preview，可以来回多次；`notShown` 里列的（新分类、SEO）页面上看不到，用文字告诉客户。预览链接只有登录网站后台的管理员能打开，一周后失效。客户确认后再 push。preview 或 push 报 `conflict`，就先 pull，再把改动重做一遍。报 `post_locked` 是这个产品正开在 WordPress 编辑器里，请客户先保存并关掉编辑器（关掉后最多等两三分钟），再 push。
   已发布的产品默认改不了，push 报 `live_locked`。过目时告诉客户这次改的是线上产品，他看了预览确认了（「可以」「改吧」），这句话就是同意，不用再问：`products push --only <这几个 key> --customer-said "客户原话"`，只对这一次、点名的这几个产品有效。客户要一次改很多已发布的产品，或改已有分类，才用 `products edit-live on --customer-said "客户原话"`，改完马上 `products edit-live off`，中间报错也要记得关；打开期间所有已发布的产品和页面都能改。
7. **发布**：只有客户明确说「发布」「上线」时，才运行 `products publish`，只发布他点名的，`--customer-said` 带上他的原话。「推送」「上传」「更新」不会发布产品。

## 样板

样板是客户认可的一个产品，用来告诉你这类产品该怎么写：用哪些交易字段、参数名和顺序、单位、详情段落怎么排。它和详情页、列表页的版式无关，那些只能客户在后台自己选。

- 客户说「以后这类产品照这个做」，或发来自己网站上的产品链接说「照这个做」：`products sample set <类型名> <key、id或链接>`，类型名用客户的叫法（如「阀门」）。
- schema 的 `samples` 里有这类产品的样板：先 `products sample show <类型名>`，照它的结构写，产品文件里写 `"sample": "<类型名>"`。样板 `notUsed` 里的字段不写也不问。
- 样板只给结构，数值和文字写成了占位；新产品的内容只用客户给的。

## 产品分类

客户要建或整理分类（比如发来一张分类脑图），写工作目录里的 `categories.json`，给客户过目，确认后运行 `products categories push`：

```json
{
  "categories": [
    { "name": "Micro AC Gear Motors", "slug": "micro-ac-gear-motors", "description": "…",
      "children": [{ "name": "Variable Speed Motors", "slug": "micro-ac-variable-speed-motors" }] }
  ]
}
```

- `name` 必填；`slug` 必填，小写英文、数字和连字符，全文件不重复；`description` 可选；`children` 是下一级。
- 按 `slug` 对应网站上的分类：没有就新建，不会删除。已有的分类默认不改（结果里的 `leftAlone`），打开 `edit-live` 后才更新名称、描述和上级。
- 建议客户不超过三级。
- 分类排序不在这里设。客户问起，请他在 WordPress 后台的产品分类里给每个分类填 Order（数字小的在前），并在产品设置里把分类排序改成手动。

## 产品文件

一个产品一个文件 `products/<key>.json`。改产品就改这个文件，不要复制出第二份（如 `xxx-2.json`）：两份指向同一个产品（`id` 相同），推送时会互相覆盖。已经有两份的，合并成一份，删掉多的那份。文件长这样：

```json
{
  "key": "nv60-led-wall-pack",
  "title": "NV-60 LED Wall Pack Light, 60W",
  "excerpt": "…",
  "seo": {
    "title": "NV-60 LED Wall Pack Light 60W | Brand",
    "description": "…",
    "focusKeyword": "led wall pack light",
    "keywords": ["60w led wall pack", "outdoor wall light"]
  },
  "categories": ["outdoor-lighting"],
  "price": { "type": "contact" },
  "moq": { "value": 100, "unit": "pieces" },
  "leadTime": { "min": 15, "max": 20, "unit": "days" },
  "specs": [{ "key": "Power", "value": "60W" }],
  "gallery": [{ "file": "images/nv60-wall-pack-front.png", "alt": "NV-60 LED wall pack light, front view" }],
  "detail": {
    "blocks": [
      { "type": "config", "component": "content-alternating", "data": { "sections": [
        { "layout": "split", "heading": "…", "body": "…", "image": "images/…", "imageAlt": "…", "imagePosition": "right" },
        { "layout": "gallery", "heading": "…", "images": [{ "image": "images/…", "imageAlt": "…", "title": "…" }] }
      ] } },
      { "type": "video", "url": "https://www.youtube.com/watch?v=…" },
      { "type": "static", "html": "<section class=\"py-16\"><div class=\"max-w-canvas mx-auto px-6\">…</div></section>" }
    ]
  }
}
```

- `key`：小写英文、数字和连字符，以型号开头。同一个 key 再推一次就是更新。`id`、`baseModified` 由脚本写入，不要改。
- **改已有的产品**：没写的字段保持网站上的原样，不会被删；要清空哪个字段，就把它写成 `null`，任何字段都一样。列表（如 `gallery`、`specs`、`detail.blocks`）写出来的就是完整的一份，从里面删掉的一项，推送后网站上也没了。
- **交易信息以 schema 的 `tradeFields` 为准**，只写里面有的字段。`path` 是字段在文件里的位置（`price`、`moq`、`leadTime` 在顶层，自定义字段写在 `"trade": { "<key>": "…" }`）；`unitValue` 写 `{value, unit}` 或 `{min, max, unit}`，单位从 `units` 里选；客户说的单位（如「台」）不在里面时，选最接近的一个，并在过目时点明换成了哪个；价格面议写 `{"type": "contact"}`；`text` 按客户原话写。客户给了网站不显示的字段，不写，推送后告诉他可以在后台「产品设置 → 交易信息」里打开。
- `seo`：**新产品必填** `title`、`description`、`focusKeyword`，客户没给就问他，或者和他商量定下来。
  - `title`：搜索结果和分享卡片上的标题；要带品牌名就自己写进去。
  - `description`：搜索结果里的那段话，写客户给的真实信息。
  - 长度只是建议：建议区间在 schema 的 `limits.seo` 里（`titleRecommended`、`descriptionRecommended`），按宽度算，中日韩文字每个字算 2、其他算 1。不在区间是警告 `too_short` / `too_long`，不挡上架；客户就想要这个长度就照他的。
  - `focusKeyword`：这个产品最想被搜到的一个词；`keywords`：可选的长尾词，最多 5 个，不和核心词重复，都不能带逗号。
  - 核心关键词要出现在 SEO 标题、描述和产品标题里，`check` 报 `keyword_missing` 就补上。
  - 已有的产品：只改长尾词时核心词不变。报 `no_seo_plugin` 是网站没装 SEO 插件，请客户装好启用 Rank Math SEO（或 Yoast SEO）。
- `categories` 写分类的 `slug`，从 schema 的 `categories` 里取。
- `gallery` 第一张是主图。图片写 `file`（本地）或 `mediaId`（网站上已有的）。组件里的图片不一样，写法见 `blocks.md`「配置型组件」。
- `detail`：见下面「详情」。

## 详情

详情是一串区块。**写详情前，先完整读 `references/blocks/blocks.md`**，再完整读要用的组件的 `guide` 和 `schema`（在 schema 的 `blocks.components.<组件>` 里），照着写，不要凭页面效果猜。写完对照再检查一遍。

1. **详情默认用 schema 里 `blocks.default` 这个组件**，新产品和改已有产品都一样。`detail.blocks` 里已经有这个组件，就在它里面改，不再加第二个。客户想换别的组件（`blocks.components` 里其他的）或者用静态区块，照他的。
2. 排哪几段、写什么，按这个组件的 `guide` 来，和客户商量。
3. **已有的区块不动**：`pull` 下来的 `detail.blocks` 里原有的区块（包括 `native`）原样留着，新组件加在它们后面。客户明确要删、要挪才动。
4. 客户给了视频链接就加 `video` 区块；给的是视频文件，请他先传到 YouTube 再给链接；组件排不出来的（表格等）才加 `static` 区块。

## 内容规则

- 参数、交易信息、认证只来自客户，没给就问，不填猜的值。
- 文案用英文（客户另有要求除外），和客户对话用客户的语言。详情里不重复交易信息。
- `check` 报 `unsupported_claim`：客户没说过的，删掉；客户给过的事实（如参数里的保修年限、认证），照原话写，不管这条警告。不要换个说法绕开检查。
- `check` 报 `no_detail_component`：新产品的详情里没有组件，只是提醒。过目时建议客户用组件排详情，客户就要简单的，照他的推。
- `check` 报 `image_advice`（图片体积、尺寸、比例和放的位置不符），只是提醒。客户已经说过照用的图不再提，其余的过目时列出来，附上链接。
- 图片文件名：小写英文加连字符，以型号开头，如 `ck6150-cnc-lathe-control-panel.jpg`。alt：一句带产品名的英文描述；同一张图用在多处时 alt 写成一样的。

## 安全

网站凭据在客户电脑的 `~/.puffergo/credentials.json`，只有脚本读它，你不要打开，也不要把内容贴进对话。你不直接请求 WordPress，一律通过 `puffergo`。
