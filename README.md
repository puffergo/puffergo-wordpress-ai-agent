# PufferGo WordPress AI Agent

**WordPress AI agent skills and CLI for B2B manufacturer websites.** Upload products to your own WordPress site by talking to Claude Code, Codex or any agent that supports Agent Skills (`SKILL.md`) — one product or a whole catalog — build and edit pages, and plan an SEO silo of pillar and cluster pages.

[PufferGo](https://puffergo.com) · [WordPress plugin](https://puffergo.com/wp) · [中文说明](README.zh-CN.md)

📖 **Step-by-step guide (Chinese, with screenshots): [用 AI 上传网站产品](https://puffergo.com/docs/ai-product-upload/)** — install the skill in 豆包 / 千问 / WorkBuddy / Claude Code / Codex, connect your site, review and publish.

- **Your site, your credentials.** The agent never sees your WordPress password. A one-click WordPress Application Password is stored on your own machine (`~/.puffergo/credentials.json`, owner-only) and read only by the bundled script.
- **Validated in code, not by prompt.** Every product is checked by the script and by your site before anything is written. Errors come back as structured JSON (`path`, `code`, `message`, `fix: "ai" | "user"`), so the agent fixes what it can and asks you about the rest.
- **Drafts by default. Nothing is ever deleted.** Publishing, and changing anything already live, requires your own words asking for it. There is no delete command.

## What's inside

| | |
|---|---|
| `skills/puffergo-wordpress-products` | Agent Skill: turn product photos and notes into product pages (title, specs, price/MOQ/lead time, gallery, image-and-text detail sections), push as drafts, edit later, publish on request. |
| `skills/puffergo-wordpress-content` | Agent Skill: build pages, posts and case studies as drafts (Markdown body text plus Tailwind layout sections), with SEO title, description and keywords; edit one section of an existing page after a preview; change SEO fields. When the site runs a content strategy, also the whole SEO silo — expand the positioning into keywords and a pillar/cluster architecture, write the articles in a local vault, push them as drafts with Rank Math titles, keywords and internal links, pull back from WordPress and run an SEO health check. |
| `packages/cli` | The `puffergo` command every skill runs (bundled into each skill as `scripts/puffergo.mjs`, Node 18+, no dependencies). |
| `packages/silo-core` | `@puffergo/silo-core`: the silo data model, WordPress REST client, sync and health check. |

## Requirements

- Node.js 18 or newer. If it is missing or too old, the agent gives you the one-line install command — it does not install software on your machine.
- A WordPress site you administer.
- **Product upload** needs the PufferGo WordPress plugin **0.35.0 or newer**, which provides the product type and the validation endpoints.
- **Pages, posts and case studies** need the PufferGo WordPress plugin **0.36.0 or newer** (Markdown body text, Tailwind blocks and the content endpoints).
- **SEO silo** works on WordPress with Rank Math for the SEO fields; importing existing keywords needs the PufferGo plugin.

An older plugin answers with a content format this CLI no longer speaks, and every command stops with
`update_plugin` — update the plugin on the site first.

## Install a skill

Send this to your AI agent (Claude Code, Codex, WorkBuddy, 豆包 or 千问 desktop in work mode, and most agents that support skills):

```text
Install this skill: https://github.com/puffergo/puffergo-wordpress-ai-agent/tree/main/skills/puffergo-wordpress-products
```

The agent downloads and installs it, and installs Node.js on first use if it is missing. Then ask in plain language:

> Upload the photos in `~/Desktop/pg-500` as a new product: PG-500 Industrial 3D Printer, build volume 500×500×500 mm, MOQ 1 set, lead time 15–25 days. Save it as a draft.

The first run opens WordPress in your browser; click **Approve** once and the site stays connected.

The full walkthrough — connecting the site, reviewing drafts, product samples, trade-info fields and FAQ — is in the [guide](https://puffergo.com/docs/ai-product-upload/).

## CLI

```text
puffergo login <siteUrl>
puffergo products schema | list [--search q] | check | push | pull <key|id> | publish <key…> --customer-said "…"
puffergo pages find | blocks <id> | get <id> | preview | create | replace <id> <path> <file> | seo <id>
puffergo silo init | plan <plan.json> | push | pull | health | status
```

Every command prints one JSON object to stdout for the agent; human hints go to stderr. See each skill's `SKILL.md` for the product file format and the workflow.

## Develop

```bash
pnpm install
pnpm build   # bundles packages/cli into skills/*/scripts/puffergo.mjs
pnpm test
```

## Contributing

Pull requests are welcome. This repo is generated from PufferGo's internal repo, so a pull request is not merged here directly: a maintainer imports it there, with you as the author, and it comes back in the next release. Your pull request is then closed with a link to that commit.

## License

GPL-3.0-or-later ([text](LICENSE)) — free to use, modify, and share, including commercially.
The only condition: if you distribute this software (or a derivative of it) to others, you must
do so under the same license, with source code and this copyright notice. Using it privately or
on your own sites carries no obligations at all.
