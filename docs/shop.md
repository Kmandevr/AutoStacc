---
title: Shop
summary: The catalogue: product kinds, products made in the Studio by every creator (the code-based catalog is retired, #176), each product's page at /shop/<id> (#175), and the test fixtures. How selling works is in store.md.
covers: [data/product-types.js, shop.html, server/shop/, test/support/catalog-fixtures.js]
updated: 2026-10-21
---

# Shop

Every product is made in the Studio, AutoStacc's own included (owner, 2026-10-21, [decisions](decisions.md)). The members of `autostacc` create Glitches & Stitches' products in its project's product list and the Product Studio ([creators](creators.md), [studio](studio.md)). A first-party creator's sales are AutoStacc's own: the main Stripe account, 100% with no fee, share or payout records, never held, and no Studio limits (#171, #177).

There is **no code-based catalog** any more (#176). data/products.js, data/stacclets.js, data/pacs.js, the static `shop/<id>` pages and their catalog sync were retired. Migration `0042_retire_catalog_products.sql` unpublished and marked deleted the rows the sync had left. Products have kinds in `data/product-types.js` (music, stems, samples, sample-pack, presets, visuals, vj-loops, template, other; `template` is a site template sold from the Studio's community library, [builder](builder.md)). Each kind sets its label, quantity limit, preview kind, track colour and licence. A product names the project that created it and may deliver Pacs built in the Pack Builder ([packs](packs.md)). Model: [architecture](architecture.md). Selling (cart, Stripe Checkout, accounts, library, private downloads): [store](store.md); switching it on: [store-setup](store-setup.md).

## Product pages (#175)

Every product, any creator's, has a page rendered on the server at **`/shop/<product-id>`** (`server/shop/`, through `functions/[[path]].js`; the owner chose one `/shop/<product>` address for every creator). The page names the creator and project it comes from.
- **Trusted creator** (first-party included): indexable, with a canonical, Open Graph and Product JSON-LD. The JSON-LD has an Offer with the price only while the product is for sale. The page is listed in `/sitemap-shop.xml`, which `robots.txt` names.
- **Any other creator:** `noindex`, and not in any sitemap.
- An unknown or hidden product gets the 404 page.
- The old `/product?p=<id>` answers a 301 to `/shop/<id>`, and `/product` alone to `/shop`. The redirect is in the Function, because `_redirects` can't match a query string.

`/shop` itself (`shop.html`) stays a static page, and the store's grids and search read products from the API ([discovery](discovery.md)). Both load `css/skeleton.css` and `js/skeleton.js` (product pages through the CSS and script lists in `server/shop/page.js`) so their grids and product parts show placeholders while they load, and `js/prefetch.js` last; product pages get the `Speculation-Rules` header from `pageHeaders()` in `server/content/page.js`, since `_headers` doesn't reach Functions ([modules](modules.md#shared-helpers-every-feature-uses)).

## Test fixtures

The six former placeholder products (`sample-pack-vol1`, `serum-presets`, `stems-patchwork`, `ep-corrupted-thread`, `wallpapers`, `vj-loops`), the placeholder Stacclet `frayed-signals` with its four Pacs, and one test event are deleted from `data/` (#173). They live on only as dev-only fixtures in `test/support/catalog-fixtures.js`, seeded by `scripts/dev.js` into the local store so the suites keep their ids. They are never facts about the artist and never reach the deploy.

The real catalogue is whatever creators publish in the Studio; it isn't copied here.
