---
paths:
  - "docs/**"
  - "README.md"
---

# Notes in docs/

- Notes describe what the repository actually does. Check the code or config before writing about it, and keep notes short.
- Frontmatter on every note: `title`, `summary` (one line, shown in the repo map), `covers` (when the note describes code: a one-line list of the files, `dir/` folders or `*` globs it documents, e.g. `[server/cart/, data/product-types.js]`), `updated`.
- When code a note covers changes, re-check that note in the same change and bump `updated`. New code areas get a note's `covers:` entry. `node scripts/docs-test.js` checks all of this (CI and `release-check`); the Stop hook reminds you, and on pull requests CI fails a stale note (`--strict`), so re-check it and at least bump `updated:`.
- `README.md` is the front door for someone new: it must name every top-level page and folder, workflow, npm script and data file (the check fails otherwise), and its `covers:` list is the HTML comment on its first line.
- Relative markdown links (`[text](other.md)`), not `[[wikilinks]]`.
- Architecture or tooling decisions go in `decisions.md` when they change, with the reason. Add a line to `log.md` for every session's changes. Tasks live in GitHub Issues, not here.
