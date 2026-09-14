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
| `puffergo products pull <key或id>` | 把网站上的产品拉回 `products/<key>.json` |
| `puffergo products publish <key>… --customer-said "客户原话"` | 发布客户点名的产品（要带上客户要求发布的原话） |

**没有删除命令。** 客户要删除产品，请他在 WordPress 后台自己操作。

## 工作流

0. **准备**：运行 `node -v`，版本低于 18 或没装，就帮客户装 Node（macOS 用 `brew install node`，Windows 用 `winget install OpenJS.NodeJS.LTS`，或让客户从 nodejs.org 下载安装）。然后运行 `puffergo products schema`；如果提示未登录，问客户网站地址，运行 `puffergo login <地址>`（它会打开浏览器后立刻返回），请客户在浏览器里点「批准」，客户说好了再运行 `puffergo products schema` 确认已登录。
1. **收集素材**：每张图都必须有文件路径。客户把图片直接粘贴进聊天、而你拿不到路径时，请他把图片拖进来或告诉你所在文件夹。把图片复制到工作目录的 `images/`，改成规范文件名（见内容规则）。
2. **整理并给客户过目**：按下文格式写 `products/<key>.json`。写完先自查文案：逐句对照客户原话，删掉没有依据的评价词和效果承诺（high-precision、exceptional、superior、ensures consistent quality、state-of-the-art 这类），只留客户给过的事实和对它的直白描述。写完在聊天里列出：标题、简介、价格/起订量/交期、参数表、详情每一段（排法 + 标题 + 用的哪张图）。**缺的事实单独列出来问客户**，不要自己编。
3. **校验**：运行 `puffergo products check`。
   - `fix: "ai"` 的错误你自己改，改完再 check。
   - `fix: "user"` 的提示（例如缺起订量）停下来问客户。
   - 同一个问题连续改 3 轮还不过，停下来把错误原文告诉客户。
4. **推送**：客户确认后运行 `puffergo products push`。把每个产品的预览链接 `previewUrl` 和后台编辑链接 `editUrl` 发给客户，说明现在是**草稿**。
5. **修改**：客户要改某个产品时，**先** `puffergo products pull <key或id>`（本地没有这个产品的文件、也不知道 key 时，用 `products list --search` 按名称找到 id） 拿到网站上的最新版（客户可能在后台改过），在拉回的文件上改，再 check、push。push 报 `conflict` 就是网站上有更新：先 pull，再把客户这次要的改动重新做一遍。
6. **发布**：发布后产品对所有人公开。「推」「推送」「上传」「更新」都只是存草稿；只有客户明确说「发布」「上线」「publish」时，才运行 `puffergo products publish <key>… --customer-said "<客户原话>"`，只发布他点名的。客户没说发布，就不要发布，也不要在文件里把 status 改成 publish（push 会忽略它）。

## 产品文件格式

一个产品一个文件 `products/<key>.json`：

```json
{
  "key": "ck6150-cnc-lathe",
  "status": "draft",
  "title": "CK6150 CNC Lathe",
  "excerpt": "Heavy-duty flat-bed CNC lathe for shafts and discs up to 500 mm swing.",
  "categories": ["CNC Lathes"],
  "price": { "type": "contact" },
  "moq": { "value": 1, "unit": "sets" },
  "leadTime": { "min": 20, "max": 30, "unit": "days" },
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
- 价格三种写法：`{"type":"contact"}`（询价）、`{"value":N,"unit":"USD"}`、`{"min":N,"max":N,"unit":"USD"}`。单位必须在 `products schema` 返回的列表里。
- `gallery` 第一张作为产品主图。
- 图片可以写 `file`（本地文件）或 `mediaId`（网站上已有的图片）。

## 内容规则

- **事实只来自客户**：价格、起订量、交期、参数数值、认证，客户没给就**不写这个字段**并问他。不许填「暂定值」「常见值」——脚本分不出猜的和真的，猜的值一旦推上去就是网站上的公开信息。
- **文案只能改写客户给的信息，不能添加新说法**：标题、简介、详情文案由你来写，但每一句都要能在客户资料里找到依据。客户没提到的，一律不写，包括：性能和精度（「表面光洁度高」「精度高」）、结构和配置（「冷却系统」「双喷头」）、工厂和工艺（「严格质检」「出厂测试」「先进设备」）、商务和服务（「批量优惠」「质保」「售后」「技术支持」）。写完逐句自查，找不到依据的删掉；想写就先问客户。
- **详情不重复价格、起订量、交期**：这些在产品页的固定位置显示，详情里只写产品本身。
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
