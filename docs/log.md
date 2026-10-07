---
title: Log
summary: Dated history of changes, newest first.
updated: 2026-10-07
---

# Log

Newest first.

- 2026-10-07: SEO system (#42): `scripts/build.js` generates page heads (canonical, Open Graph, Twitter, JSON-LD), pages for releases (`/music/hail`), products and news posts, and `sitemap.xml` from `data/`; new `/music` page; home moved to `/` (`index.html`), clean root-relative links, `_headers` noindex for `*.pages.dev`, production `robots.txt`; MusicGroup/WebSite/MusicAlbum/Product/BlogPosting/BreadcrumbList data; HAIL artwork in `img/releases/`; one profile list in `data/site.js`; fake email and bare profile links removed; placeholders marked `draft`. Tests: `scripts/seo-test.js`, rendered-head and orphan crawl in verify-site, CI workflow `seo.yml`, deploy gated. Accessibility: heading levels on shop/news, glitch title copies hidden from screen readers, Escape closes the menu, larger link targets, news tags styled on the news page. Docs: [seo](seo.md), [search-console](search-console.md). Claude: `seo-check` and `add-release` skills, `seo-reviewer` agent, `scripts` rule.

- 2026-10-07: Phone layout cleanup: fixed a header overflow that squished and shifted every page on phones, `[≡]` menu button, tighter spacing, even full-width buttons and grids, swipeable shop filters, one-line chant. No horizontal overflow at 320 to 430px.
- 2026-10-07: Sounds made grittier at the owner's request: mix saturation, harder bit-crush, buzz layer, attack crackle and stutter chops ("Repeat" stutters in the chant motif). Rebalanced so typing stays soft; peak -8.4 dBFS, no clipping.
- 2026-10-07: Sound redesign: one pentatonic scale, soft tones with echo, limiter and light bit-crush, sounds timed to their animation frames and panned to where they happen, the chant as the sound-on motif, section-reveal pings, terminal key clicks and a monogram shatter sound. Levels checked from a recording of the live page (peak -10 dBFS, no clipping).
- 2026-10-07: The Listen player is now HAIL on YouTube (full track, counted views) via the YouTube player API, falling back to the Deezer player when YouTube can't play for a visitor. Streaming buttons are labelled "Stream HAIL on".
- 2026-10-07: The process has a catchy short form from the owner: Tear. Stitch. Glitch. Cinch. Repeat. Used as the hero tagline, the five steps of "The loop", the terminal (`loop` plus one command per step) the press fact sheet and the link-preview image (`img/og.png`); recorded in `docs/identity.md`.
- 2026-10-07: Added the YouTube Music link for HAIL (from the owner, verified) to the Listen buttons and the HAIL news post.
- 2026-10-07: HAIL wired in (Deezer player, Apple Music and Deezer links, real news post replacing "Patchwork", hero line, fact sheet, Apple Music and Deezer artist profiles in the footer). Added opt-in browser-generated UI sound (`js/sound.js`) and easter eggs (`js/eggs.js`, `js/terminal.js`, `css/eggs.css`) on every page. `verify-site` now ignores console errors from embedded players.
- 2026-10-07: Professional pass: Listen section (`data/music.js`, `js/music.js`), press page (`press.html`, `js/press.js`, `css/press.css`) linked from the nav and footer, themed `404.html`, icons and link-preview image in `img/`, Open Graph/canonical/theme tags, `robots.txt`, `sitemap.xml`, MusicGroup and ticketed MusicEvent structured data, skip link and `aria-current`, placeholder links hidden, inline styles removed. Deploy uploads the new files; `tree.sh` reads `.txt`, `.xml` and image purposes. Tested with `wrangler pages dev`.
- 2026-10-07: Hardened `.gitignore`: secrets (`.env*`, `.dev.vars`, `*.pem`/`*.key`/`*.crt` and other key files), tool output (`node_modules/`, `.wrangler/`, `dist/`, test reports, logs), `.claude/settings.local.json` and OS clutter; `docs/.gitignore` also ignores Obsidian's `.trash/`. Checked that no tracked file is ignored and that no key or token was ever committed.
- 2026-10-07: Branch cleanup: merged `ccr-9560f71b-ivcspt` (Serena type config) and kept its editor-only files out of deploys; deleted `ccr-933cb98c-ky2szz` (already merged), `test/issue-workflow` (temporary test file) and `claude/cloudflare-agent-setup-ikz86q` (Workers hosting config, superseded by the live Cloudflare Pages setup).
- 2026-10-07: Reworked the look so stitching is felt, not drawn: removed dashed borders and stitch marks, added stepped panel edges, misregistered cards and news items, glitch "zaps", glitch-slice page transitions with a persistent header, wall-clock ambient motion and a cross-fading shop filter. `verify-site` now waits for the filter transition.
- 2026-10-07: Added `docs/identity.md` from the owner's description and linked it from `CLAUDE.md`, artist, brand and index. Home page: new tagline, About copy rewritten to the method, a stitched-together monogram, and a "The loop" section with the seven-step process on a stitched seam.
- 2026-10-07: `autostacc.com` is live on Cloudflare Pages with HTTPS; `/` redirects to `/home`. Owner is adding a Bulk Redirect from `autostacc.pages.dev` to `autostacc.com`.
- 2026-10-07: Renamed `index.html` to `home.html` and added `_redirects` so the site's address goes to `/home`; the deploy now uploads `_redirects`. Tested with `wrangler pages dev`.
- 2026-10-07: More dynamic motion: CRT power-on titles, typed hero tagline, scroll reveals and flicker-on section titles (`js/motion.js`, loaded on every page), burstier glitch, rolling refresh band, snappier hover and press states. Reduced motion turns it all off.
- 2026-10-07: Retheme to an old-terminal look (black, phosphor green, neon purple, VT323 headings, CRT scanlines, blinking cursor). First deploy to `autostacc.pages.dev` succeeded after the API token was given Pages Edit permission.
- 2026-10-07: Added `.github/workflows/deploy.yml` to deploy to Cloudflare Pages from GitHub Actions, since the Cloudflare GitHub connection wouldn't complete. Needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repo secrets.
- 2026-10-07: Chose Cloudflare Pages for hosting with Cloudflare-managed HTTPS (see decisions). Added deploy steps to the README.
- 2026-10-07: Made Serena useful for JS: `js/jsconfig.json` and `js/globals.d.ts` (editor-only) plus `const GS` in `util.js` let it follow `window.GS` helpers across files; documented `depth: 2` for script overviews. `tree.sh` reads purposes from `.ts` and `.json` files.
- 2026-10-07: Fixed #14, #21, #22 and #23: footer links are 24px+ tall, `hue: 0` renders red, a shared cyan `:focus-visible` ring with `aria-pressed` on the shop filters, and reduced motion now also stops card/button motion and smooth scrolling.
- 2026-10-07: Owner approved all Serena tools (`mcp__serena` in `.claude/settings.json`) and set up the GitHub Project board. Closed #12 and #13.
- 2026-10-07: Cleanup pass: Serena now covers JS, HTML and CSS and has `remind`/`cleanup` hooks; Serena installs at session start; `graph.sh` only rebuilds when files change; merged seven overlapping tooling entries in `decisions.md` into one; trimmed the README layout list.
- 2026-10-07: Added four subagents and split the rules into html, js, css, data, docs and claude. Tested each agent headlessly; findings filed as issues #21 to #23.
- 2026-10-07: Naming cleanup: `.area` to `.purpose`, skill `tasks`, workflow `clear-status-on-close`, label cleanup, removed `.github/project-setup.md` (now issue #13).
- 2026-10-07: Moved tasks to GitHub Issues (labels, issue forms, PR template, `tasks` skill). Retired `docs/status.md`; its items are issues #4 to #16.
- 2026-10-07: Added Serena (`.mcp.json`, `.serena/project.yml`, `.claude/tools/serena.sh`) and five skills under `.claude/skills/`. `CLAUDE.md` now points to them. No site files changed.
- 2026-10-07: Made the tooling modular: compact map, lazy `graph.sh`, path-scoped rules, generic `change` workflow, `.claude/README.md`. Slimmed `CLAUDE.md`.
- 2026-10-07: Added the `site-change` workflow and a Workflow section in `CLAUDE.md`. Syntax-checked only.
- 2026-10-07: Session hook now prints a one-line-per-file repo map (`.claude/hooks/tree.sh`). Added `summary:` to every note.
- 2026-10-07: Refactored `js/main.js` into `js/{util,layout,shop,news,shows,newsletter}.js` and `css/style.css` into `css/{base,layout,shop,news,home}.css`. Pages load only what they use. Added the "Read in layers" rule to `CLAUDE.md`, `.graphifyignore`, the Graphify session hook and allow rules.
- 2026-10-06: Added the notes vault in `docs/` and `CLAUDE.md`.
- 2026-10-06: Built the first version of the site: home, shop and news pages, with placeholder content.
