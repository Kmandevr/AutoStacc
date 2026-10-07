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
