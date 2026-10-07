---
name: add-product
description: Add, edit, remove or feature a shop product in AutoStacc. Use for any change to what is sold or its price, category, description, cover colour or checkout link. Touches data/products.js, then regenerates pages.
---

# Add or change a product

**Only `data/products.js` changes** (plus generated files). Cards, the shop filter and the featured strip are rendered from it by `js/shop.js`; the product page `/shop/<id>`, its structured data and the sitemap entry by `scripts/build.js`. Do not edit HTML, CSS or scripts for a normal product change.

1. Read the top of `data/products.js` (the comment block and one entry). That file is the source of truth for the fields; don't copy them elsewhere.
2. Get the facts from the user: title, category, price, description, checkout link. **Never invent** them. For anything missing, ask, or leave a placeholder and open a GitHub issue for it.
3. Edit:
   - `id`: unique, lowercase, hyphenated. Don't change an existing id.
   - `category`: reuse an existing category string exactly, since filter buttons are built from the values. A new category is fine, but say so.
   - `checkoutUrl`: a hosted-checkout link, or `""` to show "Coming soon". The site never handles payment or files.
   - `featured: true`: the home page shows at most 3, in file order.
   - `hue`: 0-359, only affects the generated cover: 90-209 gives a green glow, anything else purple.
   - `draft: true` while it's a placeholder: shown as "Coming soon" but kept out of search. Remove it only when the product is real.
   - Optional `image` (real artwork, with `alt` describing it), `release` (related release id), `preview`.
4. Run `node scripts/build.js`, then the `seo-check` skill. Removing a published product makes `seo-test.js` ask for a redirect in `_redirects`.
5. If the catalogue changed meaningfully, update `docs/shop.md` and add a line to `docs/log.md`.

Don't touch `data/news.js`, `data/shows.js`, `data/site.js` or any JS/CSS.
