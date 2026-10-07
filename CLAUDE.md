# AutoStacc

Website for the EDM artist **Glitches & Stitches**. It sells digital items (sample packs, presets, stems, music, visuals) and promotes the artist with news and tour dates.

## Start of every session

Read [docs/status.md](docs/status.md) for what's pending. The `docs/` folder is the project's memory and an Obsidian vault; facts about the artist, brand and decisions live there, not in this file. Its notes list is [docs/index.md](docs/index.md).

## Rules

- Never invent facts about the artist (bio, releases, collaborators, dates, prices). Use `docs/`. If it's missing, ask the user, or mark it as placeholder and add it to `docs/status.md`.
- Record decisions and new facts in `docs/` before ending a session (details in `.claude/rules/docs.md`).

## Site

Static HTML, CSS and JS with no build step and no framework. Keep it that way unless the user decides otherwise.

- All content is data in `data/*.js`. Update content there, not in the HTML.
- Payments happen on a hosted checkout via each product's `checkoutUrl`. The site never handles card details or download files.
- Conventions for scripts, styles and notes load on demand from `.claude/rules/` when you touch those files.

## Read in layers

Don't read every file. Go deeper only when the layer above doesn't answer the question, and don't re-read what's already in context.

1. **Map:** the session-start hook prints the top level. `.claude/tools/tree.sh <dir>` lists one directory's files with their purposes.
2. **Skill:** for a repeatable task use its skill (`add-product`, `add-news`, `verify-site`, `accessibility-review`, `release-check`). Skills name the files; don't re-derive them.
3. **Graphify** for orientation across files: `.claude/tools/graph.sh query "<question>"`, `affected "<name>"`.
4. **Serena** for symbols: `get_symbols_overview`, `find_symbol`, `find_referencing_symbols`, symbol-level edits. Use it instead of reading a whole file. See `.claude/README.md`.
5. **File:** open only what the layers above named, with Grep or Read `offset`/`limit`.

Preserve module boundaries: edit only the files a change needs, and leave unrelated modules alone.

## Workflow

One-file changes: just do them. Changes across areas: run the saved workflow `change` (`args: { task: "..." }`): plan, build in parallel on disjoint files, verify, update docs. It never commits. See `.claude/README.md`.

## Checking changes

Run the `verify-site` skill. Before calling a change ready, run `release-check`.

## Git

Develop on the branch the session names. Don't open a pull request unless asked.
