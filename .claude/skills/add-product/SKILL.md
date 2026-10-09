---
name: add-product
description: Add, edit, remove or feature a shop product in AutoStacc. Use for any change to what is sold or its price, type, description, tags, preview or related release. Touches data/products.js (and data/product-types.js for a new kind), then regenerates pages and the store catalog.
---

# Add or change a product

**Only `data/products.js` changes** (plus generated files; `data/product-types.js` only for a new kind of product). Cards, filters and the featured strip come from it (`js/shop.js`); the product page `/shop/<id>`, its structured data, the sitemap entry and the store catalog `db/catalog.sql` come from `scripts/build.js`. Checkout charges the price in that file, so the page and the charge always agree. Don't edit HTML, CSS or scripts for a normal product change.

1. Read the comment block at the top of `data/products.js` and one entry. That file is the source of truth for the fields.
2. Get the facts from the user: title, type, price, description, what's inside. **Never invent** them. For anything missing, ask, or leave a placeholder (`draft: true`) and open a GitHub issue.
3. Edit:
   - `id`: unique, lowercase, hyphenated. Never change a published id (it's the page address and the key orders and entitlements point at).
   - `type`: a key of `data/product-types.js`. A new kind of product is a new entry there (label, `maxQuantity`, `preview`, `track` (its AutoStacc track colour, a key of `data/content-types.js` or `""`), and `license`: a key of `data/licenses.js`, which sets the licence box on its page; never write licence text on a product). Only real facts in `includes` and `metadata` (docs/production.md).
   - `price`: a number with at most two decimals, in `SITE.currency`; `0` makes it free (claimed into the library).
   - `featured: true`: the home page shows at most 3, in file order. `hue` only colours the generated cover.
   - Required: `project` (an id in `data/projects.js`). Optional `pacs`: Pac ids from `data/pacs.js` of the same project that the product delivers (the build refuses other projects' Pacs and, for a published product, draft Pacs). See `docs/architecture.md`.
   - Optional: `image` (real artwork, `alt` describing it), `release` (related release id), `tags`, `includes`, `metadata`, `preview: { file, label }` (a clip uploaded in `/admin`; never the paid file).
   - `draft: true` while it's a placeholder: shown as "Coming soon", kept out of search, not buyable. Remove it only when the product, price and files are real.
4. Run `node scripts/build.js`, then the `seo-check` skill. Removing a published product makes `seo-test.js` ask for a redirect in `_redirects`; the store keeps it as deleted (owners keep their files).
5. Paid files are not in git: tell the owner to upload them in `/admin` after the deploy (the product page shows "Coming soon" or the buy button either way; buyers of a product without files see an empty entry in their library).
6. If the catalogue changed meaningfully, update `docs/shop.md` and add a line to `docs/log.md`.

Don't touch `data/news.js`, `data/shows.js`, `data/site.js` or any JS/CSS.
