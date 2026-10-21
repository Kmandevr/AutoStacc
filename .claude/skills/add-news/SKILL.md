---
name: add-news
description: Add, edit or remove an event (show, tour date, release party, stream) made in the Studio's Events editor, and answer requests for news posts, which wait for each creator's community. Gathers the facts and walks the owner through it; nothing in data/ changes.
---

# Add or change an event (news waits for the community)

**No file in the repo changes.** Since 2026-10-21 shows are **events**, Studio content in the store database for every creator, Glitches & Stitches included (`project_events`; owner decision #178 in `docs/decisions.md`, how it works in `docs/creators.md`). Each event has its own page (`/<creator>/<project>/events/<slug>`, with Event JSON-LD and Add to calendar), shows on the project's Events page, on the public calendar at `/events` and in `/sitemap-content.xml`, and can be placed on a builder page with the Events element (`docs/builder.md`). Never re-create data/shows.js or data/news.js, and don't edit HTML, CSS or scripts.

**News posts and announcements:** there is no news editor (#174). Posts, updates and announcements belong on each creator's Community page, which only appears when the community opens (`docs/community.md`). Until then tell the owner so, and don't make an event or a page to stand in for a post. Old news addresses answer a 301 to the project's home; their rows are kept to become community posts later.

1. Get the facts from the owner: title, date, start time if known, last day for a multi-day event, time zone, venue, city, country, ticket link, a short description. **Never invent** dates, venues, line-ups or details. If something is missing, ask, or open a GitHub issue for it.
2. Prepare it in the editor's format:
   - The slug is the address: lowercase-hyphenated, never changed once published.
   - Time zone is an IANA name (`Europe/Berlin`); country a two-letter code (`DE`). A ticket link is https or empty.
   - The description is plain text. Tags follow the store's rule (`server/lib/tags.js`): up to 8, lowercase letters, numbers and hyphens, at most 24 characters each. Reuse existing tags unless the owner wants a new one.
   - Past events drop off the upcoming lists by themselves.
3. The owner (or a team member with `site.edit`; publishing, unpublishing and deleting need `site.publish`) enters it in **`/studio` → the project → Events**, checks it, then publishes. You can't sign in as the owner, so give them the values ready to paste. To test, run it locally under `npm run dev` (its dev store has a test event).
4. Add a line to `docs/log.md` if the owner asked you to record it. No build is needed.
