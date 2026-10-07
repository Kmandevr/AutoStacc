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

## 2026-10-07: Graphify for project knowledge

The project will grow a lot, so [Graphify](https://github.com/Graphify-Labs/graphify) (free, MIT, runs locally, no API key for code) builds a knowledge graph of the repo. A cloud-session start hook (`.claude/hooks/session-start.sh`) installs it and rebuilds the graph. `.claude/settings.json` allows `graphify` commands. `graphify-out/` is git-ignored because it is regenerated each session. `docs/` stays the source of facts about the artist and decisions.

## 2026-10-07: One file per feature, loaded per page

Split `js/main.js` and `css/style.css` so a change touches only the files for that feature, and each page loads only what it uses. Still plain scripts and stylesheets with no build step and no ES modules (so pages work from `file://`). Shared helpers are on `window.GS` (`js/util.js`).

## 2026-10-07: Read in layers

So an agent only reads and edits what a task needs: layer 0 is a repo map printed by the session-start hook (built from each file's own purpose line, so it can't go stale), layer 1 is Graphify queries, layer 2 is the specific file or lines. Rule and conventions are in `CLAUDE.md`.

## 2026-10-07: Saved multi-agent workflow for site changes

`site-change` (`.claude/workflows/site-change.js`) plans, builds in parallel on disjoint files, verifies with a browser check and an adversarial review, then updates docs. Kept to about 5 agents so cost stays modest. It does not commit, so the owner or the session reviews the diff first. Not yet run on a real task.

## 2026-10-07: Modular tooling, loaded only when needed

Goal: things used every session stay small; the rest loads on demand. Changes: the session hook prints only a compact top-level map (directories summarised from `.area` files, so output doesn't grow with the repo); Graphify moved behind `.claude/tools/graph.sh`, which installs and refreshes it only when called (supersedes the earlier "hook installs Graphify" decision); conventions moved from `CLAUDE.md` into path-scoped `.claude/rules/`; the workflow was renamed `change` and made project-agnostic (it runs the checks listed in `CLAUDE.md`). `.claude/` is documented in `.claude/README.md` so it can be reused in other projects.

## 2026-10-07: Serena for symbol-level code work, Skills for repeatable tasks

Serena (project-scoped MCP server via `.mcp.json`, JavaScript only) handles symbol lookup, references and targeted edits; Graphify stays the project-level map, so the two don't overlap (table in `.claude/README.md`). Serena's file, shell and memory tools are switched off because Claude Code already has them and `docs/` is the memory. Skills in `.claude/skills/` (`verify-site`, `add-product`, `add-news`, `accessibility-review`, `release-check`) hold the repeatable workflows, so `CLAUDE.md` only points to them. No HTML or CSS language server: those files are small and Grep is enough.

## 2026-10-07: GitHub Issues and labels are the task list

Issues are the work items, PRs the implementation (`Closes #N`), `docs/` only permanent knowledge. State lives in a small label set (status, priority, type, area) because Claude sessions can't read or edit GitHub Projects (GraphQL and user-level APIs are blocked); the Project board, if set up, is a human view over those labels (`.github/project-setup.md`). Sessions claim an issue with `status: in progress` plus a `Claimed: <branch>` comment, earliest claim wins. `docs/status.md` was retired and its open items migrated to issues, so there is one task list. A small workflow clears status labels when an issue closes. Workflow for Claude: `.claude/skills/github-workflow/SKILL.md`.

