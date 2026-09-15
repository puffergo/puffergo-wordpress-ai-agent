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

## 命令

`node <本技能目录>/scripts/puffergo.mjs <命令>`，下文简写为 `puffergo`。在客户的工作目录里运行，结果是 stdout 上的 JSON。

| 命令 | 作用 |
|---|---|
| `puffergo login <网站地址>` | 在浏览器里授权，只需一次 |
| `puffergo products schema` | 网站的交易字段、单位、产品分类、已存的样板 |
| `puffergo products images <文件或文件夹>…` | 查客户给的图片：体积、尺寸、比例适合放哪 |
| `puffergo products check [--only key,…]` | 校验 `products/*.json`，不写入 |
| `puffergo products push [--only key,…]` | 上传图片，写入网站；新产品是草稿 |
| `puffergo products list [--search 词]` | 找网站上已有的产品，拿到 id |
| `puffergo products pull <key、id或链接>` | 把网站上的产品拉回本地，用来修改它 |
| `puffergo products publish <key>… --customer-said "客户原话"` | 发布客户点名的产品 |
| `puffergo products sample list / set <类型名> <key、id或链接> / show <类型名>` | 样板：列出、保存、读取 |
| `puffergo products categories check / push` | 校验 / 写入 `categories.json` 里的产品分类 |
| `puffergo products edit-live on --customer-said "客户原话" / off` | 允许 / 不允许改已发布的产品和已有分类，默认不允许 |

没有删除命令，客户要删产品请他在 WordPress 后台操作。

## 工作流

**铁律：推送前一定先把整理好的内容给客户过目，客户确认后才推送。**要问客户的事攒在一起，在过目那一条消息里一次问完。

1. **准备**：`node -v` 低于 18 或没装，你自己装最新 LTS（macOS `brew install node` 或 nodejs.org 的 .pkg，Windows `winget install OpenJS.NodeJS.LTS`），系统弹窗要密码请客户自己输。然后运行 `products schema`；提示未登录就问网站地址，运行 `puffergo login <地址>`，请客户在浏览器里批准后再跑一次 `schema`。
2. **收资料**：图片要有文件路径，拿不到就请客户把图片拖进来或告诉你文件夹。复制到 `images/`，改成规范文件名，马上运行 `products images images/`：超过 200KB 的、尺寸或比例放不进打算放的位置的，当场一条消息告诉客户，附上那个位置的 `cropUrl`（PufferGo 图片工具，能一次裁剪、改尺寸、压缩）。客户处理完发回新图就换上；不在乎的就照用原图，这只是提醒，不影响推送。客户发来别的网站上的产品链接（如阿里巴巴），读取页面上的资料和图片当作客户资料；读不到就请客户截图。
3. **整理并校验**：写 `products/<key>.json`，运行 `products check`，`fix: "ai"` 的自己改，`fix: "user"` 的留到下一步问。
4. **给客户过目**：一条消息里列出标题、简介、分类、交易信息、参数表、详情每一段（排法、标题、用哪张图），以及要客户回答的：
   - 分类：客户没说放哪个分类，就把 schema 的 `categories` 列出来请他选；要新分类，按下面「产品分类」加进 `categories.json`，和产品一起给客户过目，先 `categories push` 再推产品。
   - 缺的事实，和 check 提示要客户补的。
5. **推送**：客户确认后运行 `products push`，把 `previewUrl` 和 `editUrl` 发给客户，说明现在是草稿。
6. **修改**：先 `products pull` 拉回网站上的最新版（客户可能在后台改过），改完照样给客户过目再 push。push 报 `conflict` 就先 pull，再把改动重做一遍。
   已发布的产品默认改不了，push 报 `live_locked`。客户明确要改线上内容时，才运行 `products edit-live on`，`--customer-said` 带上他的原话；过目时告诉他这次改的是线上页面，改完运行 `products edit-live off`。
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

一个产品一个文件 `products/<key>.json`：

```json
{
  "key": "nv60-led-wall-pack",
  "title": "NV-60 LED Wall Pack Light, 60W",
  "excerpt": "…",
  "categories": ["outdoor-lighting"],
  "price": { "type": "contact" },
  "moq": { "value": 100, "unit": "pieces" },
  "leadTime": { "min": 15, "max": 20, "unit": "days" },
  "specs": [{ "key": "Power", "value": "60W" }],
  "gallery": [{ "file": "images/nv60-wall-pack-front.png", "alt": "NV-60 LED wall pack light, front view" }],
  "detail": {
    "sections": [
      { "layout": "split", "heading": "…", "body": "…", "image": { "file": "images/…", "alt": "…" }, "imagePosition": "right" },
      { "layout": "gallery", "heading": "…", "images": [{ "file": "images/…", "alt": "…", "title": "…" }] },
      { "layout": "text", "heading": "…", "body": "…" }
    ]
  }
}
```

- `key`：小写英文、数字和连字符，以型号开头。同一个 key 再推一次就是更新。`id`、`baseModified` 由脚本写入，不要改。
- **交易信息以 schema 的 `tradeFields` 为准**，只写里面有的字段。`path` 是字段在文件里的位置（`price`、`moq`、`leadTime` 在顶层，自定义字段写在 `"trade": { "<key>": "…" }`）；`unitValue` 写 `{value, unit}` 或 `{min, max, unit}`，单位从 `units` 里选；价格面议写 `{"type": "contact"}`；`text` 按客户原话写。客户给了网站不显示的字段，不写，推送后告诉他可以在后台「产品设置 → 交易信息」里打开。
- `categories` 写分类的 `slug`，从 schema 的 `categories` 里取。
- `gallery` 第一张是主图。图片写 `file`（本地）或 `mediaId`（网站上已有的）。
- 详情排法：`split` 左右图文（`imagePosition` 左右交替）、`full` 通栏大图加文字、`image` 原比例整行大图（长图、尺寸图）、`gallery` 一行 2–4 张图、`text` 纯文字。

## 内容规则

- 参数、交易信息、认证只来自客户，没给就问，不填猜的值。
- 文案用英文（客户另有要求除外），和客户对话用客户的语言。详情里不重复交易信息。
- `check` 报 `unsupported_claim`，就删掉那个没有依据的说法。
- `check` 报 `image_advice`（图片体积、尺寸、比例和放的位置不符），只是提醒。客户已经说过照用的图不再提，其余的过目时列出来，附上链接。
- 图片文件名：小写英文加连字符，以型号开头，如 `ck6150-cnc-lathe-control-panel.jpg`。alt：一句带产品名的英文描述；同一张图用在多处时 alt 写成一样的。

## 安全

网站凭据在客户电脑的 `~/.puffergo/credentials.json`，只有脚本读它，你不要打开，也不要把内容贴进对话。你不直接请求 WordPress，一律通过 `puffergo`。
