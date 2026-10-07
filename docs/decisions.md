---
title: Decisions
summary: Dated record of what was chosen and why.
updated: 2026-10-07
---

# Decisions

## 2026-10-06: Static site, no build step

Plain HTML, CSS and JS. Free to host anywhere (GitHub Pages, Netlify, Cloudflare Pages) and easy to edit. Revisit if a cart or accounts are needed.

## 2026-10-06: Hosted checkout instead of our own payments

Selling digital files needs payment and secure delivery. A hosted provider handles both, so the site stays static and never touches card data. Provider not chosen yet (tracked as a GitHub issue).

## 2026-10-06: Content lives in `data/*.js`

So content can be changed without editing HTML. See [shop](shop.md).

## 2026-10-06: Notes in `docs/` as an Obsidian-compatible vault

Gives the assistant memory across sessions and lets the owner read and edit the same notes in Obsidian. Relative markdown links so they also render on GitHub.

## 2026-10-07: Claude tooling is layered and loads on demand

The project will grow, so the always-loaded context stays small and everything else loads only when needed. One home per kind of instruction (table in `.claude/README.md`): `CLAUDE.md` for global rules, `.claude/rules/` for per-file-type conventions, `.claude/skills/` for procedures, `.claude/agents/` for read-only reviewers that return findings only, `.claude/workflows/change.js` for multi-agent changes. Reading goes in layers: the repo map printed at session start (from each file's purpose line and each directory's `.purpose`), then Graphify (`tools/graph.sh`, installed and refreshed on call, code-only so no API key), then Serena for symbols (project MCP server for JavaScript, HTML and CSS; its file, shell and memory tools are off because Claude Code has them and `docs/` is the memory; a `remind` hook nudges toward symbol tools), then the file itself. Graphify answers "what depends on what", Serena "where is X and who uses it".

## 2026-10-07: One file per feature, loaded per page

Split `js/main.js` and `css/style.css` so a change touches only the files for that feature, and each page loads only what it uses. Still plain scripts and stylesheets with no build step and no ES modules (so pages work from `file://`). Shared helpers are on `window.GS` (`js/util.js`).

## 2026-10-07: GitHub Issues and labels are the task list

Issues are the work items, PRs the implementation (`Closes #N`), `docs/` only permanent knowledge. State lives in a small label set (status, priority, type, area) because Claude sessions can't read or edit GitHub Projects (GraphQL and user-level APIs are blocked); the Project board (set up by the owner, issue #13) is a human view over those labels. Sessions claim an issue with `status: in progress` plus a `Claimed: <branch>` comment, earliest claim wins. `docs/status.md` was retired and its open items migrated to issues, so there is one task list. The `clear-status-on-close` workflow clears status labels when an issue closes. Workflow for Claude: `.claude/skills/tasks/SKILL.md`.

## 2026-10-07: Stitching as a feel, seamless page changes

The owner wants the whole site to read as a glitching terminal that feels pieced together, without literal sewing lines, and with page changes and clicks that never feel like a stop. Dashed "stitch" borders and the stitched seam were replaced by stepped panel edges, misregistered layers and a misaligned monogram. Page changes use cross-document view transitions (pure CSS, no build step; unsupported browsers just load normally), ambient loops follow wall-clock time, and a small random "zap" keeps glitches happening. Details in [brand](brand.md).

## 2026-10-07: Owner-written identity is the creative source of truth

The owner described the project's identity (method, the loop, sound, visuals, personality) in full. It lives in [identity](identity.md) and `CLAUDE.md` points to it for every creative task. The site's hero, About copy and new "The loop" section follow it, and the earlier placeholder About copy ("bass music", live-set claims) was removed because it contradicted or went beyond it.

## 2026-10-07: Clean addresses, home page at /home

The owner wants the site at `AutoStacc.com` with named pages: `/home`, `/shop`, `/news`. The home page file is `home.html` (Cloudflare Pages serves `name.html` at `/name` and redirects `.html` links there), and `_redirects` sends `/` to `/home`. Links in the code stay as `shop.html` etc. so pages still open locally. The root redirect is a 302 so it can be changed later without browsers caching it.

## 2026-10-07: Terminal theme in purple, green and black

The owner asked for a neon purple, phosphor green and black look, like an old terminal. Colours stay as tokens in `css/base.css`; product `hue` now only picks green or purple so covers stay on palette. Details in [brand](brand.md).

## 2026-10-07: Hosted on Cloudflare Pages, HTTPS from Cloudflare

The domain, `autostacc.com`, is on Cloudflare, so the site is hosted on Cloudflare Pages (project `autostacc`). It deploys from GitHub Actions (`.github/workflows/deploy.yml`, Wrangler with an API token in repo secrets) rather than Cloudflare's own GitHub connection, which kept looping back to the dashboard during setup. The workflow uploads only the pages, `css/`, `js/` and `data/`, not `docs/` or `.claude/`. Cloudflare issues and renews the HTTPS certificate for the custom domain itself. The custom domain `autostacc.com` is attached to the Pages project (live 2026-10-07). `autostacc.pages.dev` can't be deleted, so a Cloudflare Bulk Redirect (set up in the dashboard, not in this repo) sends it to `https://autostacc.com` with path and query kept. Cloudflare Origin Certificates are not used: there is no origin server to install one on, and their private keys never go in this repo.
