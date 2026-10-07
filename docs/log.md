---
title: Log
summary: Dated history of changes, newest first.
updated: 2026-10-07
---

# Log

Newest first.

- 2026-10-07: Made Serena useful for JS: `js/jsconfig.json` and `js/globals.d.ts` (editor-only) plus `const GS` in `util.js` let it follow `window.GS` helpers across files; documented `depth: 2` for script overviews. `tree.sh` reads purposes from `.ts` and `.json` files.
- 2026-10-07: Fixed #14, #21, #22 and #23: footer links are 24px+ tall, `hue: 0` renders red, a shared cyan `:focus-visible` ring with `aria-pressed` on the shop filters, and reduced motion now also stops card/button motion and smooth scrolling.
- 2026-10-07: Owner approved all Serena tools (`mcp__serena` in `.claude/settings.json`) and set up the GitHub Project board. Closed #12 and #13.
- 2026-10-07: Cleanup pass: Serena now covers JS, HTML and CSS and has `remind`/`cleanup` hooks; Serena installs at session start; `graph.sh` only rebuilds when files change; merged seven overlapping tooling entries in `decisions.md` into one; trimmed the README layout list.
- 2026-10-07: Added four subagents and split the rules into html, js, css, data, docs and claude. Tested each agent headlessly; findings filed as issues #21 to #23.
- 2026-10-07: Naming cleanup: `.area` to `.purpose`, skill `tasks`, workflow `clear-status-on-close`, label cleanup, removed `.github/project-setup.md` (now issue #13).
- 2026-10-07: Moved tasks to GitHub Issues (labels, issue forms, PR template, `tasks` skill). Retired `docs/status.md`; its items are issues #4 to #16.
- 2026-10-07: Added Serena (`.mcp.json`, `.serena/project.yml`, `.claude/tools/serena.sh`) and five skills under `.claude/skills/`. `CLAUDE.md` now points to them. No site files changed.
- 2026-10-07: Made the tooling modular: compact map, lazy `graph.sh`, path-scoped rules, generic `change` workflow, `.claude/README.md`. Slimmed `CLAUDE.md`.
- 2026-10-07: Added the `site-change` workflow and a Workflow section in `CLAUDE.md`. Syntax-checked only.
- 2026-10-07: Session hook now prints a one-line-per-file repo map (`.claude/hooks/tree.sh`). Added `summary:` to every note.
- 2026-10-07: Refactored `js/main.js` into `js/{util,layout,shop,news,shows,newsletter}.js` and `css/style.css` into `css/{base,layout,shop,news,home}.css`. Pages load only what they use. Added the "Read in layers" rule to `CLAUDE.md`, `.graphifyignore`, the Graphify session hook and allow rules.
- 2026-10-06: Added the notes vault in `docs/` and `CLAUDE.md`.
- 2026-10-06: Built the first version of the site: home, shop and news pages, with placeholder content.
