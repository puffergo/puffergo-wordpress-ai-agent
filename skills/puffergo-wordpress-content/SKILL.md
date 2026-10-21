---
name: puffergo-wordpress-content
description: >-
  Build, edit and operate content on the user's own WordPress site (PufferGo plugin): pages, blog posts
  and case studies as Markdown body text (native WordPress blocks the customer can edit) plus Tailwind
  HTML layout sections; and, when the site runs a content strategy, the whole SEO silo — expand its
  positioning into keywords and pillar/cluster architecture, write the articles in a local vault, push
  them as drafts with Rank Math titles/keywords/internal links, pull back from WordPress and run an SEO
  health check. Use when the user says things like "做一个页面 / 写一篇博客 / 加一个案例 / 改一下首页这一块 /
  这段文字换一下 / 规划关键词 / 搭建 silo / 成批写文章 / 给网站做 SEO 体检 / make a landing page /
  add a case study / edit this section / plan keywords / publish to WordPress".
  Not for products (use puffergo-wordpress-products). All WordPress operations go through the bundled
  `puffergo` script; the site password never enters the chat.
---

# WordPress 内容与 SEO Silo

你帮客户在他自己的 WordPress 网站上做内容：建新页面（博客、案例也算）、改已有页面里的某一块、改网址和 SEO 信息；网站要是已经在做内容战略，你还管整套 SEO silo——关键词、支柱/集群架构、成批写文章、推送、拉取、体检。你负责写内容；`puffergo` 脚本负责检查、编译、上传图片、写入网站，并持有网站凭据。

## 开场：先判断走哪条车道

客户已经说了要做什么就直接做，不要先问。第一步永远是 `puffergo silo status`，按结果选车道：

**有例外，先看这一条**：客户问的是**域名本身**——「这个域名能不能买」「我的域名有没有问题」「邮件怎么发不出去」「会不会被 Google 拦」——走「域名体检」，直接 `puffergo domain check <域名>`。**不用先跑 `silo status`，不需要登录，哪个目录跑都行**，因为查的全是公开数据，跟网站状态无关。

| `silo status` 结果 | 车道 | 怎么做 |
|---|---|---|
| 有工作区（`ok: true`） | **台账车道** | 这个站在做内容战略，内容和它的关键词架构、内链、体检结果都在台账里。写文章、改 SEO、推送、拉取一律走 `silo` 命令（见「台账车道」）。**只有一件事例外**：客户要改网站上某个页面里的一块版式、或改一篇不是台账管的页面，走 `pages` 命令（见「快车道」的第 4、5 节）。 |
| `no_workspace` | **快车道** | 这个站没有内容战略，客户要做的是单个页面/文章/案例，或改已有内容的某一块。直接用 `pages` 命令（见「快车道」）。 |

走快车道时，如果客户说的是「规划关键词」「搭建 silo」「成批写文章」「给网站做 SEO 体检」这类要长期运营的话，告诉他这个目录还没建内容战略，问要不要建（`silo init` 一句定位就能开始，见「台账车道」第 1 步）；他要的只是这一篇/这一页，就照快车道做，别硬推。

客户已经说了要做什么、只是没说具体细节时（「装好了」「这个能干嘛」「帮我用一下」），说这几句再问他要哪个：

- 可以建一个新页面、写一篇博客、加一个案例，也可以查看和修改网站上已有的内容，包括某一块的文字和图片、网址和 SEO 信息。
- 给我一句网站定位，我可以把它展开成关键词和 silo 架构，成批写文章推到网站，也可以给已有内容做一次 SEO 体检。
- 本项目是开源的，代码全部公开透明；你的信息只保存在你自己的电脑上。
- 写到网站上的内容默认是草稿，访客看不到，要你自己说发布才会发布。

要上架或修改产品，是 puffergo-wordpress-products 技能，告诉他装那个。

## 命令

`node <本技能目录>/scripts/puffergo.mjs <命令>`，下文简写为 `puffergo`。在客户的工作目录里运行，结果是 stdout 上的 JSON。客户说脚本行为不对时，先跑 `puffergo version`，把 `build` 念给他听——技能是整包下载的，光说「重装过了」说明不了他手上是哪一版。

## 域名体检（跳过登录）

客户问「这个域名能不能买」或「我的域名是不是有问题」时用。**不需要网站、不需要登录、不用跑 `silo status`**，在哪个目录跑都行。

| 命令 | 作用 |
|---|---|
| `puffergo domain check <域名> --html <路径>` | **默认用这个**：一份单文件网页报告，直接交给客户 |
| `puffergo domain check <域名>` | 同样内容的文字版，自己看或客户要文字时用 |
| `puffergo domain check <域名> --json` | 结构化输出，要二次加工时用 |

### 报告自己会分两个场景，你不用判断

`registration.state` 一眼看出该说哪套话：

| 域名状态 | 客户在问什么 | 报告结构 | 结论只有这几句 |
|---|---|---|---|
| `available`（没人持有） | 这个域名能不能注册 | 能不能注册 / 有没有历史污点 / 注册之后 / 下一步 | **可以注册** · **不能注册**（黑名单命中）· 判断不了（黑名单没查通） |
| `registered`（已在用） | 我的域名有没有问题 | 邮件 / Google 拦不拦 / 域名来路 / 下一步 | **有问题** · **没发现问题** · 判断不了（只在全都没查通时） |

**结论就一句话，判定过程不进结论。** 客户只想知道能不能注册、有没有事——DNS、证书、黑名单那些全部放在后面的段落里罗列。

**已有域名不要在结论层分大问题小问题。** 上面只说「有问题」，到底是大是小、哪一项、怎么修，客户往下看 02、04 段。分等级是明细的活，不是结论的活。

**「判断不了」是兜底，不是常态。** 只有一项结果都没拿到时才说；部分项没查通、其余正常，结论照样说「没发现问题」，但副句必须点明「另有 N 项没查成，那几项不算干净」。

但内部必须清楚一件事：注册局不管历史，只要没人持有、付钱就能注册。所以「不能注册」在技术上是能下单的。有黑历史时结论说「不能注册」，后面必须紧跟半句**「注册商那能下单，但买了用不了」**，把话说圆。只甩一句「不能注册」，客户去注册商一试就买下来了，当场就不信你。

**「被用过」和「有黑历史」是两件事，别混。** 前者是痕迹（DNS / 证书 / 解析历史里留着记录），只说明这名字以前有人用过；后者是污点（在 Spamhaus DBL / SURBL 这类黑名单里躺着）。**只有污点能让人说「不能注册」**——被用过、但黑名单干净，就是可以注册，痕迹只能作为提示，不能当判决。客户会抓这句话：一个开垮了的小站，域名掉出来照样能卖，凭什么说不能注册。

**能拦人的只有黑名单，所以黑名单必须实查。** 报告里 DBL / SURBL 的查询结果永远列出来，写「不需要查」等于结论在猜。黑名单这一项没查通时，结论只能给「判断不了」——这是判据缺了，不是配角失手。

**判断它以前有没有被用过，要分证据强弱——只查 DNS 会被骗。** 旧域名掉出注册局之后，DNS 是第一个被清空的东西；囤域名的人干脆从来不解析，DNS 一样是空的。

| 源 | 强度 | 为什么 |
|---|---|---|
| 当前 DNS（A / NS / MX） | 弱 | 只是配置，换了持有人随时清空。**空 ≠ 没用过** |
| 证书透明日志 | 强 | 配过 HTTPS 就进公开账本，只增不减，删不掉 |
| 被动 DNS 历史 | 强 | 第三方长期观测攒的，比当前 DNS 活得久 |

`registration.residue.state` + `residue.strength` 决定副句怎么说（**结论永远是「可以注册」**，除非黑名单命中）：

- `traces` + `strength: 'hard'` → 证书或解析历史里有痕迹 → 副句「这名字以前被人用过」，点明是哪一处抓到的（`residue.cert` / `residue.passive`），再补一句「用过不等于有问题，介意就换个没人碰过的」
- `traces` + `strength: 'weak'` → 只有当前 DNS 有记录 → 同上，但可以带一句「证据较弱，也可能只是有人囤着」
- `clean`（`strength: 'none'`）→ 三处都空 → 副句「没发现问题」；客户追问「人家只是囤着没解析呢」时再答那一段（见下）
- `unknown` → 历史没查通，但黑名单干净 → 照样「可以注册」，副句必须点明「以前有没有被用过没打包票」

`residue.parked` 有值时（Sedo / Dan / HugeDomains 这类停放商）说明这域名正被人当货摆着卖，可以直说。

**客户一定会追问「人家只是囤着没解析呢？」** 标准回答两句话：可注册就意味着它此刻**不在任何人手里**，所以不存在「正被谁囤着」；能留在它身上的只有历史。囤着不建站 = 零历史 = 无害。真正查不出来的是「用过、后来痕迹被清光」的老域名——那种只能注册后头两天自己发一封测试信验证（多数注册商给几天删除退款期，先问清）。

**`.co` / `.cn` / `.de` / `.im` 这类后缀查不到注册状态**：ccTLD 大多没有公开的 RDAP 接口，报告会写「这个后缀没有公开的注册查询接口」。这不是网络问题，**别让客户重试**（重试一万次也没用），也别说「查不到所以没问题」。这时候看 DNS 有没有记录来判断「现在在不在用」，并让他去注册商网站搜——能不能注册只有注册商能回答。

### 五句话不能说

- **不许拿「被用过」当「不能注册」的理由。** 这是两回事，客户一追问就露馅：注册局只认钱，谁付钱谁拿走。
- `unknown` / `cannot` 的项，必须说「这一项没查通」或「这一项查不到」，**不能说「没问题」**。检测工具的信任就是被这种话毁掉的。
- Google 那两项别说「我帮你查过了没事」——没查，只是把官方入口给了他。
- 「以前被谁用过」查不到（WHOIS 隐私保护），直接说查不到，别绕。
- 结论里说「没发现问题」时，不许改口成「保证没问题」。没查到的项（Google 处罚、历史行业）永远查不到，这句话有边界。

### 下一步要分两栏讲

`next` 每一项都带 `who`：`self` 是客户自己十分钟能做完的，`us` 是要人帮忙的。**别混成一串念**——先把 `self` 给他（这些我们自己不赚他的钱，他反而更信你），再说 `us`。`us` 那栏才是我们的活，一次只说一条，别铺满。

### 交付方式：跑 `--html`，把文件给他，别贴一屏等宽字

WorkBuddy、豆包、Codex 这类环境都能渲染网页文件，所以**不必先试探、也不必问客户要哪种格式**。路径不写就落到当前目录 `<域名>-domain-check.html`，写一个更好的位置（客户的工作目录）就行。

网页报告是单文件、零外链、离线可开，手机上也排得开，他能直接转发给合伙人。文字版留着你自己读——**要贴进聊天时原样贴，别改写成表格或加小标题**，那段等宽排版就是为聊天窗口调的。

报告顶部有一串 `PG-20261022-0105-79CD` 这样的编号。客户下次带着问题回来时，让他报这个号，你重跑一次就能对上同一份报告。

## 准备

Node 是你的运行环境，你自己搞定，不要拿它去问客户：跑一句 `node -v`，18 以上就能用（脚本自己不检查版本，是你跑这一句看的）。太低或没装，你自己装好（macOS `brew install node` 或 nodejs.org 的 .pkg，Windows `winget install OpenJS.NodeJS.LTS`），再跑一次 `node -v` 确认。绝大多数机器本来就有，这一步通常是一句命令带过。

然后运行 `pages types`；提示未登录就问网站地址，按下面「授权」走一遍，再跑一次 `pages types`。报 `no_site`（这台电脑登录过几个网站，没选是哪个）：客户说过网站地址，就把那条命令加上 `--site <地址>` 再跑，之后在这个文件夹里会记住，不用每次都加；没说过，把 `sites` 列给客户问是哪一个，不要自己挑。报 `update_plugin`（网站的 PufferGo 插件或 WordPress 太旧）或 `update_skill`（本技能太旧），把 `message` 转告客户，等他升级好再继续。

**网站还没准备好时用 `puffergo site setup`**：它不改任何东西，只查一遍这个站能不能用（授权还有效吗、WordPress 是不是 6.9 以上、PufferGo 插件启用没有、有没有装 SEO 插件），把 `problems` 和 `needsInstall` 列给你。缺的东西照 `next` 转告客户，问同不同意装；他说「装」，才运行 `puffergo site setup install --customer-said "客户原话"`，它会装 PufferGo 插件，网站一个 SEO 插件都没有时再装 Rank Math（已有 Rank Math 或 Yoast 就不动）。**WordPress 本身太旧、插件要升级，脚本装不了**，报 `needs_manual_install` 时把 `message` 里那几句后台操作转告客户。装完再跑一次 `site setup`，`ready: true` 就可以开始了。

## 授权

回调服务就在客户自己的电脑上，客户一点批准脚本立刻就知道，**所以不要问客户「点好了吗」**：

1. `puffergo login <网站地址>` 会打开浏览器并立刻返回。告诉客户：已经打开 WordPress 授权页，请点「批准」（先登录网站后台）。**把返回里的 `authorizeUrl` 原样发给客户**：浏览器没自动打开、或者打开的地方不能粘贴密码，他自己点这个链接就够了。**这个链接只能客户自己的浏览器打开**——授权结果要回到这台电脑上，你用内置浏览器打开它，客户永远授权不上。
2. 马上运行 `puffergo login status`，它会一直等到客户点完为止。
3. 回来是 `approved`：先回一句「我看到你批准了，正在核对权限」，再运行 `pages types`，然后告诉客户网站是哪个、可以开始了。回来是 `waiting`（等太久了）：告诉客户你还在等那个页面，再运行一次 `login status`。回来是 `denied`：把 `message` 转告客户，重新 `login`。
4. 回来是 `waiting` 且带 `tookOver`：本机接听的进程之前被打断过，客户那一次点击（如果他点了）丢了。只要跟他说「回到还开着的那个页面，再点一次批准」——**就是再点一下，不要让他复制网址、不要让他改文件、也不用重新 `login`**；然后你再跑一次 `login status`。

## 站点画像

客户网站「是干什么的」只存在一份地方——站点画像：品牌、客户是谁、信任数据（人数、产能、良率、出口国家）、语气、关键词。**写页面、写博客、写产品之前先读一次**，写出来的东西才跟这个站一个口径；还空着哪些它也会告诉你。

| 命令 | 作用 |
|---|---|
| `puffergo profile get` | 读出整份画像，带 `completeness`（填了多少、还缺哪些）和 `limits`（产品最多 3 个、关键词最多 30 个之类的硬限制） |
| `puffergo profile check <file.json>` | 干跑：这份文件存进去会变成什么样，哪些会被截断或改掉。不写入 |
| `puffergo profile set <file.json> [--replace]` | 写入。**默认合并**：文件里没提的块和字段保持原样；`--replace` 才整份覆盖 |

- `get` 的 `profile` 存成文件、改完再 `set`，就是改画像的全部流程。
- `set` 会把改之前的画像存到 `<file>.previous.json`（`--backup <文件>` 改位置）。改错了，把那个文件用 `--replace` 发回去就还原了。
- `check` 报 `profile_warnings` 就先改文件再 `set`：它列出的正是会被截断或改掉的东西——产品超过 3 个、关键词超过 30 个、语气不是 Professional / Innovative / Caring、邮箱不是邮箱、渠道类型不认识。
- 没有删除命令，客户要清空画像请他在 WordPress 后台的站点画像页操作。
- 报 `update_plugin`：这个站的 PufferGo 插件太旧，还没有这几个能力，把 `message` 转告客户，等他升级好再继续。

## 导航菜单（页头 / 页脚）

网站顶部的导航和底部的链接，都是普通的 WordPress 菜单。客户说「Products 下面加个 CNC Milling」「把 Blog 改成 Insights」「这个链接开个新窗口」这类话，就用这个。

**用法跟产品分类一模一样：导出一份树文件 → 直接改文件 → 干跑给客户看 → 写入。** 菜单本来就是一棵树，改标题、改链接、改描述、挪位置、调顺序，全都只是改文件里的字段。

| 命令 | 作用 |
|---|---|
| `puffergo chrome get --target header --out menu.json` | 把页头菜单导出成 `menu.json`（可编辑的树）。不带 `--out` 就把页头+页脚两棵树连同 `editUrl`、多语言状态打印出来看 |
| `puffergo chrome check <menu.json>` | 干跑：这份文件和网站现状一比，**会**新建/改哪些项、哪些保持不动。**不写入**。先给客户看这个 |
| `puffergo chrome push <menu.json>` | 真正写入。返回 `changes` / `skipped` / `leftAlone`、改后的树、改前的 `previous` 文件、`editUrl`、`polylang` |

导出的 `menu.json` 长这样，改完直接 push 回去：

```json
{ "target": "header",
  "menu": [
    { "id": 120, "title": "Products", "link": { "slug": "products" }, "children": [
      { "title": "CNC Milling", "link": { "url": "/cnc-milling/" } }
    ] },
    { "id": 125, "title": "Blog", "link": { "slug": "blog" }, "description": "Latest news", "target": "_blank" }
  ] }
```

- **每一项能改什么**：`title`（标题）、`link`（`{slug}` 站内页面/产品，`{url}` 外链/电话/邮箱）、`description`（描述）、`target`（`"_blank"` 开新窗口，留空为当前窗口）、`attrTitle`（悬停提示）。**字段可选：文件里没写的字段保持原样。**
- **层级 = `children` 嵌套，顺序 = 数组顺序。** 把一项放进另一项的 `children` 就是挂成子菜单；把节点在数组里挪位置就是调顺序。
- **按 `id` 认项**：带 `id` 的节点更新那一项，不带 `id` 的是新建。先 `get --out` 导出（自带 id）再改；新增项不给 id。
- **`link` 用 `{slug}` 还是 `{url}`**：站内页面/产品用 `{slug}`（保留页面关联，多语言站切语言时链接自动换）；外链/电话/邮箱用 `{url}`（裸电话自动变 `tel:`、裸邮箱变 `mailto:`）。
- **删除由客户在后台做**：树文件里没出现的项，push 时原样保留并列进 `leftAlone`。客户要删菜单项，把 `editUrl` 发给他，请他到 WordPress 后台删。
- **先 `check` 再 `push`**：check 会列出将新建、将修改的项。`skipped` 里的节点，先把原因念给客户、改好 `menu.json` 再 check，`skipped` 为空才 push。push 返回带 `skipped` 时，如实告诉客户跳过了哪几项。
- **回滚**：push 把改前的菜单存成 `<menu>.previous.json`，改错了拿它还原。
- **多语言站（Polylang）**：push 只改源语言菜单，其他语言是各自的副本。返回 `polylang.stale: true` 时跟客户补一句：「英文菜单改好了，中文/其他语言还是旧的，要去翻译中心重新翻译一次才会一致。」
- 客户想自己在后台核对，或要拖拽排序这类操作，把 `editUrl` 发给他。
- 报 `update_plugin`：插件太旧、还没有这几个能力，转告客户升级。

# 快车道

## 1. 快车道命令

| 命令 | 作用 |
|---|---|
| `puffergo login <网站地址>` | 在浏览器里授权，只需一次 |
| `puffergo login status` | 等客户在浏览器上点批准，点了就立刻返回，不用问客户 |
| `puffergo pages types` | 网站能建哪些内容类型（页面、文章、案例…） |
| `puffergo pages find [--type 类型] [--status publish] [--search 词] [--url 链接]` | 找网站上已有的页面、文章，拿到 id 和链接 |
| `puffergo pages blocks <id或链接>` | 列出一个页面的区块：路径、类型、文字摘要 |
| `puffergo pages get <id或链接> [路径]` | 把区块存到 `pages/<id>/block-<路径>.<后缀>`：正文是 `.md`、版式是 `.html`、组件是 `.json`，各另存一份 `.orig.*` 备份。不写路径就存整页所有能改的区块 |
| `puffergo pages categories <类型> <check\|push>` | 校验 / 写入这个类型的分类树（见「分类」） |
| `puffergo pages create --type <类型> --title "标题" --slug <网址> --seo-title "…" --seo-description "…" --focus-keyword "…" [--keywords "长尾词1, 长尾词2"] [--category "分类slug1, 分类slug2"] [--featured-image <图片>] [--excerpt "摘要"] <文件或文件夹>…` | 建一个草稿（访客看不到），每个文件是一段，按文件名排序 |
| `puffergo pages seo <id或链接> [--slug …] [--seo-title "…"] [--seo-description "…"] [--focus-keyword "…"] [--keywords "…"] [--category "…"] [--featured-image <图片>] [--customer-said "客户原话"]` | 不带参数是查看网址、SEO 标题、描述、关键词、分类、特色图和 Rank Math 评分；带参数是修改 |
| `puffergo pages preview <id或链接> <路径> <文件>` | 在整页里预览改过的这一块，不写入网站，随时可以用。只在改已发布页面之前用 |
| `puffergo pages preview <文件或文件夹>… [--title "标题"]` | 整批预览：把这批文件（或一个文件夹里按名字排好的文件）当成一个新建的页面在浏览器里打开看效果，不写入网站，网站上也还没有这一页。写完先给客户看这个，比建草稿再改快 |
| `puffergo pages replace <id或链接> <路径> <文件> [--customer-said "客户原话"]` | 用文件替换这个区块。已发布的页面要带客户同意上线的原话 |
| `puffergo pages publish <id或链接> --customer-said "客户原话"` | 发布草稿。只有客户明确说「发布」「上线」时才用 |
| `puffergo pages edit-live on --customer-said "客户原话" / off` | 一次改很多已发布页面时用：打开后所有已发布的页面和产品都能改，改完马上关 |

没有删除命令，客户要删页面或区块，请他在 WordPress 后台操作。

## 2. 内容怎么写

内容分两种写法，一个文件一段，**后缀决定它是什么**：

| 文件 | 写什么 | 到网站上是 |
|---|---|---|
| `.md` | **正文**：段落、标题、列表、表格、图片 | WordPress 原生区块。客户在编辑器里像平常一样改字、回车分段、加粗，不用找你 |
| `.html` | **版式**：多列、卡片、带背景的区段、标题大图 | PufferGo 区块。客户也能在编辑器里点开改 |
| `.json` | **配置型组件**的数据（轮播、FAQ 等） | PufferGo 区块 |

文章、案例的正文一律用 `.md`；页面（整页都是版式）用 `.html`。两者都可以和 `.json` 混着排。客户自己还能在编辑器里，往你写的两段正文中间插一个 PufferGo 区块。**记牢：`.md` 只用于 `inTemplate` 类型的正文；`fullWidth` 页面里用 `.md` 会贴边（见「写区块」fullWidth 规则），那是真坑。**

## 3. 做新页面

新页面一律先建成**草稿**（访客看不到），客户在 WordPress 编辑页里看效果，可以自己动手改，也可以让你改。**客户没明确说「发布」「上线」，你就不发布。**要问客户的事攒在一起，在发编辑链接的那一条消息里一次问完。

发给客户的链接（`editUrl`、`previewUrl`）照脚本输出原样给，不要把 `&` 写成 `&amp;`。客户要在打开链接的浏览器里登录过 WordPress 后台才能看。

1. **问做什么**：客户没说清楚要做哪种内容，就把 `pages types` 里 `canCreate` 为 true 的类型用它们的 `label` 列给客户选（如 页面 / 文章 / 案例）。再问清这一页的目的、内容和素材（文字、图片、数据）。
2. **写段落**：一段一个文件，放在 `pages/<英文短名>/` 里，按顺序命名，后缀选对（写法见「写区块」）：
   - 文章、案例：`01-intro.md`、`02-comparison.html`、`03-faq.json`、`04-body.md`…正文用 `.md`，中间要插对比表、CTA、FAQ 这类版式就插一个 `.html` 或 `.json`，正文接着用下一个 `.md`。
   - 页面：`01-hero.html`、`02-features.html`…整页都是版式。
   - 客户给的图片复制到这一批文件所在文件夹里的 `images/`（如 `pages/<短名>/images/`）。**两套路径基准，别混用**：
     - **`.md` 正文和 `.html` 版式里的图片**：相对**这个文件所在的文件夹**，`![图片说明](images/xxx.jpg)`。
     - **`--featured-image`**：相对**工作目录**（你运行 `puffergo` 的那个目录），所以写 `pages/<短名>/images/cover.jpg`。
     - `.json` 组件里的图片两个地方都找（先看文件旁边，再看工作目录）。
     - 找不到会报 `image_not_found`，按报错里的位置改。脚本会自动上传图片。
3. **定好 SEO 信息**：建之前要有这几样，客户没给就问他，或者和他商量定下来：
   - **网址 `--slug`**：小写英文和数字，用 `-` 连接，简短、说清这一页是什么，如 `gate-valves-vietnam-water-plant`。
   - **SEO 标题 `--seo-title`**：搜索结果和分享卡片上的标题。要带网站名就自己写进去，脚本不会自动加。
   - **SEO 描述 `--seo-description`**：搜索结果里标题下的那段话，写客户给的真实信息。
   - **长度只是建议**：建议区间在输出的 `seo.limits` 里（`titleRecommended`、`descriptionRecommended`），按宽度算，中日韩文字每个字算 2，英文字母、数字、空格算 1。不在区间时 `seo.checks` 会提示 `too_short` / `too_long`，告诉客户即可；客户就想要这个长度就照他的，不用改。
   - **核心关键词 `--focus-keyword`**：这一页最想被搜到的一个词，如 `gate valves`。
   - **长尾关键词 `--keywords`**（可选）：最多 5 个，用英文逗号隔开，如 `"water plant valves, vietnam valve supplier"`，不要和核心词重复。
   - **特色图 `--featured-image`**：文章、案例这类会显示在列表页和分享卡片上，问客户要一张；页面可以不要。
   - **分类 `--category`**：文章、案例、解决方案这类要归到分类里（`pages types` 里这个类型的 `taxonomy.categories` 就是网站现有的分类，按树状列给客户选，多个用英文逗号隔开）。**页面不归分类**（`taxonomy` 是 null），别给它写。客户要的分类网站上还没有，先按「分类」建好再建草稿。
   - 核心关键词要出现在 SEO 标题、SEO 描述、网址、页面大标题（H1）和正文开头里。
4. **建草稿**：`pages create --type <类型> --title "标题" --slug … --seo-title "…" --seo-description "…" --focus-keyword "…" [--keywords "…, …"] [--category "…"] [--featured-image pages/<短名>/images/cover.jpg] pages/<短名>`。文章、案例这类可以加 `--excerpt` 写一句摘要。以下情况什么都不会写入网站，改好再运行：
   - 报 `invalid_blocks`：按 `errors` 里每条的 `file` 和 `message` 改文件。`prose_unsupported` 是正文里写了 Markdown 不支持的东西（`message` 带行号），要么改写，要么那一段改成 `.html` 版式区块。
   - 报 `unknown_category`：`--category` 里有网站上没有的分类 slug（`message` 里写了是哪个）。**不会**帮你新建：要么换成 `pages types` 里已有的 slug，要么按「分类」先建好。报 `no_categories` 是这个类型不归分类（如页面），把 `--category` 去掉。
   - 报 `invalid_seo`：`slug_taken` 是网址被网站上别的内容占了（`message` 里写了是哪个），换一个；`keyword_repeated` 是长尾词和核心词重复了；`no_seo_plugin` 是网站没装 SEO 插件，请客户装好启用 Rank Math SEO（或 Yoast SEO）。
5. **处理提醒**：结果里 `seo.checks` 列出核心关键词还缺在哪些地方（`where`：`seoTitle` / `seoDescription` / `slug` / `h1` / `intro`），能补的补上：段落里的按下一节改区块，SEO 标题和描述用 `pages seo` 改，草稿的网址也可以用 `pages seo` 改。`warnings` 有 `unsupported_claim` 的，是客户没说过的说法：在段落里的，按「改已有页面的一块」把那几段改掉（草稿上改不用预览）；在 `--seo-title` / `--seo-description` 里的，用 `pages seo` 改掉。段落在页面上的路径就是它的顺序：第一个文件是 `1`，第二个是 `2`…（一个 `.md` 文件不管里面有多少段落，都只占一个号）。
6. **给客户看**：把 `editUrl` 发给客户，说明这是草稿，请他看电脑和手机两种宽度（编辑页右上角可切换预览），可以直接在编辑页里改，也可以告诉你要改什么。满意了可以自己在后台点「发布」；他让你发布，就先 `pages get <id>` 看一眼当前内容，再 `pages publish <id> --customer-said "客户原话"`。「改」「推」「更新」不算让你发布。报 `post_locked` 请他先保存关掉编辑页，报 `conflict` 就重新 `pages get` 给他看一遍再发布。Rank Math 的 SEO 评分在客户打开编辑页时才算出来（编辑页顶部的 Rank Math 按钮），保存一次后 `pages seo` 里的 `score` 才有值。
7. **之后再改**：一律走「改已有页面的一块」，不要再 `create`：同一批文件再运行会报 `already_created`（带已建好的 `id`）。只有客户明确要再建一个单独的副本，才加 `--new`。客户可能已经在编辑页里改过，所以每次都先 `pages get` 拿最新的内容再改，不要用 `pages/<短名>/` 里的旧文件。

## 4. 改已有页面的一块

1. **找到页面**：客户给了链接就直接用；没给就 `pages find --search 词`（或加 `--type`）找，拿不准是哪一页就列出来问客户。
2. **找到那一块**：`pages blocks <id或链接>`，按每块的 `text` 找客户说的那一块，拿不准就把几块的文字列出来问客户。
   - `kind` 是 `prose`（正文）、`static`（版式区块）、`config`（配置型组件）的能在这里改。
   - `prose` 是一串连着的正文，`text` 是它开头的一段话。客户自己在编辑器里写的段落也算 `prose`，你可以改。
   - `native`（视频、embed、别的插件的区块）：告诉客户请他在 WordPress 编辑器里改。
   - 报 `not_block_content`：整页都不是区块做的（经典编辑器或页面构建器），见下面的报错表。
3. **取出整页，只改一块**：`pages get <id>`（不写路径）把整页能改的区块都存下来，`notSaved` 里是存不了的块的文字。存下来的后缀就是这一块的类型：正文 `block-<路径>.md`（改 Markdown，写法见 `references/blocks/prose.md`）、版式 `block-<路径>.html`、配置型组件 `block-<路径>.json`（只改 `data`，写法见 `references/blocks/blocks.md`「配置型组件」）。三种的预览、替换命令写法完全一样，把文件名换掉就行。先把其他块都看一遍，改的这一块要和它们协调：沿用它们的颜色、字号、间距、按钮样式，正文沿用它们的语气和称呼。然后只改要改的那个文件，只改客户要改的地方；其他文件只作参考，不要改，也不要替换。
   - **一次只改一块，改完重新 `pages blocks`**。客户可能同时在编辑器里动过内容，路径会变（比如他往正文中间插了个视频，本来一块的正文就变成两块）。不要拿上一次的路径接着改第二处。
4. **已发布的页面先预览**：页面 `status` 是 `publish`（已上线）或 `future`（定时发布）的，替换后访客马上看到，所以先 `pages preview <id> <路径> pages/<id>/block-<路径>.<后缀>`。它打开的是这个页面本身，只有这一块换成了新的，线上页面不变。把 `previewUrl` 给客户看（要登录后台，7 天内有效；同一块再预览会覆盖上一次），客户可以来回改，预览多少次都行，线上页面一直不变。草稿不用预览，直接替换，让客户在编辑页里看。
5. **替换**：`pages replace <id> <路径> pages/<id>/block-<路径>.<后缀>`，把 `editUrl` 发给客户看效果。已发布的页面，客户看完预览说可以（「可以」「换上去」「上线吧」），这句话就是同意，不用再问一遍，替换时加 `--customer-said "客户原话"`。只对这一次、这一页有效，不用开关任何东西。客户没表态就不要替换。
   - 客户要一次改很多已发布的页面（比如每篇文章的同一块），才用 `pages edit-live on --customer-said "客户原话"`，改完马上 `pages edit-live off`，中间报错也要记得关。这个开关打开期间所有已发布的页面和产品都能改。
   - 报错怎么办：

     | 错误 | 意思 | 谁处理 | 怎么做 |
     |---|---|---|---|
     | `live_locked` | 页面已上线，没带客户的同意 | 你 | 给客户看预览，他同意后带 `--customer-said "原话"` 重试 |
     | `post_locked` | 这一页正开在 WordPress 编辑器里，现在改，客户一保存就会冲掉你的改动 | 客户 | 请客户在编辑器里保存并关掉这一页，最多等两三分钟再重试 |
     | `conflict` | 你取出之后页面被改过（客户可能在后台动过） | 你 | 重新 `pages get`，在新文件上把改动重做一遍 |
     | `slug_locked` | 已上线页面的网址不改，客户同意了也不改 | 客户 | 见下一节第 4 条 |
     | `not_block_content` | 这一页是用经典编辑器或 Elementor 等页面构建器做的，内容这里改不了 | 客户 | 把 `message` 转告客户，请他在原来的编辑器里改（`editUrl`）；SEO 标题、描述、关键词、特色图照常用 `pages seo` 改 |
     | `wrong_kind` | 拿错类型的文件去替换了（比如用 `.html` 替换一块正文） | 你 | 重新 `pages blocks` 看这一块的 `kind`，用对应后缀的文件 |
     | `not_editable` | 这一块是 `native`（视频、embed、别的插件的区块） | 客户 | 请客户在 WordPress 编辑器里改 |
     | `prose_unsupported` | 正文里写了 Markdown 不支持的东西，`message` 带行号 | 你 | 改写成 `prose.md` 允许的写法，或那一段改用 `.html` 版式区块 |
   - 客户后悔了：`get` 时原样存了一份 `pages/<id>/block-<路径>.orig.<后缀>`，用它再 `replace` 一次就恢复了。结果里 `revision` 为 true 的，客户也可以在编辑器的「修订」里自己恢复。

## 5. 改网址、SEO 标题、描述、关键词、特色图

1. `pages seo <id或链接>` 看现在的值：网址、SEO 标题、描述、核心和长尾关键词、特色图、Rank Math 评分 `score`（没算过是 null），以及 `checks`（核心关键词还缺在哪）。
2. 把要改的列成「现在 → 改成」给客户确认，再 `pages seo <id> --seo-title "…"`（只带要改的项；只改长尾词时核心词不变，反过来也一样）。规则和上面「定好 SEO 信息」一样。关键词缺在正文或大标题里的，按上一节改区块。
3. SEO 没有预览，第 2 步客户确认的那句话就是同意。已发布的页面加 `--customer-said "客户原话"`。报 `conflict` 就重新 `pages seo <id>` 再改，其他报错看上一节的表。
4. **已发布页面的网址不改**：搜索引擎收录的、别处链过来的都是这个网址，改了旧链接会失效。报 `slug_locked` 时（带了客户原话或开了 edit-live 也一样），把 `message` 转告客户：真要改，请他在 WordPress 后台自己改，并加上旧网址到新网址的跳转。标题、描述、关键词、特色图照常可以改。草稿的网址可以随便改。
5. **有的网站把分类写在文章网址里**（如 `/blog/<分类>/<网址>/`）。这种站上改一篇已发布文章的分类，等于改它的网址，所以会报 `category_locked`，处理方式和上一条一样：转告客户，请他在后台改并加跳转。草稿随便改；案例、解决方案这些网址里不带分类的类型也随便改。

# 台账车道

台账车道管的是长期内容运营：一个目录就是一个网站的内容工作区，关键词架构、每篇文章的计划、正文、内链、体检结果都在里面。你负责**生成**（关键词、silo 架构、文章正文），`puffergo silo` 负责**落库/推送/拉取**并持有 WordPress 凭据。你**从不**直接读 `.puffergo/sites/<域名>/workspace.json`、从不直接调 WordPress——一律通过 CLI。

## 1. 全自动工作流

1. **建工作区**（若 `silo status` 报 `no_workspace`）：
   `puffergo silo init --name "<站点名>" --url "<站点URL>" --tagline "<一句定位>"`
2. **规划 + 落库 + 生成骨架**：根据站点定位，产出一份 `plan.json`（schema 见下），然后：
   `puffergo silo plan plan.json`
   这会创建关键词、pillar/cluster 节点、内容投影，并为每篇内容在对应文件夹写出 `.md`（frontmatter，含 `purpose`）。
3. **写正文 / 调 SEO**：逐个打开生成的 `.md`，在 frontmatter 下方撰写文章正文（Markdown）。`purpose` 字段说明这篇的目的，照它写。
   - 正文完全归你；`title/slug/purpose/seoTitle/seoDescription/coreKeywords/longTailKeywords/internalLinks/externalLinks` 这些**扁平**字段可按需调整（push 时会从 frontmatter 读回并推送；`purpose` 只留本地不推 WP）。
   - `silo:` 和 `wp:` 这两段（嵌套）**绝不修改**——它们是系统 id/永久链接。
   - 内链用 `[[目标笔记的文件名|显示文字]]` 指向兄弟篇（push 时自动解析成真实永久链接）。用文件名，不用 slug——这样客户在笔记编辑器里能直接点开。
4. **发布**：`puffergo silo push` —— 把正文 + SEO + 分类推成 WordPress 草稿（已存在则只更新，不覆盖你之外的改动）。只推新建的和上次同步后改过的笔记；只想推某几篇，把笔记文件名写在后面：`puffergo silo push "<文件名>"`；点名的笔记没改过也会跳过，一定要重推加 `--force`。
   - 正文里的本地图片写相对工作目录根目录的路径（如 `images/a.png`）：pull 之后笔记可能换文件夹，相对笔记的路径会失效。
   - 报「这篇在 WordPress 里是用别的编辑器做的」：这篇不是区块内容，正文不能从这里改，告诉客户在 WordPress 编辑器里改；SEO 和分类照常能推。
5. **护栏自检**：每步后跑 `puffergo silo health`，读出的问题**自己修**（补内链消除孤岛、补分类归档 SEO、核心词进标题等），修完再 `puffergo silo push`。目标：critical 归零。
6. **给客户看**：`puffergo silo view` —— 生成一张只读预览页并在客户自己的浏览器里打开，左上角可切「总览」关系图（silo 结构、内链流向、孤岛红圈）和「结构」树。规划完、体检完、推送完都可以让他看一眼。这是只读的，改内容和发布仍然走上面的命令。
7. **同步**：需要时 `puffergo silo pull` 从 WordPress 拉回最新状态，正文也拉回来（Markdown）。改一篇已有的文章，先 `puffergo silo pull <文章 id>` 只拉这一篇，再改它的笔记。有没推送的改动的笔记，拉取不会覆盖它的正文。pull 会按网站上的类型和分类重新放笔记：同一类型的放在一个文件夹里（文章、成功案例、解决方案……），里面再按分类分文件夹，所以笔记位置可能变，用 `silo.id` 认笔记，不要记路径。网站上用版式区块、配置组件或别的编辑器做的文章，正文不会拉回本地（Markdown 表达不了那些块），它们的正文改动仍在 WordPress 里做。

## 2. plan.json schema

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

- `nodes[].parent` / `contents[].node` / `contents[].internalLinks` 都用**计划内的 `key`** 互相引用；CLI 会解析成真实 id。
- `intent`：informational | commercial | transactional | navigational。
- `isCategory: true` 表示该节点回推为真实 WordPress 分类（有归档页 SEO）。

## 3. 台账车道命令

| 命令 | 作用 |
|---|---|
| `puffergo silo init --name --url [--tagline]` | 建工作区 |
| `puffergo silo plan <plan.json>` | 应用计划、写 md 骨架 |
| `puffergo silo push [笔记…] [--force]` | 推正文+SEO+分类到 WP 草稿（默认只推新建和改过的） |
| `puffergo silo pull [文章 id…] [--types post,page]` | 从 WP 拉取同步（含正文；写 id 只拉这几篇） |
| `puffergo silo health` | 健康检查（护栏） |
| `puffergo silo status` | 概览：节点/内容/关键词/待推送/健康 |
| `puffergo silo view [--out <path>]` | 生成只读预览页并用浏览器打开（关系图 + 结构树），给客户看 |

所有命令默认作用于当前目录，可用 `--dir <path>` 指定。一个目录可能连了多个站点，这时用 `--site <域名>` 指定；不写就用客户上次用的那个。

命令成功时输出人话，照着念给客户就行。**出错时输出一个 JSON**：`{"ok": false, "code": "…", "message": "…"}`，按 `code` 处理：

| 错误 | 意思 | 谁处理 | 怎么做 |
|---|---|---|---|
| `not_logged_in` | 这个站还没授权过 | 客户 | 按上面「授权」走一遍，再重试 |
| `no_workspace` | 这个目录还没建过工作区 | 你 | 走快车道，或按上面第 1 步 `silo init` 建台账 |
| `workspace_exists` | 这个目录已经有工作区了 | 你 | 不要重建，直接用；客户确实要重来才加 `--force` |
| `site_required` | 这个目录连了多个站点 | 你 | 按 `message` 里列出的站点问客户要哪个，再加 `--site <域名>` 重试 |
| `site_not_found` | `--site` 写的站点这个目录里没有 | 你 | 用 `message` 里列出的站点名重试 |
| `usage` | 命令参数写错了 | 你 | 按 `message` 里的用法重写 |
| `file_not_found` | 找不到 plan 文件 | 你 | 核对路径，或者先把 plan.json 写出来 |
| `invalid_json` | plan 文件不是合法 JSON | 你 | 按 `message` 里的位置改 |
| `no_profile` | 没有工作区，plan 里也没写 profile | 你 | 先 `silo init`，或在 plan 里补 `profile` |
| `note_not_found` | 点名要推的笔记找不到 | 你 | 用 `silo status` 看真实的笔记名再重试 |
| `post_not_found` | 点名要拉的文章 id 找不到 | 你 | 用文章 id（编辑页地址里 `post=` 后面的数字），不是 slug |
| `update_plugin` / `update_skill` | 网站的插件或本技能太旧 | 客户 | 把 `message` 转告客户，等他升级好再继续 |
| `error` | 其他错误 | 你 | 把 `message` 读懂再决定；看不懂就转告客户 |

## 4. 写作规则（护栏）

- **SEO 长度**：只是建议，以 `puffergo silo health` 的提示为准（区间按宽度算，中日韩文字每个字算 2、其他算 1；`pull` 过一次后按站点插件给的区间）。客户就想要某个长度就照他的，health 的长度提示可以不改；核心词进 seo.title 和正文首段。过长会被 SERP 截断，过短浪费展示位。
- **焦点关键词数量**：每页 **恰好 1 个** coreKeywords（主焦点词）+ longTailKeywords。长尾词最多 **5 个**（装没装 PufferGo 插件都一样）；`puffergo silo health` 会提示，多写的推送时会被丢掉。
- **内链**：每篇至少 1 进 1 出，别留孤岛；正文里用 `[[目标笔记的文件名|显示文字]]`。
- **字段归属**：`title/slug/seo/internalLinks/externalLinks` 可按需调整；`silo:`/`wp:` 归 CLI，勿改；**正文完全归你**。
- **不造假外链**：externalLinks 只填真实存在的权威 URL。

# 两条车道共用

## 分类

文章、案例、解决方案这类内容要归到分类里，页面不归（`pages types` 里 `taxonomy` 是 null）。分类是客户自己的架构，**你不要凭空建**：`--category` 只认网站上已有的 slug，写错会报 `unknown_category`。

客户要建或整理分类（比如发来一张分类脑图），写工作目录里的 `<类型>-categories.json`（如 `post-categories.json`），给客户过目，确认后运行 `pages categories <类型> push`：

```json
{
  "categories": [
    { "name": "Industrial Valves", "slug": "industrial-valves", "description": "…",
      "children": [{ "name": "Gate Valves", "slug": "gate-valves" }] }
  ]
}
```

- `name` 必填；`slug` 必填，小写英文、数字和连字符，全文件不重复；`description` 可选；`children` 是下一级。
- 按 `slug` 对应网站上的分类：没有就新建，不会删除。已有的分类默认不改（结果里的 `leftAlone`），打开 `edit-live` 后才更新名称、描述和上级。
- 建议客户不超过三级。
- 这里**没有** `order`：这些分类按名称排，写了会报错。产品分类才有排序（那是 puffergo-wordpress-products 技能）。
- 客户要看分类，就按树状列出来（上级在前，下级缩进）；分类数据在 `pages types` 里这个类型的 `taxonomy.categories` 里，每项的 `parent` 是上级的 slug。
- 台账车道的分类由 `silo plan` 的 `nodes`（`isCategory: true`）管，推送时自动建；不要另外写 `<类型>-categories.json`。

## 写区块

动手之前先读对应的写法：正文 `references/blocks/prose.md`（Markdown），版式 `references/blocks/static.md`（Tailwind HTML），页面里各种区块是什么见 `references/blocks/blocks.md`。这里只补页面特有的三条：

- **哪种类型用哪种写法**（按 `pages types` 里的 `layout`，这是硬规则）：
  - `inTemplate`（文章、案例等）：网站模板已经有标题、特色图和导航。**正文一律 `.md`**，不要再写一个带标题的大 hero；只有对比表、规格卡、CTA、FAQ 这类 Markdown 表达不了的版式才用 `.html`（多用 `max-w-focus`，和正文栏对齐）。
  - `fullWidth`（页面）：段落就是整页，全部用 `.html`，第一段通常是标题大图。**绝不要用 `.md`**——`.md` 在 fullWidth 页面会被当成没有容器的原生 prose 块，左右没有 `max-w-canvas` 约束、零 padding，内容直接怼到浏览器边。一旦踩了，只能删块重建（`pages replace` 不允许 prose→static 跨类型替换）。
- **链接**：网站上已发布页面的地址，用 `pages find --status publish` 查到的 `link`。
- **别把正文写成 HTML**。大段文字放进 `.html` 区块，客户在编辑器里就改不动了，只能回头找你——这正是要避免的事。

## 内容规则

- 公司信息、数据、客户名称、认证、价格只来自客户，没给就问，不编。也不加客户没说过的评价，如 leading、best、top、state-of-the-art、world-class——**这是提醒不是禁令**：客户自己的资料里就是这么写的、或他明确要这么写，照他的。
- 产品名和行业术语照客户的原意准确翻译（例如 截止阀 是 globe valve，止回阀 才是 check valve）；拿不准的，过目时把中英对照列给客户确认。
- 文案用英文（客户另有要求除外），和客户对话用客户的语言。

## 安全

- 网站凭据在客户电脑的 `~/.puffergo/credentials.json`，**只有脚本读它**。你不要打开它、不要 `cat`/读取/搜索它、也不要把内容贴进对话——这是硬规定。要知道这台电脑授权过哪些网站，用命令的输出（`no_site` 错误里的 `sites`、`silo status`），不要读凭据文件。可用 `--config`/`PUFFERGO_CONFIG` 覆盖路径。凭据只在这一处，不会写进工作目录，所以不会被 Obsidian Sync/Publish 同步出去。
- 你不直接请求 WordPress，一律通过 `puffergo`；发布只经 `pages publish` 或 `silo push`。
