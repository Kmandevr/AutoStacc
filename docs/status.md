---
title: Status
summary: What is done, what needs the owner, ideas. Read at session start.
updated: 2026-10-07
---

# Status

## Done

- Static site with home, shop and news pages, driven by `data/*.js` (see [log](log.md)).
- Code split into one file per feature, with a task-to-file map in `CLAUDE.md` ([decisions](decisions.md)).
- Graphify session hook and permissions added. It takes effect in every session once this branch is merged to the default branch.

## Needs the owner's input

All current content is placeholder and must be replaced with real details:

- [ ] Real artist facts for [artist](artist.md): bio, genre, releases, links
- [ ] Real products, prices and a `checkoutUrl` for each ([shop](shop.md))
- [ ] Real news posts and tour dates (`data/news.js`, `data/shows.js`)
- [ ] Real contact email and social links (`data/site.js`)
- [ ] Newsletter provider and its form endpoint (`newsletterAction` in `data/site.js`)
- [ ] Real cover art and artist imagery (covers are currently generated gradients)
- [ ] Confirm the spelling of the name: "Glitches & Stitches" vs "Stiches"
- [ ] Domain name and hosting choice (see [decisions](decisions.md))

## Ideas, not started

- Embedded music players (SoundCloud, Spotify)
- Cart with a small backend, if per-item Buy buttons stop being enough
