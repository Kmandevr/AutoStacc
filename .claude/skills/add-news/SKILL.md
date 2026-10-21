---
name: add-news
description: Add, edit or remove a news post (or tour date) in AutoStacc. Use for announcements, releases and updates shown on the home and news pages. News posts and shows are made in the Studio's News and Shows editors (store database), not in data/; this skill gathers the facts and walks the owner through it.
---

# Add or change news or shows

**No file in the repo changes.** Since 2026-10-21 every project's news posts and show dates, Glitches & Stitches' included, are Studio content in the store database (`project_news`, `project_shows`; owner decision in `docs/decisions.md`, how it works in `docs/creators.md` "Music, news and shows"). The project's news list, its home page's latest posts, the shows list and each post's page (`/<creator>/<project>/news/<slug>`, in `/sitemap-content.xml`) all come from there. Never re-create data/news.js or data/shows.js, and don't edit HTML, CSS or scripts. How news relates to the planned community Updates is still open (#174).

1. Get the content from the owner: date, title, tag, summary, body. For a show: date, city, venue, ticket link. **Never invent** releases, dates, venues or details. If something is missing, ask, or open a GitHub issue for it.
2. Prepare it in the editor's format:
   - The slug is lowercase-hyphenated and never changed once published.
   - The summary is plain text, shown on cards and as the page's search description.
   - The body is the Studio's safe text markup (`js/site-text.js`), never HTML: paragraphs separated by blank lines, `**bold**`, `*italic*`, and `[label](url)` links. Links to AutoStacc pages are root-relative clean addresses (`/autostacc/glitches-and-stitches/music/hail`, `/shop`); others are https.
   - Reuse an existing tag unless the owner wants a new one. Set the release (a release slug of the same project) if the post is about one.
   - Shows: a ticket link is https or empty. Past dates hide by themselves.
3. The owner (or a team member with `site.edit`; publishing, unpublishing and deleting need `site.publish`) enters it in **`/studio` → the project → News** (or **Shows**), checks the preview, then publishes. You can't sign in as the owner, so give them the text ready to paste. To test, run it locally under `npm run dev`.
4. Add a line to `docs/log.md` if the owner asked you to record it. No build is needed.
