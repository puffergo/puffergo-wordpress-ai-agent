# 区块

页面、文章、案例的正文，和产品的详情，都是**一串按顺序排的区块**。每个区块是下面几种之一：

| `type` | 是什么 | 怎么写 |
|---|---|---|
| `static` | PufferGo 静态区块：你写的一段 Tailwind HTML | 见 `static.md` |
| `config` | 配置型组件：固定版式，你只填数据 | `{"type": "config", "component": "…", "data": {…}}`，见下面「配置型组件」 |
| `native` | 客户在 WordPress 编辑器里加的区块（视频、图片、别的插件的区块），或老内容的经典编辑器 HTML | 读回来什么样就原样留着，不改 `raw` |
| `image` | 新加一张 WordPress 原生图片 | `{"type": "image", "image": {"file": "images/…", "alt": "…"}}` |
| `video` | 新加一个 WordPress 原生视频 | `{"type": "video", "url": "https://…"}`：YouTube、Vimeo 链接，或视频文件的直链；媒体库里的视频写 `"mediaId"` |

- 能对区块做哪些操作（新建、改、加、挪、删），看各技能的 SKILL.md。
- `native` 的 `name`、`text` 只是告诉你这块是什么、写了什么，方便认出来；`raw` 一个字都不要改。客户要改这类区块里的内容，请他在 WordPress 编辑器里改。
- 新加的 `image`、`video` 推送后读回来就是 `native`，这是正常的。
- 客户有视频文件（不是链接）：脚本不上传视频，请他先传到 YouTube，把链接给你，再用 `video` 区块放进去。
- 产品详情能用哪些组件、哪些原生区块，以 `products schema` 里的 `blocks` 为准。
- 轮播、表单、弹窗这类交互，静态区块做不了，告诉客户可以在 WordPress 编辑器里加现成的组件。

## 配置型组件

所有组件都一样：`data` 就是组件的数据。每个组件带两样说明（产品详情：在 `products schema` 的 `blocks.components.<组件>` 里；页面：在 `pages get` 存下的 `.json` 里）：

- `guide`：这个组件适合放什么、每种排法要填什么、怎么写。**写或改之前先完整读它**，照它写。
- `schema`：有哪些字段、每个字段是什么，规则如下。

- 只写 `schema` 里有的字段。`label`、`description` 说明这个字段放什么。
- `type`：
  - `text`、`textarea`：纯文本，不能写 HTML、Markdown；`textarea` 换行会保留，分段就空一行。`richtext` 可以写简单的 HTML。
  - `image`：图片地址。新图写本地路径（相对这个文件所在的文件夹，或相对工作目录，如 `images/a.webp`），脚本上传后换成网址；图片说明写在它旁边的说明字段里（如 `imageAlt`）。
  - `select`：只能填 `options` 里的某个 `value`。
  - `array`：一个列表，每一项的字段看 `itemSchema`。
- `showWhen`：旁边的字段取这些值时，这个字段才显示，比如 `{"layout": ["split"]}` 只在 `layout` 是 `split` 时有用，其他时候不写。
- 图片放在哪、要什么尺寸比例，`products images` 和 `check` 的 `image_advice` 会说。
