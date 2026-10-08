---
paths:
  - "data/**/*.js"
---

# Content data

- A data file only assigns literal data: `window.NAME = ...`. No functions, computed values, DOM or presentation logic. The scripts in `js/` decide how it looks.
- Keep the existing field names and shapes. Their readers are `js/*.js`; if a shape must change, change the file's header comment and every reader in the same change (find readers with Grep for the field name).
- Dates are `YYYY-MM-DD`. Prices are numbers. Empty strings mean "not set yet" (for example `email: ""`). Never a fake value: no example.com email, no bare `https://instagram.com/` as a profile.
- `draft: true` marks placeholder content: kept out of search (and news posts, shows and releases off the site) until the owner confirms it.
- `id` fields are page addresses (`/shop/<id>`, `/<creator>/<id>`, `/<creator>/<project>/music/<id>`, `/<creator>/<project>/news/<id>`): lowercase-hyphenated, never changed once published. `data/site.js` is AutoStacc (the platform); a project's identity (name, bio, profiles, contact, newsletter) is its entry in `data/projects.js`.
- Everything a project publishes names it: `project: "<id>"` on products, releases, news posts, Stacclets and polls (Pacs point at their Stacclet). Platform links (projects, Stacclets, Pacs, products' `pacs`, polls, relationships) are checked by `scripts/lib/platform.js`; the build fails on a broken one. Model: `docs/architecture.md`.
- `data/products.js` is also the store catalog: `scripts/build.js` turns it into `db/catalog.sql`, and checkout charges exactly that price. A product `type` must be a key of `data/product-types.js`; a new kind of product is a new entry there, not new code.
- After any change in `data/`, run `node scripts/build.js` (it regenerates heads, item pages, the sitemap and the catalog), then the `seo-check` skill. Readers are also in `scripts/` (Grep there too when a field changes).
- Start with a `//` comment saying what the file holds and documenting any non-obvious field.
