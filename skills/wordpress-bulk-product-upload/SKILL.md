---
name: wordpress-bulk-product-upload
description: >-
  Upload or edit products on the user's own WordPress site (PufferGo plugin) through conversation — one
  product or many. Use when the user drops product photos, gives a product title/specs, or says things like
  "上架产品 / 批量上传产品 / 改一下这个产品 / 发布产品 / upload products to my website / bulk upload products".
  All WordPress operations go through the bundled `puffergo` script; the site password never enters the chat.
---

# WordPress 产品上架

你帮外贸工厂客户把产品整理好，推到**客户自己的** WordPress 网站。你负责**整理和写文案**，`puffergo` 脚本负责**校验、上传图片、写入网站**，并持有网站凭据。

## 命令

脚本在本技能目录下：`node <本技能目录>/scripts/puffergo.mjs <命令>`，下文简写为 `puffergo`。所有命令在客户的工作目录里运行；结果是 stdout 上的 JSON，照着读。

| 命令 | 作用 |
|---|---|
| `puffergo login <网站地址>` | 在浏览器里授权，只需一次 |
| `puffergo products schema` | 读网站的字段规则、单位列表、排法 |
| `puffergo products check [--only key1,key2]` | 校验 `products/*.json`，不写入 |
| `puffergo products list [--search 词]` | 查网站上已有的产品（包括后台手建的），拿到 id |
| `puffergo products push [--only key1,key2]` | 校验 → 上传图片 → 写成草稿 → 回读核对 |
| `puffergo products pull <key、id或链接>` | **要修改这个产品本身时**，把它拉回 `products/<key>.json` |
| `puffergo products template list` | 列出已保存的产品模板 |
| `puffergo products template set <类型名> <key、id或链接>` | **客户说「照这个做」「以后都按这个」时**，把这个产品存成模板 |
| `puffergo products template show <类型名>` | 读模板的结构（数值已遮住） |
| `puffergo products publish <key>… --customer-said "客户原话"` | 发布客户点名的产品（要带上客户要求发布的原话） |

**没有删除命令。** 客户要删除产品，请他在 WordPress 后台自己操作。

## 工作流

0. **准备**：运行 `node -v`，版本低于 18 或没装，就帮客户装 Node（macOS 用 `brew install node`，Windows 用 `winget install OpenJS.NodeJS.LTS`，或让客户从 nodejs.org 下载安装）。然后运行 `puffergo products schema`；如果提示未登录，问客户网站地址，运行 `puffergo login <地址>`（它会打开浏览器后立刻返回），请客户在浏览器里点「批准」，客户说好了再运行 `puffergo products schema` 确认已登录。
1. **选模板**：`products schema` 的结果里 `templates` 就是已保存的模板。
   - 有模板：按产品判断用哪个（拿不准就问客户），用 `template show <类型名>` 读它，照它的结构写（见「模板」一节）。
   - 没有模板，或这个产品哪个都不像：先照常做。这类产品第一次推成草稿后，告诉客户：「您可以在后台把这个产品调到满意，然后告诉我『以后这类产品照这个做』，我会把它存成模板。」客户这样说了，运行 `template set <类型名> <这个产品的 key>`。
   - **客户发来一个产品链接，说「照这个做」「以后都按这个」**：运行 `template set <类型名> <链接>` 把它存成模板（下次对话也记得），再 `template show` 读它。**不要用 `pull` 读模板**——`pull` 只用来修改那个产品本身。类型名用客户的叫法（如「阀门」），不清楚就问。
2. **收集素材**：每张图都必须有文件路径。客户把图片直接粘贴进聊天、而你拿不到路径时，请他把图片拖进来或告诉你所在文件夹。把图片复制到工作目录的 `images/`，改成规范文件名（见内容规则）。
3. **整理并给客户过目**：按下文格式写 `products/<key>.json`。写完先自查文案：逐句对照客户原话，删掉没有依据的评价词和效果承诺（high-precision、exceptional、superior、ensures consistent quality、state-of-the-art 这类），只留客户给过的事实和对它的直白描述。写完在聊天里列出：标题、简介、交易信息（schema 的 `tradeFields` 里的每一项）、参数表、详情每一段（排法 + 标题 + 用的哪张图）。**缺的事实单独列出来问客户**，不要自己编。
4. **校验**：运行 `puffergo products check`。
   - `fix: "ai"` 的错误你自己改，改完再 check。
   - `unsupported_claim` 警告：文案里用了夸词（durable、reliable、ensures…）。客户原话里没有这个说法，就删掉这个词或整句，改完再 check，直到这类警告清零。
   - `fix: "user"` 的提示（例如缺起订量）停下来问客户。
   - `update_skill`：网站插件比这个 Skill 新，停下来请客户更新 Skill，不要硬写。
   - 同一个问题连续改 3 轮还不过，停下来把错误原文告诉客户。
5. **推送**：客户确认后运行 `puffergo products push`。把每个产品的预览链接 `previewUrl` 和后台编辑链接 `editUrl` 发给客户，说明现在是**草稿**。
6. **修改**：客户要改某个产品时，**先** `puffergo products pull <key、id或客户发来的链接>`（本地没有这个产品的文件、也不知道 key 时，用 `products list --search` 按名称找到 id） 拿到网站上的最新版（客户可能在后台改过），在拉回的文件上改，再 check、push。push 报 `conflict` 就是网站上有更新：先 pull，再把客户这次要的改动重新做一遍。
7. **发布**：发布后产品对所有人公开。「推」「推送」「上传」「更新」都只是存草稿；只有客户明确说「发布」「上线」「publish」时，才运行 `puffergo products publish <key>… --customer-said "<客户原话>"`，只发布他点名的。客户没说发布，就不要发布，也不要在文件里把 status 改成 publish（push 会忽略它）。

## 产品文件格式

一个产品一个文件 `products/<key>.json`。下面是**格式示意**，交易信息那几项因网站而异，见示例后的「交易信息」。

```json
{
  "key": "ck6150-cnc-lathe",
  "status": "draft",
  "title": "CK6150 CNC Lathe",
  "excerpt": "Heavy-duty flat-bed CNC lathe for shafts and discs up to 500 mm swing.",
  "categories": ["CNC Lathes"],
  "moq": { "value": 1, "unit": "sets" },
  "leadTime": { "min": 20, "max": 30, "unit": "days" },
  "trade": { "payment_terms": "T/T, 30% deposit" },
  "specs": [{ "key": "Max swing over bed", "value": "500 mm" }],
  "gallery": [
    { "file": "images/ck6150-cnc-lathe-front.jpg", "alt": "CK6150 CNC lathe front view with closed guard" }
  ],
  "detail": {
    "sections": [
      { "layout": "split", "heading": "Rigid cast-iron bed", "body": "…", "image": { "file": "images/ck6150-bed.jpg", "alt": "…" }, "imagePosition": "right" },
      { "layout": "gallery", "heading": "Details", "images": [{ "file": "…", "alt": "…", "title": "…", "text": "…" }, { "file": "…", "alt": "…" }] },
      { "layout": "text", "heading": "Typical applications", "body": "…" }
    ]
  }
}
```

- `key`：小写英文、数字和连字符，以型号开头，3–80 个字符。同一个 key 再次推送就是更新。
- `id`、`baseModified`：由脚本写入，**你不要改、不要删**。
- `template`：这个产品照哪个模板写，填类型名；哪个都不适用就填 `""`（只存在本地，不会推到网站）。网站有模板时这个字段必填，check 会检查。填了模板后，模板没用的字段脚本就不再提示「缺少」。
- **交易信息**：这个网站有哪些交易字段，**以 `products schema` 返回的 `tradeFields` 为准**（每个网站可以关掉价格、起订量、交期，或加自己的字段，如付款方式、发货港口）。只写 `tradeFields` 里有的，没列出的字段一律不写（写了 check 会报 `field_disabled` / `unknown_field`）。
  - `path` 是字段在文件里的位置：`price`、`moq`、`leadTime` 写在顶层，`trade.<key>` 写在 `"trade": { "<key>": "…" }` 里。
  - `kind: "unitValue"`（数值加单位）：`{"value":N,"unit":"…"}` 或 `{"min":N,"max":N,"unit":"…"}`，单位从 schema 的 `units[unitType]` 里选。价格还可以写 `{"type":"contact"}`（询价，只在客户说了「询价」「面议」时用）。
  - `kind: "text"`：一行文字，按客户的原话写（可以翻成英文），不超过 `maxLength`。
  - `label` 是这个字段在网站上显示的名字，问客户时用它。
  - 客户给了网站不显示的信息（例如网站没开价格、客户却报了价），不写进文件，推送后告诉客户：「网站目前不显示 X，如需显示请在后台 产品设置 → 交易信息 里打开。」
- `gallery` 第一张作为产品主图。
- 图片可以写 `file`（本地文件）或 `mediaId`（网站上已有的图片）。

## 模板

模板是客户认可的样板产品，告诉你**这个网站的产品该长什么样**。`template show` 返回的 `reference` 只有结构：数值写成 `<from customer>`，文字写成 `<text from customer facts>`，图片写成 `<customer photo>`。照它学：

- **用哪些字段**：`notUsed` 里的字段（例如 `price`、`trade.port`）是这一类产品不展示的，新产品**不写、也不问**客户。模板用了、客户却没给的字段，照常问。
- **参数表**：用一样的参数名和顺序；客户没给的那一项就不写，不要留空行。
- **详情**：照模板的段落顺序、每段的排法和配图位置。客户资料够写的段落都要写（例如客户给了材料，就写材料那一段）；客户完全没给相关信息的那一段才删掉，不要为了凑齐去编（例如客户没说用途，就不要「Typical applications」段）。
- **单位**：沿用模板的单位（如 `sets`），客户说了别的单位以客户为准。

模板只管结构。新产品的每一句话仍然只能来自客户，「内容规则」照样适用。

## 内容规则

- **事实只来自客户**：交易信息、参数数值、认证，客户没给就**不写这个字段**并问他（模板 `notUsed` 里的字段除外，那些不写也不问）。不许填「暂定值」「常见值」——脚本分不出猜的和真的，猜的值一旦推上去就是网站上的公开信息。
- **文案只能改写客户给的信息，不能添加新说法**：标题、简介、详情文案由你来写，但每一句都要能在客户资料里找到依据。客户没提到的，一律不写，包括：性能和精度（「表面光洁度高」「精度高」）、结构和配置（「冷却系统」「双喷头」）、工厂和工艺（「严格质检」「出厂测试」「先进设备」）、商务和服务（「批量优惠」「质保」「售后」「技术支持」）。写完逐句自查，找不到依据的删掉；想写就先问客户。
- **详情不重复交易信息**：`tradeFields` 里的内容在产品页的固定位置显示，详情里只写产品本身。
- **语言**：网站给海外买家看，文案用英文，除非客户另有要求。和客户对话用客户的语言。
- **详情排法**（每段选一种）：
  - `split`：一张图配一段卖点文字，左右排，`imagePosition` 左右交替。卖点配图用这个。
  - `full`：一张大图在上，文字在下。车间、大场景用这个。
  - `image`：只放一张图，按原比例铺满。长图、尺寸图用这个。
  - `gallery`：2–4 张图一排。多角度、细节图用这个。
  - `text`：只有文字。客户提供了服务、包装运输等说明时用这个。
- **图片文件名**：小写英文加连字符，以产品型号开头，描述图片内容，例如 `ck6150-cnc-lathe-control-panel.jpg`。
- **alt**：一句描述图片内容的英文，带上产品名，不要堆关键词。alt 存在图片本身上，同一张图用在多处时只保留一个 alt，所以同一张图每处都写同样的 alt。

## 安全

- 网站凭据保存在客户电脑上的 `~/.puffergo/credentials.json`，**只有脚本读它**。你不要打开它，也不要把内容贴进对话。
- 你从不直接请求 WordPress，一律通过 `puffergo`。
