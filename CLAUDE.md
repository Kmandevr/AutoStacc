# AutoStacc

Website for the EDM artist **Glitches & Stitches**. It sells digital items (sample packs, presets, stems, music, visuals) and promotes the artist with news and tour dates.

## Start of every session

Read [docs/index.md](docs/index.md), then [docs/status.md](docs/status.md) for what's pending. The `docs/` folder is the project's memory and an Obsidian vault. Facts about the artist, brand and decisions live there, not in this file.

## Rules

- Never invent facts about the artist (bio, releases, collaborators, dates, prices). Use what's in `docs/`. If it's missing, ask the user, or mark it as placeholder and add it to `docs/status.md`.
- Record decisions and new facts in `docs/` before ending a session. Update `docs/status.md` and add a line to `docs/log.md`.
- Notes use relative markdown links (`[text](other.md)`), not `[[wikilinks]]`, so they render on GitHub. Every note has frontmatter (`title`, `summary`, `updated`).

## Site

Static HTML, CSS and JS with no build step and no framework. Keep it that way unless the user decides otherwise.

- All content is data in `data/*.js` (`site`, `products`, `news`, `shows`). Update content there, not in the HTML.
- Payments happen on a hosted checkout via each product's `checkoutUrl`. The site never handles card details or download files.
- Style: dark background, neon pink and cyan, dashed "stitched" borders, glitch title effect. See [docs/brand.md](docs/brand.md).

## Read in layers

Don't read every file. Start at the top and go deeper only when the layer above doesn't answer the question. Don't re-read what is already in your context.

1. **Layer 0, the repo map.** The session-start hook prints one line per file (its purpose). That plus this file is enough for orientation and for "which file handles X". Facts about the artist, brand and decisions: read the one `docs/` note named in the map, starting with `docs/status.md`.
2. **Layer 1, summaries.** Ask the graph instead of opening files: `graphify query "<question>"`, `graphify explain "<name>"`, `graphify affected "<name>"` (what breaks if this changes), `graphify god-nodes`. Add `--budget N` to cap the output. `graphify-out/GRAPH_REPORT.md` is the one-page overview.
3. **Layer 2, the file.** Open only files layers 0 and 1 named. Use Grep, or Read with `offset`/`limit`, to get just the part you need. Edit only the files the change needs. Use `graphify affected` before touching shared code (`js/util.js`, `css/base.css`).

Keeping the map accurate: every new code file starts with a one-line comment saying what it is for (`//` in JS, `/* */` in CSS, a `<meta name="description">` in HTML), and every note in `docs/` has a `summary:` line in its frontmatter. The map is built from those lines, so a file without one shows up blank.

Scripts are plain `<script>` tags (no modules, so pages still work from `file://`) and share helpers through `window.GS` from `js/util.js`. Each page loads only the scripts and stylesheets it uses.

## Workflow

Small, one-file changes: just do them. For a change across areas (data, pages, scripts, styles), run the saved workflow `site-change` with `args: { task: "..." }`. It plans the files first, builds independent items in parallel on disjoint files, verifies in a headless browser plus an adversarial diff review, then updates `docs/`. It never commits; review the diff, then commit and push to the session branch. It is in `.claude/workflows/site-change.js`.

## Checking changes

Serve with `python3 -m http.server 8000` and load each page in a headless browser. Confirm there are no console errors, no horizontal overflow at 390px wide, and that the shop filter works.

## Git

Develop on the branch the session names. Don't open a pull request unless asked.
