---
name: add-product
description: Add, edit, remove or feature a shop product in AutoStacc. Use for any change to what is sold or its price, type, description, tags, preview or files. Products are made in the Studio (Product Studio, store database), not in data/products.js; this skill gathers the facts and walks the owner through it, and covers a new kind of product (data/product-types.js).
---

# Add or change a product

**Products are made in the Studio, not in `data/products.js`.** Since 2026-10-21 AutoStacc's own products, Glitches & Stitches' included, are made like every creator's: in **`/studio` → the project → Products** and each product's **Product Studio** (Overview, Pac Builder, Store Page, Pricing, Insights, Release; `docs/studio.md`, `docs/creators.md`). The owner's decision is in `docs/decisions.md`. `data/products.js` stays an **empty list**: its pipeline (static `/shop/<id>` pages, the catalog sync) is dormant until the owner answers #176. Don't add entries to it, and don't edit HTML, CSS or scripts for a product.

1. Get the facts from the owner: title, kind, price, description, what's inside, files. **Never invent** them (`docs/production.md`). Ask for anything missing, or open a GitHub issue.
2. The owner (or a team member with the `products` capability) makes it in the Studio:
   - a draft from the project's product list;
   - the files in the Pac Builder (a whole pack as a ZIP, or single files);
   - title, description, cover art, preview clip, tags and store details on the Store Page;
   - the price in Pricing;
   - Release to put it on sale. It needs a deliverable file.
   You can't sign in as the owner, so give them the values ready to paste. To test, run it locally under `npm run dev`; its dev store has the six former placeholder products as fixtures (`test/support/catalog-fixtures.js`).
3. **Money:** a first-party creator's Studio products are AutoStacc's own sales, paid to the main Stripe account and never held while creator purchases are closed. A Studio creator's go through the marketplace account (`docs/store.md`). The Studio's free-plan limits (25 products, 550 MB) apply to `autostacc` until the owner answers #177.
4. **Search:** Studio product pages are `/product?p=<id>`, `noindex` (#175). Removing a product in the Studio keeps it for people who bought it.
5. **A new kind of product** is still data: one entry in `data/product-types.js` (label, `maxQuantity`, `preview`, `track` (a key of `data/content-types.js` or `""`), and `license`, a key of `data/licenses.js`; never write licence text on a product). Its store vocabulary lives in `server/discovery/vocabulary.js`. Then run `node scripts/build.js` and the `seo-check` skill.
6. If the catalogue changed meaningfully, update `docs/shop.md` and add a line to `docs/log.md`.
