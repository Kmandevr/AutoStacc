---
name: add-release
description: Add or edit a release (single, EP, album) in AutoStacc. Use when the owner has new music out or release details change. Releases are made in the Studio's Music editor (store database), not in data/; this skill gathers the facts and walks the owner through it.
---

# Add or change a release

**No file in the repo changes.** Since 2026-10-21 every project's releases, Glitches & Stitches' included, are Studio content in the store database (`project_releases`; owner decision in `docs/decisions.md`, how it works in `docs/creators.md` "Music, news and shows"). The release page (`/<creator>/<project>/music/<slug>`), the project's music list, the Listen player (the `featured` release) and `/sitemap-content.xml` all come from that row through the content API and the content Function. Never re-create data/music.js, and don't edit HTML, CSS or scripts for a release.

1. Get the facts from the owner or the distributor's public pages: title, type (Single, EP, Album), date, tracks with durations (`m:ss`) and ISRCs, UPC, streaming links (https), player link. **Never invent** credits, descriptions or dates. The description states only confirmed facts. Ask for anything missing.
2. The owner (or a team member with `site.edit`; publishing needs `site.publish`) adds it in **`/studio` → the project → Music**:
   - The slug is the address. It is lowercase-hyphenated and never changed once published.
   - The player must be a link the Studio knows (YouTube, Spotify, SoundCloud or Apple Music; `js/site-embeds.js`).
   - The artwork is one of the creator's uploaded images, 1000x1000 recommended, with alt text describing what it shows. Look at the image before you suggest alt text.
   - Mark it featured if the project's Listen section should play it.
   - Save it as a draft, check it, then publish.
3. You can't sign in as the owner, so you can't publish it yourself. Give the owner the values ready to paste. To test, run it locally under `npm run dev` (the `store-check` skill's dev store) and use the same editor there.
4. If the owner confirms it was built from or remixes other work, record that in `docs/artist.md`. `data/relationships.js` can't link to Studio releases (the build refuses `release:` refs).
5. If news announces it, use the `add-news` skill and set the post's release to this slug.
6. Update `docs/artist.md` (released music) and add a line to `docs/log.md`. No build is needed, since nothing in `data/` changed.
