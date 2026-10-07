---
title: Decisions
updated: 2026-10-06
---

# Decisions

## 2026-10-06: Static site, no build step

Plain HTML, CSS and JS. Free to host anywhere (GitHub Pages, Netlify, Cloudflare Pages) and easy to edit. Revisit if a cart or accounts are needed.

## 2026-10-06: Hosted checkout instead of our own payments

Selling digital files needs payment and secure delivery. A hosted provider handles both, so the site stays static and never touches card data. Provider not chosen yet (see [status](status.md)).

## 2026-10-06: Content lives in `data/*.js`

So content can be changed without editing HTML. See [shop](shop.md).

## 2026-10-06: Notes in `docs/` as an Obsidian-compatible vault

Gives the assistant memory across sessions and lets the owner read and edit the same notes in Obsidian. Relative markdown links so they also render on GitHub.

## 2026-10-07: Graphify for project knowledge

The project will grow a lot, so [Graphify](https://github.com/Graphify-Labs/graphify) (free, MIT, runs locally, no API key for code) builds a knowledge graph of the repo. A cloud-session start hook (`.claude/hooks/session-start.sh`) installs it and rebuilds the graph. `.claude/settings.json` allows `graphify` commands. `graphify-out/` is git-ignored because it is regenerated each session. `docs/` stays the source of facts about the artist and decisions.

## 2026-10-07: One file per feature, loaded per page

Split `js/main.js` and `css/style.css` so a change touches only the files for that feature, and each page loads only what it uses. Still plain scripts and stylesheets with no build step and no ES modules (so pages work from `file://`). Shared helpers are on `window.GS` (`js/util.js`). The "Where to work" table in `CLAUDE.md` maps tasks to files.

