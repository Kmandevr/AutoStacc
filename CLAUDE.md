# AutoStacc

Website for the EDM artist **Glitches & Stitches**. It sells digital items (sample packs, presets, stems, music, visuals) and promotes the artist with news and tour dates.

## Start of every session

Read [docs/index.md](docs/index.md), then [docs/status.md](docs/status.md) for what's pending. The `docs/` folder is the project's memory and an Obsidian vault. Facts about the artist, brand and decisions live there, not in this file.

## Rules

- Never invent facts about the artist (bio, releases, collaborators, dates, prices). Use what's in `docs/`. If it's missing, ask the user, or mark it as placeholder and add it to `docs/status.md`.
- Record decisions and new facts in `docs/` before ending a session. Update `docs/status.md` and add a line to `docs/log.md`.
- Notes use relative markdown links (`[text](other.md)`), not `[[wikilinks]]`, so they render on GitHub. Every note has frontmatter (`title`, `updated`).

## Site

Static HTML, CSS and JS with no build step and no framework. Keep it that way unless the user decides otherwise.

- All content is data in `data/*.js` (`site`, `products`, `news`, `shows`). Update content there, not in the HTML.
- Payments happen on a hosted checkout via each product's `checkoutUrl`. The site never handles card details or download files.
- Style: dark background, neon pink and cyan, dashed "stitched" borders, glitch title effect. See [docs/brand.md](docs/brand.md).

## Where to work

Open only the files for the task. Each page loads only what it needs. Scripts are plain `<script>` tags (no modules, so pages still work from `file://`) and share helpers through `window.GS` from `js/util.js`.

| Task | Files |
| --- | --- |
| Change copy, products, news, shows, links | `data/site.js`, `products.js`, `news.js`, `shows.js` |
| Header, footer, nav | `js/layout.js`, `css/layout.css` |
| Product cards, shop filter | `js/shop.js`, `css/shop.css` |
| News list | `js/news.js`, `css/news.css` |
| Home hero, shows, about, newsletter | `index.html`, `js/shows.js`, `js/newsletter.js`, `css/home.css` |
| Colours, fonts, buttons, glitch title | `css/base.css` |
| New page | copy `shop.html` or `news.html`; load `css/base.css`, `css/layout.css`, `js/util.js`, `js/layout.js` plus what it uses |

`graphify-out/GRAPH_REPORT.md` (rebuilt each cloud session by `.claude/hooks/session-start.sh`) maps the code. Query it with `graphify query "<question>"` before reading many files.

## Checking changes

Serve with `python3 -m http.server 8000` and load each page in a headless browser. Confirm there are no console errors, no horizontal overflow at 390px wide, and that the shop filter works.

## Git

Develop on the branch the session names. Don't open a pull request unless asked.
