---
title: Decisions
summary: Dated record of what was chosen and why.
updated: 2026-10-08
---

# Decisions

## 2026-10-08: Public pitch is "straight from the artists"

The owner found "Stacc it once. Auto handles the rest." odd, then rejected a library-led replacement ("Buy it once. Find it every time."): advertising that AutoStacc has a library is not the pitch. Chosen with the owner: the home page leads with "Sounds, presets and music, straight from the artists who make them", then the artists, the store and free releases (Auto-Stacc). Your Stacc stays the signed-in library, described plainly where it's used, not sold on public pages. Voice: [autostacc](autostacc.md).

## 2026-10-08: A public home page, and the app behind the account wall

The owner asked for `/` to be a real public front page and for the signed-in workspace to be clearly separate, so the site reads as a product with an app behind the account wall rather than a dashboard with a login. This replaces "Home is a hub (dashboard)" below.

- **Public:** `/` (a cover: what AutoStacc is, Create account / Log in / Browse the store, what it does, featured products from `data/products.js`, projects and new releases from `data/`, how it works), `/shop` and product pages, `/projects` and every project's pages, `/about`. Indexed, in the sitemap, open in `robots.txt` (the SEO tests now fail if `/`, `/shop`, `/about`, `/projects` or a project page is ever blocked). The cover asks the store nothing about the visitor except whether they're signed in, to pick which links to show.
- **Signed in:** `/dashboard` (the old hub's Your Stacc meters and personal feed, projects, account shortcuts), `/account` (who you are, orders), `/settings` (name, password; moved out of `/account`), `/library` (Your Stacc). Noindex, out of the sitemap, disallowed in `robots.txt`, strict CSP.
- **Server-side gate:** `/dashboard`, `/account` and `/settings` are Pages Functions (`functions/*.js` → `server/pages/guard.js`) that answer 302 to `/login?next=<that page>` without a session, so a signed-out visitor never receives the app, and serve the static page `no-store` otherwise. Every private API still checks the session itself; the gate is the first line, not the only one.
- **`/library` stays ungated on the server:** guests open their purchases from the receipt link (`/library#key=...`, the fragment never reaches the server) and their cookie is scoped to `/api/`, so a page gate would lock out every guest buyer. Its data is only ever served by `/api/library` (session or guest key); signed out, it shows "Locked" with Log in. Whether to move guests to their own address so `/library` can be gated too is open (owner's call).
- **After login:** back to `?next` when it's a path on this site (`GS.safeNext`: never another host, never `/login` itself, which would loop), otherwise `/dashboard`. The confirmation email returns to `?next` too, or to `/dashboard?welcome=1`.
- **Navigation by state:** both frames render a signed-out set (Log in, Create account) and a signed-in set (Dashboard, Your Stacc, Account, Settings, Log out) marked `data-auth`; `js/account-nav.js` shows the right one and owns sign-out (to `/`). It only picks links; it is never the security boundary.

## 2026-10-08: Glitches & Stitches logo from the owner's sketch

The owner sketched a stacked logo with a thread through the "&" and a sweeping frame, asked for it in the project's style, and reviewed two rounds of drafts. Their calls: combine the original pixel G&S tile with the sketch for the small mark; a simpler, less crowded large logo that fits better and still looks glitchy; mixed case; small mark + text in the project bar; the large logo without the frame on the home hero, glitching in short bursts; used in the project bar, home hero, icon and link preview, and project cards. Details: [brand](brand.md).

## 2026-10-08: Fingerprinted asset links

`Cache-Control: no-cache` in `_headers` wasn't enough: Cloudflare's zone setting Browser Cache TTL (4 hours) overrides it on autostacc.com, and a browser that kept an old `js/util.js` beside new pages lost both nav bars. The deploy copy (`scripts/dist.js`) now appends `?v=<content hash>` to every `/js`, `/css` and `/data` link in every page, so a changed file always has a new address and unchanged ones stay cached. The repository keeps plain links. Setting Browser Cache TTL to "Respect existing headers" in Cloudflare is still worth doing.

## 2026-10-08: Store items wear their project's look; everything becomes drop-in modules

The owner: a project's store items (its Pacs, as they called them) should look like the project they came from wherever they appear, clicking one should show the project's other items, and all functionality must be modular so it can be used anywhere. Agreed in a round of questions: the store items, in their project's style everywhere (store, hub, product page); a click opens the store filtered to the project with the item selected at the top; build the new pieces as drop-in modules now and audit the rest. Built: `look.css` per skinned project + `GS.look`, `js/shop.js` as the `[data-shop]` browser, `js/product-card.js`. The pattern and the audit: [modules](modules.md).

## 2026-10-08: Projects are mini-sites; the sidebar is a rail

The owner: the big sidebar should collapse on a computer, and a project can't feel like a page inside AutoStacc's frame; each project is its own environment with its own header and nav. Agreed in a round of questions: on a computer the sidebar is an icon rail that expands, and the choice is remembered. A project's pages drop the sidebar for a thin AutoStacc strip (home, Store, Your Stacc, Projects, theme, account, cart), then the project's own header in its own style, then its own footer with a small "Sold and delivered by AutoStacc" line. Glitches & Stitches gets back the terminal header it had before AutoStacc. Built as `js/project-frame.js` + `css/project-frame.css`, restyled by each project's skin, so a new project needs no frame code.

## 2026-10-08: Platform voice, AI access and no stale scripts

The owner: AutoStacc's text should be friendly but more professional and to the point; the `$` prompts and all-caps headings read as weird on platform pages, and the site should be readable by AI. Platform and store copy (cart, checkout, account, login, library, 404) dropped the Glitches & Stitches loop words and terminal headings; `--heading-case` keeps all-caps inside the G&S skin only. `llms.txt` is generated from `data/` for AI assistants. Scripts, styles and data are served with `Cache-Control: no-cache` (revalidated, cheap 304s) because their URLs aren't versioned and a phone kept the old header for hours after the rebrand.

## 2026-10-08: Every title ends with AutoStacc

The owner: the site is AutoStacc; Glitches & Stitches is a project, not the site or the site's name. Project pages were titled only with the project ("HAIL (single) · Glitches & Stitches", home "Glitches & Stitches — Official Site"). Now every title ends "· AutoStacc" and project pages name the project before it; no project copy calls itself the official site. The SEO test enforces it.

## 2026-10-08: A project's pages live in its project bar, not the sidebar

The owner found the sidebar cluttered with every project's news, shows and press, and the phone menu too big. A project's pages should only be reachable under the project. The sidebar now has one link per project; on a project's pages a bar under the top bar holds its name, its pages as tabs and its sound switch (sounds belong to the project). The phone drawer is narrower and tighter.

## 2026-10-08: The site is AutoStacc; Glitches & Stitches moves under its project (#47)

The owner decided the site-wide identity: autostacc.com is AutoStacc, the platform, and Glitches & Stitches is a project on it. Agreed with the owner in a round of questions:

- **Addresses:** `/` is the AutoStacc hub. Platform pages: `/shop` (store, all projects), `/library` (Your Stacc), `/about` (AutoStacc), `/projects` (directory). A project lives under `/projects/<id>`; Glitches & Stitches' home, music, news, shows and press move to `/projects/glitches-and-stitches/...` (releases at `.../music/<id>`, posts at `.../news/<id>`). Every old address (`/music`, `/music/hail`, `/news`, `/news/*`, `/press`) 301-redirects to its new one, so no search history is lost. Products stay at `/shop/<id>` (the store is the platform's).
- **Navigation:** a sidebar with two groups, AutoStacc (Store, Your Stacc, About) and Projects (each project, expandable to its own pages). Always open on desktop, a drawer on phones. Account, cart and the theme switch sit in a top-right utility bar.
- **Home is a hub (dashboard)** (superseded 2026-10-08: `/` is a public cover and this moved to `/dashboard`, see above): Your Stacc at a glance, a new releases feed (followed projects first), a projects rack with follow and Auto-Stacc, and a short animated "how it works".
- **Brand:** a new AutoStacc look, stacked and modular, like a DAW (REAPER) but prettier: neutral panels, light and dark themes following the device (switch remembered), signal colours (teal accent plus amber, coral, violet and lime "track" colours that tag content types). Fun and animated, more professional than the project pages. A placeholder stacked-blocks wordmark until the owner supplies a logo.
- **Projects keep their skin:** Glitches & Stitches' pages keep the glitch-terminal look, its UI sounds and easter eggs. Sounds are project-only; platform pages are silent.
- **Search identity:** AutoStacc is the WebSite and Organization; Glitches & Stitches is a MusicGroup at its project page. Platform page titles end in "AutoStacc"; project pages name their project.
This replaces "Home page and site-wide identity unchanged for now" in the platform decision below. Details: [autostacc](autostacc.md), [architecture](architecture.md).

## 2026-10-07: AutoStacc is the platform, Glitches & Stitches its first project (#46)

The owner set the long-term model: AutoStacc is the business and platform (store, accounts, library, delivery, discovery); projects create the content; Glitches & Stitches is the first project and must not be hard-coded into the core. The store was kept and extended, not rebuilt (owner's instruction): auth, checkout, payments, entitlements, download security and their tests are unchanged.

- **Projects are data** (`data/projects.js`, synced to D1 `projects`). Products, releases and news name their project; projects list the platform `features` they use, so polls and relationships are opt-in per project.
- **Project → Stacclet → Pac → Asset, each link stored once on the child.** Stacclets and Pacs are content in `data/` (git-reviewed, like products); assets are the uploaded files (`product_files`) with a new `pac_id` and `kind`. A Stacclet groups Pacs and a Pac holds files; they are separate objects, not one generic "collection".
- **Ownership stays per product.** Products sell Pacs, and download access is still checked on the file's product, so no security path changed. Pac-level ownership (bundles sharing Pacs) waits until bundles exist.
- **Your Stacc is computed in the browser** from the library API plus the static hierarchy, in one pure model (`js/stacc-model.js`) that both views read; nothing is duplicated per view and the model is unit-tested in Node.
- **Auto-Stacc reuses the free-claim grant** (source `free`, idempotent per account), run on follow and lazily on each library load, so it needs no queue or cron and never grants paid products.
- **Selected downloads are sequential signed links**, not a ZIP: no new download path to secure yet.
- **Generic polls and relationships** live in the platform (`server/polls/`, `scripts/lib/relations.js`) and Glitches & Stitches opts in by feature.
- **Home page and site-wide identity unchanged for now:** `/` stays the Glitches & Stitches home and `SITE.artist` still drives page titles, because autostacc.com was set up as the artist's official site (SEO decision below) and changing that is a search-identity change for the owner to decide. The platform appears through `/projects`, Your Stacc, product credits ("by <project> · sold by AutoStacc") and the footer.
Details: [architecture](architecture.md), [autostacc](autostacc.md), [projects](projects.md), [library](library.md).

## 2026-10-07: Own store on Cloudflare Pages Functions, D1 and R2 (#16)

The owner asked for a real store: accounts, a cart, guest checkout, verified payments, a library of owned products, private downloads, receipts and an admin, while keeping the site static, light and on Cloudflare. This replaces "Hosted checkout instead of our own payments" and the per-product `checkoutUrl`.

- **Same Pages project, code only under `/api/*`:** Pages Functions (`functions/`, code in `server/`) run only for `/api/*` and `/media/previews/*`, so every page is still a static file and the public site is as fast as before. Same origin means first-party cookies and no CORS. Plain module per area (auth, catalog, cart, checkout, payments, orders, entitlements, downloads, storage, email, admin, analytics) with its own route table and a 40-line router instead of a framework.
- **Better Auth** for accounts: mature, runs on Workers with D1 natively, does hashing, sessions, verification, reset and rate limits; we write no password code. Email verification is required because purchases attach by email (otherwise anyone could sign up with a buyer's email and inherit their files).
- **Stripe Checkout** (hosted) with server-side prices, signed webhooks through one idempotent, compare-and-set pipeline, and reconciliation through Stripe's API when a webhook is late. The site still never sees card data.
- **Entitlements separate from orders**, so free claims, promos, manual grants, bundles and subscriptions work the same way, and a guest's purchases are adopted (not copied) when they verify the email.
- **Downloads:** R2 bindings can't presign URLs without extra S3 credentials, so links are our own HMAC-signed 5-minute tokens, redeemed by the Worker that re-checks session and entitlement and streams from the private bucket. Revocation takes effect immediately, even for issued links.
- **Catalog content stays in `data/products.js`** (git-reviewed, generates the static pages and search data) and is synced to D1 by a generated `db/catalog.sql`, so the page price and the charged price can't drift. The admin manages what isn't content: sales switch, files, previews, orders, customers, entitlements. Editing titles and prices from the admin would need pages built from the database: later, if wanted.
- **Brevo behind an email interface**, and a `log` provider for local development.
- **Analytics as daily counters in D1** (no cookies, IPs or user ids; DNT/GPC respected) rather than a third-party script.
- **Safe test mode:** a mock payment provider and log mailer that `server/lib/config.js` refuses outside development/test; production refuses test Stripe keys; separate databases and buckets per environment.
- **Deploy stays one workflow:** the store is provisioned and deployed only when the repo variable `STORE_ENABLED` is `true`; otherwise the deploy is the static site exactly as before, so nothing breaks while keys are missing. Node dependencies (`package.json`) are now needed for the store and its tests; `scripts/` stay dependency-free.
- **Tests that attack it:** unit, API security (with a fake Stripe API and really signed webhooks) and browser chaos suites, in CI (`store.yml`).
Details: [store](store.md), [store-setup](store-setup.md), [development](development.md).

## 2026-10-07: SEO from one generator, home at `/`

The owner asked for complete, honest search visibility so autostacc.com is the clear official home of Glitches & Stitches. Hand-copied head tags on every page couldn't scale to a page per release, product and post, and social previews and non-rendering crawlers need static tags. So `scripts/build.js` (plain Node, no dependencies, committed output, also run by the deploy) generates each page's head block, item pages, structured data and `sitemap.xml` from `data/` (the deploy checks the committed output is current); lists still render in the browser. This replaces "no build step" with "no required build step": the committed files are plain static pages. The home page moved from `/home` to `/` (`index.html`): the root of the domain is the strongest official-site signal and the canonical a search result shows; `/home` 301s there. Links became root-relative clean addresses because nested pages need them and `shop.html` links were redirect hops; local preview is `node scripts/serve.js`, which mimics Cloudflare Pages. Placeholder content is `draft: true`: draft news and tour dates are hidden because they stated invented facts, draft products stay visible as "Coming soon" but out of search. The fake booking email and bare-domain profile links were removed. Tests (`scripts/seo-test.js`, verify-site's rendered-head and crawl checks) run in CI and gate the deploy. Details: [seo](seo.md).

## 2026-10-06: Static site, no build step

Plain HTML, CSS and JS. Free to host anywhere (GitHub Pages, Netlify, Cloudflare Pages) and easy to edit. Revisit if a cart or accounts are needed. (Revisited 2026-10-07: pages stay static; the store adds an API beside them.)

## 2026-10-06: Hosted checkout instead of our own payments

Superseded by the store decision above (2026-10-07).


Selling digital files needs payment and secure delivery. A hosted provider handles both, so the site stays static and never touches card data. Provider not chosen yet (tracked as a GitHub issue).

## 2026-10-06: Content lives in `data/*.js`

So content can be changed without editing HTML. See [shop](shop.md).

## 2026-10-06: Notes in `docs/` as an Obsidian-compatible vault

Gives the assistant memory across sessions and lets the owner read and edit the same notes in Obsidian. Relative markdown links so they also render on GitHub.

## 2026-10-07: Claude tooling is layered and loads on demand

The project will grow, so the always-loaded context stays small and everything else loads only when needed. One home per kind of instruction (table in `.claude/README.md`): `CLAUDE.md` for global rules, `.claude/rules/` for per-file-type conventions, `.claude/skills/` for procedures, `.claude/agents/` for read-only reviewers that return findings only, `.claude/workflows/change.js` for multi-agent changes. Reading goes in layers: the repo map printed at session start (from each file's purpose line and each directory's `.purpose`), then Graphify (`tools/graph.sh`, installed and refreshed on call, code-only so no API key), then Serena for symbols (project MCP server for JavaScript, HTML and CSS; its file, shell and memory tools are off because Claude Code has them and `docs/` is the memory; a `remind` hook nudges toward symbol tools), then the file itself. Graphify answers "what depends on what", Serena "where is X and who uses it".

## 2026-10-07: One file per feature, loaded per page

Split `js/main.js` and `css/style.css` so a change touches only the files for that feature, and each page loads only what it uses. Still plain scripts and stylesheets with no build step and no ES modules (so pages work from `file://`). Shared helpers are on `window.GS` (`js/util.js`).

## 2026-10-07: GitHub Issues and labels are the task list

Issues are the work items, PRs the implementation (`Closes #N`), `docs/` only permanent knowledge. State lives in a small label set (status, priority, type, area) because Claude sessions can't read or edit GitHub Projects (GraphQL and user-level APIs are blocked); the Project board (set up by the owner, issue #13) is a human view over those labels. Sessions claim an issue with `status: in progress` plus a `Claimed: <branch>` comment, earliest claim wins. `docs/status.md` was retired and its open items migrated to issues, so there is one task list. The `clear-status-on-close` workflow clears status labels when an issue closes. Workflow for Claude: `.claude/skills/tasks/SKILL.md`.

## 2026-10-07: HAIL plays through YouTube, with Deezer as backup

The owner wants plays on the site to count on the platforms and the song not to be usable for free. The site never hosts audio, so nothing can be downloaded from it; each player streams from its own service. Spotify, Apple Music and Deezer embeds give logged-out visitors a 30-second preview that doesn't count; YouTube plays the full track for everyone and each click-to-play counts as a YouTube view with ad revenue. The owner chose YouTube. It loads through YouTube's player API, and if YouTube refuses for a visitor (HAIL's YouTube release covers 123 countries; it also refuses data-centre machines), the Deezer player takes over (`fallbackEmbedUrl` in `data/music.js`). Never autoplay: autoplayed embeds don't count as views.

## 2026-10-07: Opt-in UI sound, easter eggs, HAIL is the real release

Researched first and agreed with the owner. Browsers block sound before a click and WCAG 1.4.2 wants a clear way to stop audio, so sound is off by default behind a header switch, generated in the browser (no files, nothing to load) and kept short and quiet. Background music across pages would need the site rebuilt as a single-page app, which conflicts with the no-framework rule, so it was left out. Easter eggs talk to the sound engine and to each other only through `gs:sound`, `gs:sound-set` and `gs:egg` events, so each script stays independent. HAIL (verified on Deezer and Apple Music) replaced the placeholder "Patchwork" post and fills the Listen section with Deezer's player, which spells the artist correctly.

## 2026-10-07: Professional artist-site essentials

Checked against what artist sites and EPK guides treat as standard: music you can play on the site, a press page (short and long bio, booking contact, press kit), tour dates with ticket links, newsletter, all platforms linked, and proper sharing and search setup. Added a Listen section (`data/music.js`, embeds only known players), `press.html`, a themed `404.html`, site icon and link-preview image (`img/`), Open Graph and canonical tags, `robots.txt` and `sitemap.xml` (all generated since the SEO decision above), MusicGroup structured data, MusicEvent data only for shows with a ticket link (so unconfirmed dates never reach Google), a skip link, and hiding of placeholder social and streaming links. Bios are written only from [identity](identity.md); nothing invented.

## 2026-10-07: Stitching as a feel, seamless page changes

The owner wants the whole site to read as a glitching terminal that feels pieced together, without literal sewing lines, and with page changes and clicks that never feel like a stop. Dashed "stitch" borders and the stitched seam were replaced by stepped panel edges, misregistered layers and a misaligned monogram. Page changes use cross-document view transitions (pure CSS, no build step; unsupported browsers just load normally), ambient loops follow wall-clock time, and a small random "zap" keeps glitches happening. Details in [brand](brand.md).

## 2026-10-07: Owner-written identity is the creative source of truth

The owner described the project's identity (method, the loop, sound, visuals, personality) in full. It lives in [identity](identity.md) and `CLAUDE.md` points to it for every creative task. The site's hero, About copy and new "The loop" section follow it, and the earlier placeholder About copy ("bass music", live-set claims) was removed because it contradicted or went beyond it.

## 2026-10-07: Clean addresses, home page at /home

The owner wants the site at `AutoStacc.com` with named pages: `/home`, `/shop`, `/news`. The home page file is `home.html` (Cloudflare Pages serves `name.html` at `/name` and redirects `.html` links there), and `_redirects` sends `/` to `/home`. Links in the code stay as `shop.html` etc. so pages still open locally. The root redirect is a 302 so it can be changed later without browsers caching it. Superseded by the SEO decision above: home is now `/`.

## 2026-10-07: Terminal theme in purple, green and black

The owner asked for a neon purple, phosphor green and black look, like an old terminal. Colours stay as tokens in `css/base.css`; product `hue` now only picks green or purple so covers stay on palette. Details in [brand](brand.md).

## 2026-10-07: Hosted on Cloudflare Pages, HTTPS from Cloudflare

The domain, `autostacc.com`, is on Cloudflare, so the site is hosted on Cloudflare Pages (project `autostacc`). It deploys from GitHub Actions (`.github/workflows/deploy.yml`, Wrangler with an API token in repo secrets) rather than Cloudflare's own GitHub connection, which kept looping back to the dashboard during setup. The workflow uploads only the pages, `css/`, `js/` and `data/`, not `docs/` or `.claude/`. Cloudflare issues and renews the HTTPS certificate for the custom domain itself. The custom domain `autostacc.com` is attached to the Pages project (live 2026-10-07). `autostacc.pages.dev` can't be deleted, so a Cloudflare Bulk Redirect (set up in the dashboard, not in this repo) sends it to `https://autostacc.com` with path and query kept. Cloudflare Origin Certificates are not used: there is no origin server to install one on, and their private keys never go in this repo.

## 2026-10-07: Editor-only type config in `js/`

Serena's TypeScript server couldn't link helpers shared through `window.GS`, so references stopped at `util.js`. `util.js` now names the object `const GS` before setting `window.GS`, and `js/jsconfig.json` plus `js/globals.d.ts` tell the server that `window.GS` is that object. Pages never load these files and there's still no build step. The trade-off is one extra global name (`GS`) for the same object.
