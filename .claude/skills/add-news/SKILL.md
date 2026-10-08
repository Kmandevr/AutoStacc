---
name: add-news
description: Add, edit or remove a news post (or tour date) in AutoStacc. Use for announcements, releases and updates shown on the home and news pages. Touches data/news.js, or data/shows.js for tour dates, then regenerates pages.
---

# Add or change news

**Only `data/news.js` changes** (tour dates: `data/shows.js`), plus generated files. Each post names its `project`; that project's news list and its home page's latest three are rendered from it by `js/news.js`, newest first; each post's page `/projects/<project>/news/<id>` by `scripts/build.js`. Don't edit HTML, CSS or scripts.

1. Read the top of `data/news.js` (the comment and one entry). That file defines the fields; don't copy them elsewhere.
2. Get the content from the user: date, title, tag, summary, body. **Never invent** releases, dates or details. If something is missing, ask, or open a GitHub issue for it.
3. Edit:
   - `id`: lowercase-hyphenated, never changed once published. `release`: the release id if the post is about one.
   - `date`: `YYYY-MM-DD`. Order in the file doesn't matter, the script sorts.
   - Links in `body` are root-relative clean addresses (`/music/hail`, `/shop`), never `*.html`.
   - `summary` is plain text, shown on the home page. `body` may contain simple HTML, shown on the news page; keep it to `<p>`, `<a>`, `<strong>`, `<em>`, and escape quotes.
   - Reuse an existing `tag` unless the user wants a new one.
   - Shows: `date`, `city`, `venue`, `ticketUrl` (`""` shows "Tickets soon"). Past dates hide automatically.
4. Run `node scripts/build.js`, then the `seo-check` skill.
5. Add a line to `docs/log.md`.

Don't touch `data/products.js`, `data/site.js` or any JS/CSS.
