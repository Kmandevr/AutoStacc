---
paths:
  - "data/**/*.js"
---

# Content data

- A data file only assigns literal data: `window.NAME = ...`. No functions, computed values, DOM or presentation logic. The scripts in `js/` decide how it looks.
- Keep the existing field names and shapes. Their readers are `js/*.js`; if a shape must change, change the file's header comment and every reader in the same change (find readers with Grep for the field name).
- Dates are `YYYY-MM-DD`. Prices are numbers. Empty strings mean "not set yet" (for example `email: ""`). Never a fake value: no example.com email, no bare `https://instagram.com/` as a profile.
- No placeholder content: every placeholder was removed (owner, 2026-10-21, #173). A fact not known yet is an empty string, never a stand-in; ask the owner or open an issue. `draft: true` on a creator, project or poll keeps it off the site until the owner publishes it.
- Products, Stacclets, Pacs, releases and events are not data files: every creator, first-party included, makes them in the Studio (Product Studio, Music and Events editors; store database, `server/content/`, `docs/creators.md`). The code-based catalog is retired (owner, 2026-10-21, #176): never re-create data/products.js, pacs.js, stacclets.js, music.js, news.js or shows.js. News waits for each creator's community (#174).
- `id` fields are page addresses (`/<creator>`, `/<creator>/<id>`): lowercase-hyphenated, never changed once published. `data/site.js` is AutoStacc (the platform); a project's identity (name, bio, profiles, contact, newsletter) is its entry in `data/projects.js`.
- Everything a project has in `data/` names it: `project: "<id>"` on polls. `release:` refs can't be checked from `data/` and are refused. Platform links (creators, projects, polls, relationships) are checked by `scripts/lib/platform.js`; the build fails on a broken one. Model: `docs/architecture.md`.
- `scripts/build.js` turns creators, projects and polls into `db/catalog.sql` (the deploy's platform sync); prices only ever come from the store database. A Studio product's `type` must be a key of `data/product-types.js`; a new kind of product is a new entry there, not new code.
- After any change in `data/`, run `node scripts/build.js` (it regenerates heads, profiles, trust pages, the sitemap and the platform sync), then the `seo-check` skill. Readers are also in `scripts/` (Grep there too when a field changes).
- Start with a `//` comment saying what the file holds and documenting any non-obvious field.
