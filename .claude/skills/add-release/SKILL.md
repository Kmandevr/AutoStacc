---
name: add-release
description: Add or edit a release (single, EP, album) in AutoStacc. Use when the owner has new music out or release details change. Touches data/music.js and the artwork in img/releases/.
---

# Add or change a release

**Only `data/music.js` and `img/releases/` change.** The release page (`/music/<id>`), the card on `/music`, the home Listen player (when `featured`), structured data and the sitemap are generated from it.

1. Read the header comment of `data/music.js`: it defines every field. Don't copy the field list elsewhere.
2. Get the facts from the owner or the distributor's public pages (title, type, date, tracks with durations and ISRCs, UPC, streaming links). **Never invent** credits, descriptions or dates. The `description` states only confirmed facts; ask for anything else.
3. Artwork: save the official cover as `img/releases/<id>.jpg` (1000x1000) plus a 500px copy and WebP versions (Python Pillow is available), and list them in `artwork.srcset`. Look at the image and write `alt` describing what it shows.
4. `project`: the project it belongs to (`data/projects.js`; required). If the owner confirms it was built from, remixes or samples other releases, add those links to `data/relationships.js` (the release page shows them both ways). `id`: lowercase-hyphenated, never changed once published. Set `featured` to the new id if the home page should play it.
5. If news announces it, add a post with `release: "<id>"` (`add-news` skill). If products belong to it, set their `release` (`add-product` skill).
6. Run `node scripts/build.js`, then the `seo-check` skill. Add a line to `docs/log.md` and update `docs/artist.md` (released music).
