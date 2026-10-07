---
name: add-product
description: Add, edit, remove or feature a shop product in AutoStacc. Use for any change to what is sold or its price, category, description, cover colour or checkout link. Touches data/products.js only.
---

# Add or change a product

**Only `data/products.js` changes.** Cards, the shop filter and the featured strip are generated from it by `js/shop.js`. Do not edit HTML, CSS or scripts for a normal product change.

1. Read the top of `data/products.js` (the comment block and one entry). That file is the source of truth for the fields; don't copy them elsewhere.
2. Get the facts from the user: title, category, price, description, checkout link. **Never invent** them. For anything missing, ask, or leave a placeholder and open a GitHub issue for it.
3. Edit:
   - `id`: unique, lowercase, hyphenated. Don't change an existing id.
   - `category`: reuse an existing category string exactly, since filter buttons are built from the values. A new category is fine, but say so.
   - `checkoutUrl`: a hosted-checkout link, or `""` to show "Coming soon". The site never handles payment or files.
   - `featured: true`: the home page shows at most 3, in file order.
   - `hue`: 0-359, only affects the generated cover.
4. Run the `verify-site` skill on `shop.html` and `index.html`.
5. If the catalogue changed meaningfully, update `docs/shop.md` and add a line to `docs/log.md`.

Don't touch `data/news.js`, `data/shows.js`, `data/site.js` or any JS/CSS.
