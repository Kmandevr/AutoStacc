---
paths:
  - "docs/**"
---

# Notes in docs/

- Notes describe what the repository actually does. Check the code or config before writing about it, and keep notes short.
- Frontmatter on every note: `title`, `summary` (one line, shown in the repo map), `covers` (when the note describes code: a one-line list of the files, `dir/` folders or `*` globs it documents, e.g. `[server/cart/, data/products.js]`), `updated`.
- When code a note covers changes, re-check that note in the same change and bump `updated`. New code areas get a note's `covers:` entry. `node scripts/docs-test.js` checks all of this (CI and `release-check`); the Stop hook reminds you.
- Relative markdown links (`[text](other.md)`), not `[[wikilinks]]`.
- Architecture or tooling decisions go in `decisions.md` when they change, with the reason. Add a line to `log.md` for every session's changes. Tasks live in GitHub Issues, not here.
