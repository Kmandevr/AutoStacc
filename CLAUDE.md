# AutoStacc

Website for the EDM artist **Glitches & Stitches**. It sells digital items (sample packs, presets, stems, music, visuals) and promotes the artist with news and tour dates.

## Start of every session

Tasks and bugs live in GitHub Issues: use the `tasks` skill to find, claim and finish work, and don't keep a task list anywhere else. The `docs/` folder holds permanent project knowledge and is an Obsidian vault; facts about the artist, brand and decisions live there, not in this file. Its notes list is [docs/index.md](docs/index.md).

## Rules

- For anything creative (copy, artwork, names, release ideas, branding, promotion), follow [docs/identity.md](docs/identity.md). Don't turn it into a generic EDM brand.
- Never invent facts about the artist (bio, releases, collaborators, dates, prices). Use `docs/`. If it's missing, ask the user, or mark it as placeholder and open an issue for it.
- Record decisions and new facts in `docs/` before ending a session (details in `.claude/rules/docs.md`).

## Site

Static HTML, CSS and JS with no framework, hosted on Cloudflare Pages, plus the store API. Keep pages static and the API small; no frontend framework unless the user decides otherwise.

- All content is data in `data/*.js`. Update content there, not in the HTML.
- One generator, `node scripts/build.js` (plain Node, no dependencies), writes what search engines read from `data/`: each page's head block (canonical, Open Graph, JSON-LD), the release, product and news pages in `music/`, `shop/`, `news/`, and `sitemap.xml`. Run it after changing `data/` or a page's title or description, and commit the output. Never hand-edit generated output. How it fits together: [docs/seo.md](docs/seo.md).
- The official address is `https://autostacc.com`; the artist is always written "Glitches & Stitches". Links are root-relative clean addresses (`/shop`, `/music/hail`); preview with `node scripts/serve.js`.
- The store is an API beside the static pages: Cloudflare Pages Functions (`functions/` → `server/`, one folder per area), D1 (`db/migrations/`), private R2, Better Auth, Stripe Checkout, Brevo. The browser is never trusted with prices, ownership or payment status; card details never reach the site. How it works: [docs/store.md](docs/store.md); running it: `npm run dev` ([docs/development.md](docs/development.md)). Conventions load from `.claude/rules/server.md` and `tests.md`.
- Conventions for scripts, styles and notes load on demand from `.claude/rules/` when you touch those files.

## Read in layers

Don't read every file. Go deeper only when the layer above doesn't answer the question, and don't re-read what's already in context.

1. **Map:** the session-start hook prints the top level. `.claude/tools/tree.sh <dir>` lists one directory's files with their purposes.
2. **Skill:** for a repeatable task use its skill (`add-product`, `add-news`, `add-release`, `verify-site`, `seo-check`, `store-check`, `accessibility-review`, `release-check`). Skills name the files; don't re-derive them.
3. **Graphify** for orientation across files: `.claude/tools/graph.sh query "<keywords>"`, `explain "<name>"`, `affected "<name>"`.
4. **Serena** for symbols in JS, CSS and HTML: `get_symbols_overview`, `find_symbol` (with `include_body`), `find_referencing_symbols`, symbol-level edits. Use it instead of reading a whole file. See `.claude/README.md`.
5. **File:** open only what the layers above named, with Grep or Read `offset`/`limit`.

Preserve module boundaries: edit only the files a change needs, and leave unrelated modules alone.

## Workflow

One-file changes: just do them. For independent review or testing, delegate to a subagent in `.claude/agents/` (`architect` before structural changes, `frontend-reviewer`, `backend-reviewer`, `security-reviewer`, `browser-tester`, `commerce-tester`, `code-reviewer`, `seo-reviewer` after) and ask for findings only. Modularity applies to every file (scripts, styles, pages, server modules, tests, notes, Claude config): one purpose per file, change only what the task needs. Changes across areas: run the saved workflow `change` (`args: { task: "...", agents: { test: "browser-tester", review: "code-reviewer" } }`): plan, build in parallel on disjoint files, verify, update docs. It never commits. See `.claude/README.md`.

## Checking changes

Run `node scripts/build.js`, then `node scripts/seo-test.js` and the `verify-site` skill (the `seo-check` skill covers all three). For anything touching the store (`server/`, `functions/`, `db/`, store pages or scripts) also run the `store-check` skill (unit, API security and browser chaos tests). Before calling a change ready, run `release-check`. CI (`.github/workflows/seo.yml`) and the deploy run the same SEO tests; the deploy stops if they fail.

## Git

Develop on the branch the session names. Don't open a pull request unless asked; when you do, put `Closes #N` in it.
