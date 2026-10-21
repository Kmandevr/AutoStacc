---
title: Shop
summary: The catalogue: product kinds, where products are made (the Studio, since 2026-10-21; data/products.js is empty) and what is still placeholder. How selling works is in store.md.
covers: [data/products.js, data/product-types.js, data/stacclets.js, data/pacs.js, shop/]
updated: 2026-10-21
---

# Shop

Since 2026-10-21 (owner, [decisions](decisions.md)) AutoStacc's own products are made in the Studio like every creator's: the members of `autostacc` create them for Glitches & Stitches in its project's product list and the Product Studio ([creators](creators.md), [studio](studio.md)). They are paid to AutoStacc's main Stripe account, never held while creator purchases are closed, as before. `data/products.js` (fields documented at its top) is **empty**. Its pipeline (static `/shop/<id>` pages, the catalog sync) stays dormant until the owner decides whether to retire it (#176). Products have kinds in `data/product-types.js` (music, stems, samples, sample-pack, presets, visuals, vj-loops, template, other; `template` is a site template sold from the Studio's community library, [builder](builder.md): each sets its label, quantity limit, preview kind, track colour and licence). Each names the project that created it (`project`) and may list the Pacs it delivers (`pacs`); the product page shows "Created by" the project, "Sold by" AutoStacc and its Pacs, and, once a Pac's files are published from the Pack Builder, "What's inside" ([discovery](discovery.md)). Model: [architecture](architecture.md). They are sold through the site's own store: cart, Stripe Checkout, accounts, library and private downloads. How that works: [store](store.md); switching it on: [store-setup](store-setup.md).

Studio product pages are `/product?p=<id>`, which is `noindex` (whether trusted creators' products get indexable pages is #175).

## Former placeholder catalogue (deleted 2026-10-21)

The owner deleted the six placeholder products (all `draft: true`, never on sale). The deploy's sync unpublishes and soft-deletes their rows, and their generated `/shop/<id>` pages are gone. They survive only as dev-only test fixtures (`test/support/catalog-fixtures.js`) so the test suites keep their ids. For the record:

| Product (`id`) | Type | Price |
| --- | --- | --- |
| Frayed Signals — Sample Pack Vol. 1 (`sample-pack-vol1`) | sample-pack | $24.99 |
| Seam Ripper — Serum Preset Bank (`serum-presets`) | presets | $19.99 |
| Patchwork (Remix Stems) (`stems-patchwork`) | stems | $9.99 |
| Corrupted Thread EP (Lossless) (`ep-corrupted-thread`) | music | $7.00 |
| Static Bloom — Wallpaper Pack (`wallpapers`) | visuals | $3.00 |
| Live Set VJ Loops (`vj-loops`) | vj-loops | $14.99 |

Placeholder platform content still in `data/` (`draft: true`): the Frayed Signals Stacclet with MIDI, Samples, Loops and Presets Pacs (`data/stacclets.js`, `data/pacs.js`), taken from the owner's architecture brief. No product in `data/` delivers them now; the test fixture sample pack does.

The real catalogue is whatever the owner publishes in the Studio; it isn't copied here.
