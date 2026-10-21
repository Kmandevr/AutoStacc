---
name: add-product
description: Add, edit, remove or feature a shop product in AutoStacc. Use for any change to what is sold or its price, type, description, tags, preview or files. Products are made in the Studio (Product Studio, store database), never in data/; this skill gathers the facts and walks the owner through it, and covers a new kind of product (data/product-types.js).
---

# Add or change a product

**Products are made in the Studio, never in code.** Every creator's products, AutoStacc's and Glitches & Stitches' included, are made in **`/studio` → the project → Products** and each product's **Product Studio** (Overview, Pac Builder, Store Page, Pricing, Insights, Release; `docs/studio.md`, `docs/creators.md`). The code-based catalog (data/products.js, pacs.js, stacclets.js, static `shop/<id>` pages, the catalog sync) is retired (owner, 2026-10-21, #176; `docs/decisions.md`): never re-create it, and don't edit HTML, CSS or scripts for a product.

1. Get the facts from the owner: title, kind, price, description, what's inside, files. **Never invent** them (`docs/production.md`). Ask for anything missing, or open a GitHub issue.
2. The owner (or a team member with the `products` capability) makes it in the Studio:
   - a draft from the project's product list;
   - the files in the Pac Builder (a whole pack as a ZIP, or single files);
   - title, description, cover art, preview clip, tags and store details on the Store Page;
   - the price in Pricing;
   - Release to put it on sale. It needs a deliverable file.
   You can't sign in as the owner, so give them the values ready to paste. To test, run it locally under `npm run dev`; its dev store has test products as fixtures (`test/support/catalog-fixtures.js`, test-only, never data).
3. **Money and limits:** a first-party creator's products are AutoStacc's own sales: 100% to the main Stripe account, no platform fee, no creator share or payout, never held, and no Studio limits or paid storage (#171, #177). A Studio creator's go through the marketplace account with the free-plan limits (`docs/store.md`). Both are decided by the creator's source, never a project id.
4. **Search:** every product's page is `/shop/<id>`, rendered by the server (`server/shop/`) and naming its creator. A trusted creator's (first-party included) is indexable with canonical, Open Graph and Product JSON-LD (a price only while it is for sale) and listed in `/sitemap-shop.xml`; others are `noindex` (#175). The old `/product?p=<id>` redirects there. Removing a product keeps it for people who bought it.
5. **A new kind of product** is still data: one entry in `data/product-types.js` (label, `maxQuantity`, `preview`, `track` (a key of `data/content-types.js` or `""`), and `license`, a key of `data/licenses.js`; never write licence text on a product). Its store vocabulary lives in `server/discovery/vocabulary.js`. Then run `node scripts/build.js` and the `seo-check` skill.
6. If the catalogue changed meaningfully, update `docs/shop.md` and add a line to `docs/log.md`.
