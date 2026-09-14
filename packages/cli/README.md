# PufferGo WordPress AI Agent

**WordPress AI agent skills and CLI for B2B manufacturer websites.** Upload products to your own WordPress site by talking to Claude Code, Codex or any agent that supports Agent Skills (`SKILL.md`) — one product or a whole catalog — and plan an SEO silo of pillar and cluster pages.

[中文说明](README.zh-CN.md)

- **Your site, your credentials.** The agent never sees your WordPress password. A one-click WordPress Application Password is stored on your own machine (`~/.puffergo/credentials.json`, owner-only) and read only by the bundled script.
- **Validated in code, not by prompt.** Every product is checked by the script and by your site before anything is written. Errors come back as structured JSON (`path`, `code`, `message`, `fix: "ai" | "user"`), so the agent fixes what it can and asks you about the rest.
- **Drafts by default. Nothing is ever deleted.** Publishing requires your own words asking for it. There is no delete command.

## What's inside

| | |
|---|---|
| `skills/wordpress-bulk-product-upload` | Agent Skill: turn product photos and notes into product pages (title, specs, price/MOQ/lead time, gallery, image-and-text detail sections), push as drafts, edit later, publish on request. |
| `skills/wordpress-seo-silo` | Agent Skill: expand a site's positioning into keywords and a pillar/cluster silo, write the articles, push them as WordPress drafts with Rank Math titles, keywords and internal links, and run an SEO health check. |
| `packages/cli` | The `puffergo` command both skills run (bundled into each skill as `scripts/puffergo.mjs`, Node 18+, no dependencies). |
| `packages/silo-core` | `@puffergo/silo-core`: the silo data model, WordPress REST client, sync and health check. |

## Requirements

- Node.js 18 or newer.
- A WordPress site you administer.
- **Product upload** needs the PufferGo WordPress plugin, which provides the product type and the validation endpoints.
- **SEO silo** works on WordPress with Rank Math for the SEO fields; importing existing keywords needs the PufferGo plugin.

## Install a skill

Copy a folder from `skills/` into your agent's skills directory — for Claude Code, `~/.claude/skills/` (all projects) or `<project>/.claude/skills/`. Then ask in plain language:

> Upload the photos in `~/Desktop/pg-500` as a new product: PG-500 Industrial 3D Printer, build volume 500×500×500 mm, MOQ 1 set, lead time 15–25 days. Save it as a draft.

The first run opens WordPress in your browser; click **Approve** once and the site stays connected.

## CLI

```text
puffergo login <siteUrl>
puffergo products schema | list [--search q] | check | push | pull <key|id> | publish <key…> --customer-said "…"
puffergo silo init | plan <plan.json> | push | pull | health | status
```

Every command prints one JSON object to stdout for the agent; human hints go to stderr. See the two `SKILL.md` files for the product file format and the workflow.

## Develop

```bash
pnpm install
pnpm build   # bundles packages/cli into skills/*/scripts/puffergo.mjs
pnpm test
```

## License

MIT
