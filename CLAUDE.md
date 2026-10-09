# AutoStacc

**AutoStacc** is a platform and the site's identity: storefront, accounts, checkout, the customer's library ("Your Stacc"), delivery and project discovery, with a public home page at `/` and the signed-in app (dashboard, Your Stacc, settings) behind the account wall. **Projects** create the content; AutoStacc sells, delivers and organizes it. **Creators** own projects and live at `/<creator>/<project>`: AutoStacc itself is the first creator and **Glitches & Stitches**, an EDM artist, its first project, at `/autostacc/glitches-and-stitches` in its own skin. Anyone can become a creator in the Studio (`/studio`) and build free block-based pages; no creator HTML or JavaScript ever runs on autostacc.com: [docs/creators.md](docs/creators.md). Model: Project → Stacclet → Pac → asset, plus products, follows, Auto-Stacc, polls and relationships: [docs/architecture.md](docs/architecture.md). Never hard-code a project into platform code; a project is data in `data/projects.js` and opts into features.

## Start of every session

Tasks and bugs live in GitHub Issues: use the `tasks` skill to find, claim and finish work, and don't keep a task list anywhere else. The `docs/` folder holds permanent project knowledge and is an Obsidian vault; facts about the artist, brand and decisions live there, not in this file. Its notes list is [docs/index.md](docs/index.md).

## Rules

- For anything creative about Glitches & Stitches (copy, artwork, names, release ideas, branding, promotion), follow [docs/identity.md](docs/identity.md); don't turn it into a generic EDM brand. AutoStacc's copy, look and the Stacc vocabulary follow [docs/autostacc.md](docs/autostacc.md).
- Never invent facts about the artist (bio, releases, collaborators, dates, prices). Use `docs/`. If it's missing, ask the user, or mark it as placeholder and open an issue for it.
- Record decisions and new facts in `docs/` before ending a session (details in `.claude/rules/docs.md`).
- Future feature work must preserve the production website requirements and must not bypass legal, security, accessibility, authorization, SEO or privacy protections: [docs/production.md](docs/production.md). When a change collects or shares something new, update `/privacy` (`data/legal.js`) in the same change.

## Site

Static HTML, CSS and JS with no framework, hosted on Cloudflare Pages, plus the store API. Keep pages static and the API small; no frontend framework unless the user decides otherwise.

- All content is data in `data/*.js`. Update content there, not in the HTML.
- One generator, `node scripts/build.js` (plain Node, no dependencies), writes what search engines read from `data/`: each page's head block (canonical, Open Graph, JSON-LD), the product pages in `shop/`, each project's release and news pages in `<creator>/<id>/music/` and `<creator>/<id>/news/`, and `sitemap.xml`. Run it after changing `data/` or a page's title or description, and commit the output. Never hand-edit generated output. How it fits together: [docs/seo.md](docs/seo.md).
- The official address is `https://autostacc.com`; the platform is written "AutoStacc", the artist "Glitches & Stitches". The site and its name are AutoStacc; a project is never the site. Every title ends "· AutoStacc" (formats in `.claude/rules/html.md`). Links are root-relative clean addresses (`/shop`, `/autostacc/glitches-and-stitches/music/hail`); preview with `node scripts/serve.js`.
- The store is an API beside the static pages: Cloudflare Pages Functions (`functions/` → `server/`, one folder per area), D1 (`db/migrations/`), private R2, Better Auth, Stripe Checkout, Brevo. The browser is never trusted with prices, ownership or payment status; card details never reach the site. How it works: [docs/store.md](docs/store.md); running it: `npm run dev` ([docs/development.md](docs/development.md)). Conventions for each kind of file load from `.claude/rules/` when you touch it.

## Read in layers

Don't read every file. Go deeper only when the layer above doesn't answer the question, and never re-read a file already in context.

1. **Map:** the session-start hook prints the top level. `.claude/tools/tree.sh <dir>` lists one directory's files with their purposes.
2. **Skill:** for a repeatable task use its skill (`add-product`, `add-news`, `add-release`, `verify-site`, `seo-check`, `store-check`, `accessibility-review`, `release-check`, `code-nav`). Skills name the files; don't re-derive them.
3. **Graphify** for orientation across files (the `code-nav` skill has the procedure and a self-test; use it before changing code you haven't seen this session): `.claude/tools/graph.sh query "<keywords>"`, `explain "<name>"`, `affected "<name>"`.
4. **Serena** for symbols in JS, CSS and HTML: `get_symbols_overview`, `find_symbol` (with `include_body`), `find_referencing_symbols`, symbol-level edits. Use it instead of reading a whole file. See `.claude/README.md`.
5. **File:** open only what the layers above named, with Grep or Read `offset`/`limit`.

Preserve module boundaries: edit only the files a change needs, and leave unrelated modules alone.

## Workflow

One-file changes: just do them. Modularity applies to every file (scripts, styles, pages, server modules, tests, notes, Claude config): one purpose per file, change only what the task needs. Independent review or testing goes to an agent in `.claude/agents/` (`architect` before structural changes, the reviewers and testers after), asking for findings only. Changes across areas: the saved workflow `change` (plan, build in parallel on disjoint files, verify, update docs; never commits; `.claude/README.md`).

**Parallel by default.** Independent tool calls go in one message; checks that don't depend on each other run together (`npm run test:store` for the store suites; never `test:api` beside `test:browser`, each rebuilds `dist/`). Spawn subagents only for several sizeable independent parts or an independent review; small or single-area work is done inline, to keep usage down. Parallel subagents work on disjoint files, each in a worktree from the current branch (`git worktree add -b <name> .claude/worktrees/<name> HEAD`; automatic worktrees can start from a stale commit), briefed with what you already know (changed files, diff range, findings, checks run and their results) so they don't re-explore.

## Context

Keep context while it helps; clean up only at a task boundary (task done, PR opened or merged, before `/clear`) or when context is crowded. Drop the superseded: reads of files since edited, outputs of re-run checks, finished subtasks' detail, duplicates. Carry into any compaction or summary: the user's requirements and decisions, security constraints, unresolved issues, verified results (with the command that showed them), branch and next step. Multi-step task at a boundary: the `handoff` skill. A handoff is never the only copy of a requirement or decision (those go in `docs/` or Issues first); check saved knowledge against the repository before relying on it.

## Checking changes

Run `node scripts/build.js`, then `node scripts/seo-test.js` and the `verify-site` skill (the `seo-check` skill covers all three). For anything touching the store (`server/`, `functions/`, `db/`, store pages or scripts) also run the `store-check` skill (unit, API security and browser chaos tests). Before calling a change ready, run `release-check`. CI (`.github/workflows/seo.yml`) and the deploy run the same SEO tests; the deploy stops if they fail.

## Git

Develop on the branch the session names. Don't open a pull request unless asked; when you do, put `Closes #N` in it.
