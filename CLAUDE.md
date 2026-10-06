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

- Pages: `index.html`, `shop.html`, `news.html`. Shared header and footer are rendered by `js/main.js`.
- All content is data in `data/*.js` (`site`, `products`, `news`, `shows`). Update content there, not in the HTML.
- Payments happen on a hosted checkout via each product's `checkoutUrl`. The site never handles card details or download files.
- Style is in `css/style.css`: dark background, neon pink and cyan, dashed "stitched" borders, glitch title effect. See [docs/brand.md](docs/brand.md).

## Checking changes

Serve with `python3 -m http.server 8000` and load each page in a headless browser. Confirm there are no console errors, no horizontal overflow at 390px wide, and that the shop filter works.

## Git

Develop on the branch the session names. Don't open a pull request unless asked.
