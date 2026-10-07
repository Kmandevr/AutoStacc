---
name: add-news
description: Add, edit or remove a news post (or tour date) in AutoStacc. Use for announcements, releases and updates shown on the home and news pages. Touches data/news.js, or data/shows.js for tour dates.
---

# Add or change news

**Only `data/news.js` changes** (tour dates: `data/shows.js`). The news list and the home page's latest three are generated from it by `js/news.js`, newest first. Don't edit HTML, CSS or scripts.

1. Read the top of `data/news.js` (the comment and one entry). That file defines the fields; don't copy them elsewhere.
2. Get the content from the user: date, title, tag, summary, body. **Never invent** releases, dates or details. If something is missing, ask or mark it placeholder in `docs/status.md`.
3. Edit:
   - `date`: `YYYY-MM-DD`. Order in the file doesn't matter, the script sorts.
   - `summary` is plain text, shown on the home page. `body` may contain simple HTML, shown on the news page; keep it to `<p>`, `<a>`, `<strong>`, `<em>`, and escape quotes.
   - Reuse an existing `tag` unless the user wants a new one.
   - Shows: `date`, `city`, `venue`, `ticketUrl` (`""` shows "Tickets soon"). Past dates hide automatically.
4. Run the `verify-site` skill on `news.html` and `index.html`.
5. Add a line to `docs/log.md`.

Don't touch `data/products.js`, `data/site.js` or any JS/CSS.
