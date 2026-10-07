---
title: Log
summary: Dated history of changes, newest first.
updated: 2026-10-07
---

# Log

Newest first.

- 2026-10-07: Added Serena (`.mcp.json`, `.serena/project.yml`, `.claude/tools/serena.sh`) and five skills under `.claude/skills/`. `CLAUDE.md` now points to them. No site files changed.
- 2026-10-07: Made the tooling modular: compact map, lazy `graph.sh`, path-scoped rules, generic `change` workflow, `.claude/README.md`. Slimmed `CLAUDE.md`.
- 2026-10-07: Added the `site-change` workflow and a Workflow section in `CLAUDE.md`. Syntax-checked only.
- 2026-10-07: Session hook now prints a one-line-per-file repo map (`.claude/hooks/tree.sh`). Added `summary:` to every note.
- 2026-10-07: Refactored `js/main.js` into `js/{util,layout,shop,news,shows,newsletter}.js` and `css/style.css` into `css/{base,layout,shop,news,home}.css`. Pages load only what they use. Added the "Read in layers" rule to `CLAUDE.md`, `.graphifyignore`, the Graphify session hook and allow rules.
- 2026-10-06: Added the notes vault in `docs/` and `CLAUDE.md`.
- 2026-10-06: Built the first version of the site: home, shop and news pages, with placeholder content. See [status](status.md).
