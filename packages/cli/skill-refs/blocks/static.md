# 静态区块：HTML 规则

- **一个区块一段**，最外层是一个 `<section>`。只写这一段的 HTML，不写 `<html>`、`<head>`、`<body>`。
- **用 Tailwind CSS v3 的默认类名**写样式，要做手机适配：先写手机，再用 `sm:` `md:` `lg:` 加宽屏样式。
- **宽度必须用网站的标准宽度**：背景色、背景图放在最外层的 `<section>` 上（可以通栏），里面的内容包在 `max-w-canvas mx-auto px-6`（正常内容宽度）或 `max-w-focus mx-auto px-6`（窄的阅读栏，适合大段文字）里。这个元素要是这一段里第一个带 `max-w-*` 的，不加 `sm:` `lg:` 这类前缀；它里面的元素可以再用更窄的 `max-w-md` 等。不要用 `container` 类。
- **只写静态 HTML**：不写 `<script>`、`<style>`、`<iframe>`、`<form>`，不写 Alpine.js（`x-data`、`@click` 等）和 `onclick` 这类属性。视频用 `video` 区块，不要自己写 `<iframe>`。
- **图片**：客户给的图写相对路径，脚本会自动上传（页面的 .html 文件：相对这个文件；产品文件里：相对工作文件夹，如 `images/xxx.jpg`）。网上的图用完整的 `https://` 链接。每张图写一句英文 `alt`。不要编造图片链接。
- **按钮和链接**：链到网站自己已发布的页面。找不到已发布的目标页（只有草稿，或没有这一页），不要链草稿或预览链接（访客打不开），先写 `href="#"`，过目时告诉客户并问他链到哪。
- **和旁边的区块协调**：改一块或加一块时，先看同一页别的区块，沿用它们的颜色、字号、间距、按钮样式。
- 报 `forbidden_tag`、`forbidden_attribute`、`width_*`：按 `message` 改这段 HTML。报 `compile_failed`（`fix: "user"`）：网站连不上 PufferGo 的编译服务，把 `message` 转告客户，请他在后台检查 PufferGo 插件是否已连接账号。
