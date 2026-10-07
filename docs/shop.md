---
title: Shop
summary: The catalogue: products, types, prices and what is still placeholder. How selling works is in store.md.
updated: 2026-10-07
---

# Shop

Products are defined in `data/products.js` (fields documented at its top) with their kinds in `data/product-types.js`. They are sold through the site's own store: cart, Stripe Checkout, accounts, library and private downloads. How that works: [store](store.md); switching it on: [store-setup](store-setup.md).

Every product is still a placeholder (tracked in GitHub issues), so every one is `draft: true`: shown in the shop as "Coming soon", its page (`/shop/<id>`) `noindex`, out of the sitemap, no product structured data, and not buyable (the store treats drafts as unpublished). Remove `draft` once the product, price and files are real.

## Placeholder catalogue

| Product | Type | Price |
| --- | --- | --- |
| Frayed Signals, Sample Pack Vol. 1 | sample-pack | $24.99 |
| Seam Ripper, Serum Preset Bank | presets | $19.99 |
| Patchwork (Remix Stems) | stems | $9.99 |
| Corrupted Thread EP (Lossless) | music | $7.00 |
| Static Bloom, Wallpaper Pack | visuals | $3.00 |
| Live Set VJ Loops | vj-loops | $14.99 |

Replace this table with the real catalogue when the owner provides it.
