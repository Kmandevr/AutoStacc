---
title: Shop
updated: 2026-10-06
---

# Shop

Products are defined in `data/products.js`. Every field there is currently placeholder (see [status](status.md)).

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
