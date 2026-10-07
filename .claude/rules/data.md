---
paths:
  - "data/**/*.js"
---

# Content data

- A data file only assigns literal data: `window.NAME = ...`. No functions, computed values, DOM or presentation logic. The scripts in `js/` decide how it looks.
- Keep the existing field names and shapes. Their readers are `js/*.js`; if a shape must change, change the file's header comment and every reader in the same change (find readers with Grep for the field name).
- Dates are `YYYY-MM-DD`. Prices are numbers. Empty strings mean "not set yet" (for example `checkoutUrl: ""`). Never a fake value: no example.com email, no bare `https://instagram.com/` as a profile.
- `draft: true` marks placeholder content: kept out of search (and news posts, shows and releases off the site) until the owner confirms it.
- `id` fields are page addresses (`/music/<id>`, `/shop/<id>`, `/news/<id>`): lowercase-hyphenated, never changed once published.
- After any change in `data/`, run `node scripts/build.js` (it regenerates heads, item pages and the sitemap), then the `seo-check` skill. Readers are also in `scripts/` (Grep there too when a field changes).
- Start with a `//` comment saying what the file holds and documenting any non-obvious field.
