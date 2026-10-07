---
title: Shop
summary: Products, how selling and checkout work, placeholder catalogue.
updated: 2026-10-07
---

# Shop

Products are defined in `data/products.js`. Every field there is currently placeholder (tracked in GitHub issues), so every product is `draft: true`: still shown in the shop as "Coming soon", but its page (`/shop/<id>`) is `noindex`, left out of the sitemap and publishes no product structured data. Remove `draft` once a product is real.

## How selling works

Each product has a `checkoutUrl` pointing at a hosted checkout that takes payment and delivers the download (Stripe Payment Links, Gumroad, Lemon Squeezy, Payhip or Bandcamp). The site never handles card details or files. With no `checkoutUrl` the button shows "Coming soon". See [decisions](decisions.md) for why.

## Placeholder catalogue

| Product | Category | Price |
| --- | --- | --- |
| Frayed Signals, Sample Pack Vol. 1 | Sample Packs | $24.99 |
| Seam Ripper, Serum Preset Bank | Presets | $19.99 |
| Patchwork (Remix Stems) | Stems | $9.99 |
| Corrupted Thread EP (Lossless) | Music | $7.00 |
| Static Bloom, Wallpaper Pack | Visuals | $3.00 |
| Live Set VJ Loops | Visuals | $14.99 |

Replace this table with the real catalogue when the owner provides it.
