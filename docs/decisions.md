---
title: Decisions
summary: Dated record of what was chosen and why.
updated: 2026-10-10
---

# Decisions

## 2026-10-10: Engine Phase 0 measurements confirm Rust, zlib-rs, no SIMD

Measured on a 1 GB synthetic pack (918 files; numbers in [engine](engine.md)): listing is instant (10 ms native, 0.7 s in Chromium), and decompression is what costs. Native and WebAssembly results are identical. zlib-rs replaced miniz_oxide (about 20% faster, same results). WebAssembly SIMD brought nothing measurable, so it's off and older browsers keep working. In Chromium, 4 Web Workers check a 1 GB pack in about 8 s, far less than the upload takes, so browser-side checking is kept. The engine's WebAssembly build is 389 KB (about 180 KB gzipped). With the `basic` Container's limits the engine checks a 1 GB pack in about 20 s using 7 MB of memory and is healthy 0.5 s after starting, so the Container now sleeps 15 s after its last job instead of 30 s (it is billed while awake). The engine Worker is a separate Worker because Pages Functions can't consume Queues or own Containers; the container has no internet except R2's S3 endpoint.

## 2026-10-10: Pack Builder, asset engine and selective downloads (planned)

Owner's request and answers; full plan in [packs](packs.md) (PLANNED / NOT IMPLEMENTED).

- **Packs are assets, not ZIPs.** A Pac holds folders and individually identified assets with versions and provenance; an uploaded ZIP is unpacked, every file stored byte for byte and checked by SHA-256, and the ZIP discarded. Originals are never converted, resampled or recompressed.
- **Who:** the admin and Studio creators, in the first release. Moderation is **automated review**: clean versions publish; flagged ones wait for an admin with reasons.
- **Buying stays per product.** Customers download any subset they own (file, folder, Pac, selection across products) as one store-only ZIP; checkout, entitlements and download authorization are unchanged.
- **Revisions:** the owner answered "buyers get the latest version only" (files a revision removes listed in Your Stacc with an "Updated" badge for 30 days). Reopened after the vision was added: it conflicts with purchase permanence (vision §6); see [packs](packs.md) H8. Not built until decided.
- **Creator storage:** 500 MB free per creator; extra storage will be paid by the creator later (not built).
- **Product pages** show the contents tree and stats before purchase; store filters come from the files, not hand-entered tags.
- **Personal collections, tags and saved searches** in Your Stacc in the first release.
- **Engine: Rust, run natively in a Cloudflare Container** (server-side from the start, so processing continues with the tab closed), driven by a Queue and a small engine Worker; the site and API stay JavaScript. Chosen over C++ (memory-unsafe parsing of hostile files; best audio-analysis libraries are GPL/AGPL), Python (large image, slow cold start) and Go (weak audio libraries).
- **Replaceable:** the engine is reached only through a versioned JSON job contract with conformance fixtures, so another implementation can replace it; each feature (analysis, bundles, derived facets, contents tree) can be switched off without affecting uploads, purchases or single downloads.
- **Browser side too (rev. 4):** the same Rust engine is compiled to WebAssembly for the Pack Builder: the pack's tree and problems show before uploading, files upload one by one, and revisions upload only changed files. The Container re-checks everything and stays the authority; old browsers upload the whole ZIP instead.
- **Full-pack ZIP cache** exists behind a switch, off by default: streaming a store-only ZIP costs almost nothing, while a cached copy doubles the pack's storage; switched on only if measurements show it helps.
- **Cost:** Workers Paid ($5/month), staying inside its included usage: a `basic` Container (¼ vCPU, 1 GiB), one job at a time, sleeping after 30 s; a budget guard alerts at 80% and pauses processing at 95% of any allowance; total R2 storage capped at 9 GB of the free 10 GB until the owner raises it.
## 2026-10-10: The vision document guides the build

The owner supplied a vision and product-principles document and asked that it guide the build. It lives in [vision](vision.md), named apart from [identity](identity.md) (the Glitches & Stitches project). It labels each point as established direction, working proposal or open question; agents follow the first, may plan with the second, and ask about the third. Earlier dated decisions here (e.g. the 20% fee, per-kind licences) stand until the owner changes them.

## 2026-10-09: A clean, glassy look with motion as feedback

Owner's request: the site should look very clean, use transparency more, and have clean animation on transitions and feedback. Applied to AutoStacc's platform pages (projects keep their own skins): see-through panels over soft ambient light, frosted chrome, and short, consistent feedback animations, all off for reduced motion. Details in [autostacc](autostacc.md).

## 2026-10-09: The home page opens on a big banner over an animated DAW

Owner's request, with their answers: the home page everyone sees starts with a large banner that takes most of the screen (about 85%), the site's call to action over it. Behind it, an animated DAW drawn in code (not a picture): lanes of clips, a playhead, meters, in AutoStacc's track colours. It stays in place as a fixed backdrop while the rest of the page slides over it, all the way down. The text stays as it was ("Sounds, presets and music, straight from the artists who make them.", Browse the store, Create account or Open your dashboard). It ships in the same pull request as the projects browser. Visitors who ask for less motion get it still.

## 2026-10-09: Projects get their own browser; the site's other pages follow the store's lead

- **/projects becomes a browser of projects, separate from the store:** nothing is bought there. A project shows how many store items it has and links to the store filtered to it; no prices or buy buttons.
- **Every published project is listed, Studio ones too,** marked "Unverified creator" until AutoStacc trusts the creator. This replaces the earlier rule that kept Studio projects out of `/projects` (below, "Owner answers to the docs audit").
- **Follow and Auto-Stacc work for every listed project,** verified or not (owner's choice). Paid files from untrusted creators still wait for approval before anyone can download them.
- **Filters:** genre and style (the store vocabulary), what a project makes (derived from its releases and products, never typed in), recent activity (releases, news, shows in the last 30 days), and followed / not followed for signed-in people.
- **The same treatment elsewhere:** the home page becomes a discovery hub of curated rows; music, news and shows get browsers across projects; the dashboard and Your Stacc get search, filters and sections; every page gets a quality pass to the store's standard.
- **Only real data:** the music, news and shows browsers list what exists as data (today AutoStacc's own projects); Studio projects join them once the Studio can publish such items.
- **One history for the whole site:** the home page's personal rows use the same on-device history and the same forget / turn-off controls as the store.
- Delivered as one pull request.

## 2026-10-09: Store discovery: server-side search, a transparent score, no invented signals

- **Filtering, counting and paging run in D1** (`/api/store/search`), never by loading the catalog into the browser; one CTE applies running sales so filters and sorts use the price checkout charges.
- **A weighted, documented score instead of machine learning:** eight components normalized to 0..1 with weights in one file (`server/discovery/weights.js`), hard limits (price ceiling, compatibility, ownership, dismissals) decided in SQL before ranking, diversity per creator, and room for new products and creators. Revisit when there is enough real engagement to measure it.
- **Only real data makes claims:** "Bestselling" needs 3+ confirmed purchases in 90 days, cards say "5+ bought recently" at most as a floor, discounts exist only while a sale runs, and there are no ratings until there are reviews.
- **Metadata is a controlled vocabulary** (`server/discovery/vocabulary.js`) shared by the API, the build and (generated) the browser; Studio input is checked on the server, and suggestions are never applied without the creator.

## 2026-10-09: Store recommendations stay on the visitor's device

- **The owner asked for picks based on each visitor's habits and preferences.** They are computed in the browser (`js/taste.js`) from what that browser opened, added to its cart and filtered by; nothing is sent to the store or kept per account, so there is no tracking profile, nothing new for the privacy page beyond one line, and no recommendation backend.
- **Not only more of the same:** picks favour things not yet opened and always keep one place for a kind the visitor hasn't looked at.
- **Visitors control it:** "Forget it" clears the history; "Turn off" clears it and stops recording.
- **Labels are facts only:** formats come from each product's own description, the genre from the project's `genres`, the size from the files actually uploaded. Nothing is guessed to fill a label.

## 2026-10-09: Owner answers to the docs audit's open questions

- **Store is live:** the owner switched it on (Cloudflare permissions, secrets, Stripe, Brevo; issue #44). Real products are in progress (#5).
- **Newsletter provider: Brevo** (already the store's email service; issue #8).
- **Logo:** the placeholder stacked-blocks mark stays for now.
- **Studio projects are not trusted by default:** they stay out of `/projects`, follows, Auto-Stacc and polls until a trust step exists that lets a project in (issue #85). Naming them in Your Stacc is unaffected.
- **Legal facts confirmed:** AutoStacc is run by an individual in Utah County, Utah, under Utah law; bank refunds take 5–10 days; the terms keep "AutoStacc's fee, if any"; /privacy should name the session cookie both ways (`gs.session_token`, `__Secure-gs.session_token` on the live site) (issue #83).
- **Platform fee: AutoStacc keeps 20%** of each creator sale (creator 80%, before Stripe's fees), for new sales only: each order line keeps the split it was written with. A per-creator fee in the Control Center still overrides it.
- **Studio products join the store for every creator,** clearly marked: products of creators AutoStacc hasn't marked trusted carry an "Unverified creator" badge, and their product page says AutoStacc hasn't checked the creator (issue #90).
- **AutoStacc news:** accounts that switch it on join a Brevo list, and the owner can also write and send news from the Control Center (issue #89).
- **/privacy and /help copy approved** (issue #83).
- **Titles:** the home page's title must start with "AutoStacc"; the separator after it is grammar, not a rule.
- **Stripe Checkout and statements say AutoStacc**, not Glitches & Stitches.
- **"Stacc'd" gets used** in the site's copy: Your Stacc's intro, the payment-confirmed message and claiming a free product. Later the same day: it replaces "owned" and "purchased" everywhere the site talks about having something; legal pages and payment words stay plain.
- **Confirmed by the owner in Cloudflare:** the Bulk Redirect from `autostacc.pages.dev` to `autostacc.com`. Creator payouts aren't set up yet (no marketplace Stripe account or secrets), so the key's permissions wait for that.

## 2026-10-09: Docs are checked against the repository, not trusted

- **Each note names the code it describes** (`covers:` frontmatter), so "which note must change with this file" is data, not memory.
- **Broken facts fail, staleness warns.** `scripts/docs-test.js` fails CI and `release-check` on things that are plainly wrong (missing files, dead links, unknown `npm run` scripts, store settings no note mentions, a note missing from the index). A note whose covered code changed only warns, because not every code change alters what the note says; a person or Claude decides.
- **Claude is reminded at the moment it can act:** a Stop hook asks once per new set of stale notes, never in a loop. The owner chose these three (CI check, Stop hook, code→doc map) over a scheduled audit routine.
- Facts the repo can't confirm (external services, artist details) stay as written and become issues, never guesses.

## 2026-10-09: Creator payouts through a second Stripe account (Connect)

Stripe's Managed Payments (AutoStacc's own products) doesn't allow marketplaces or Connect, so creators' products are charged on a second "marketplace" Stripe account and creators are paid from it with Connect transfers. Owner decisions: separate Stripe account; payout on request after the 14-day hold (minimum $10, owner approves and sends); creators in the regions Stripe's self-serve payouts reach (US, UK, EEA, Canada, Switzerland; asked as "anywhere Stripe supports", narrowed after checking Stripe's rules); a refund after payout is taken from the creator's next sales (negative balance); a cart with both kinds is paid in two steps; Stripe Tax on the marketplace account (the owner decides where to register). Off until the marketplace keys are set. How to switch it on: [payouts-setup](payouts-setup.md).

## 2026-10-08: Support address, who runs AutoStacc, refunds and licences

Chosen by the owner, for the trust pages (`data/legal.js`) and the licences to come:

- **Support:** support@autostacc.com (`data/site.js` `email`), one address for help, refunds, privacy and security reports. The owner is setting up the inbox (e.g. forwarding) before launch.
- **Who runs it:** an individual in Utah County, Utah, USA. Terms are governed by Utah and US law; consumer protections where the customer lives still apply. The terms say plainly they are general terms, not drafted by a lawyer.
- **Refunds:** change of mind within 14 days if nothing from the purchase was downloaded; always for duplicate charges, purchases the customer didn't make, and files that are broken or not as described when they can't be fixed.
- **Licences, by kind of product:**
  - Samples, loops, sample packs and presets: royalty-free in the buyer's own music, including music they sell or stream, no credit or fees. No sharing, reselling or repackaging the raw files or presets.
  - Remix stems: remixes may be released and sold if they credit the original artist. No sharing or reselling the stems themselves.
  - Music: personal listening and DJ sets. No re-uploading, redistribution or resale.
  - Visuals and VJ loops: the buyer's own live shows and streams. No reselling or sharing the files.

## 2026-10-08: One Settings area, an account menu, and account deletion that keeps sales records

The owner asked for the site's layout to follow current conventions for settings and navigation, then chose (from researched options): the whole platform frame in scope, keeping AutoStacc's look and modernising the structure; Account and Settings merged into one Settings area with a page per section; Sessions, email preferences, a data export and account deletion added; the account links moved into a menu in the top bar; one pull request.

- **Settings:** `/settings/profile`, `/security`, `/orders`, `/email`, `/privacy`. Two levels at most (Settings, then a section); sections grouped by task; a sub-nav beside the section on computers, a list then one section per page on phones; each section saves on its own and destructive actions sit in a separate danger zone. Real addresses (not tabs in one page) so a section can be linked, reloaded and returned to after login. `/account` is a 301 to `/settings/orders`. Details: [store](store.md#settings).
- **Account menu:** the top bar's account button (your initial) opens Dashboard, Your Stacc, Studio, Settings, the Control Center for an admin, and Log out, in both frames. The sidebar keeps the platform, projects, and Dashboard and Your Stacc as the two signed-in destinations. A disclosure (button + links), not an ARIA menu, because these are page links.
- **Footer:** the mark and tagline, then link columns (Explore, Projects, Create) instead of one line.
- **Deleting an account anonymises, it doesn't erase sales:** chosen with the owner. Orders stay as anonymous records (tax, refunds, disputes) and access ends; everything else of the person goes. Admin accounts and owners of a creator space can't delete themselves from Settings (a creator space needs an owner; AutoStacc closes or hands it over). Password re-entered, email typed to confirm. Deletion also waits out an open checkout. Not built, on purpose: a re-registered email can use a once-per-customer promo code again (anyone can already do that with another email, and this way costs the whole library), and a creator space made in the instant between the owner check and the deletion would be left without an owner (only the person deleting can cause it).
- **Optional emails are opt-in:** chosen with the owner. Receipts and security mail always go; new-release and AutoStacc-news mail have switches, off by default, stored now for when those emails exist.
- **Tokens never reach the browser:** devices are listed by our API without tokens and Better Auth's `/list-sessions` is off; signing a device out resolves its token on the server.

## 2026-10-08: Creator pages are sandboxed (planned)

PLANNED / NOT IMPLEMENTED. The owner wants creators to customise their pages (HTML and CSS first, JavaScript later) without their code touching AutoStacc. Design in [creator pages](creator-pages.md). Choices made with the owner: addresses stay `/projects/<id>` (superseded the same day by `/<creator>/<project>`, see the creators decision); creator content runs in iframes from `sandbox.autostacc.com` (a subdomain, because the owner doesn't want a second domain), made safe by opaque-origin sandboxing (`sandbox` without `allow-same-origin`, also sent as a CSP header), host-only cookies and the exact-origin API check; AutoStacc keeps the frame, store, cart, account and everything search engines read; creator code only gets yes/no answers about the visitor; only curated embeds and no third-party analytics; Levels 1–2 publish instantly, Level 3 needs approval; Glitches & Stitches moves into the sandbox too, at a `first-party` trust level that relaxes rules but not the boundary. A second domain was rejected on cost; what it would have added (separate browser processes for Level 3 code) is recorded in the note. Free vs paid tiers are left to the owner.

## 2026-10-08: Scheduled Claude routines for bugs, polish and security

The owner asked for light automated upkeep. Four claude.ai routines (Claude Code on the web, each run a fresh session, times in America/Denver, push and email summaries) work from GitHub Issues through the `tasks` skill:

- Health check, Mon and Thu 6:52: build, SEO tests, `verify-site`, `store-check` and `npm audit` on main; files bugs.
- Bug fixer, Mon and Thu 8:47: fixes the top `bug` + `status: ready` issue.
- Polish pass, Tue and Fri 8:47: one `improvement` or P3 issue, or a frontend and accessibility review that files up to 3 issues.
- Security audit, Wed and Sat 8:46: `security-reviewer`, `store-check` and `npm audit`; files `Security:` issues and may open one fix PR.

The owner chose "moderate" auto-merge: a routine may squash-merge its own PR only if it touches 10 files or fewer (generated output not counted), nothing under `server/`, `functions/`, `db/`, `.github/`, `.claude/`, `_headers`, `_redirects`, `wrangler.toml` or `package*.json`, is not a security, auth, checkout, payment, entitlement or download change, CI is green and `code-reviewer` finds no defects. Everything else waits for the owner as a PR with `status: review`. Security fixes are never auto-merged, because merging deploys the live site. The routines and their prompts are edited in claude.ai, not in this repo.

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

## 2026-10-08: Control Center: statistics, impersonation, test purchases, audit log

The owner asked for an admin that runs the business without a developer: real statistics, a way to see the store as a customer, a safe way to test the whole purchase, and an audit trail. Built as `docs/admin.md` describes. Choices:
- **Statistics come only from data the store already keeps** (orders, accounts, entitlements, the download log, the existing anonymous counters, plus `page_view`, `project_view` and `news_view` counters of the same kind). No new tracking of people. Each number states its source (payment, store record, approximate browser count, estimate), and money comes only from provider-confirmed orders, split live/test. Sections are plain modules returning typed metrics, so adding one doesn't touch the page.
- **Impersonation is its own server-side session, not a swapped user id.** A hashed random token bound to the admin's own Better Auth session, short-lived (2 h, 30 min idle), read-mostly by default (writes opt in per route), never live payments, never Better Auth endpoints, and every allowed write audited before it runs. A stale or copied token fails closed instead of falling back to the admin. We considered Better Auth's admin plugin: it swaps the session to the customer's and adds a broad admin API; ours keeps the admin's identity on every request and a smaller surface.
- **Test purchases reuse the real checkout inside a "test-purchase" impersonation**, and only where payments are test payments. Production keeps refusing test keys (config), so test purchases run on a preview deployment or locally. A second Stripe test key in production was rejected: it would put test orders and a second webhook path into the live store.
- **The audit log is append-only by trigger**, and catalog changes (created, price, published, removed) are logged by the database itself, because they arrive through the deploy's sync rather than an admin request. News and events stay in git.

## 2026-10-08: Sales and promo codes, applied by the store

The owner wants to run sales and promotions without a developer. Both are rows the admin creates (`promotions`), never edits to the catalog: the catalog price (from `data/products.js`) stays the reference, and `server/cart/pricing.js` applies the best running sale and an optional code whenever a cart is priced, so the cart, checkout and Stripe always agree. Choices: percent (1–90) or amount; scope everything, products or a project; a code stacks on sale prices; a 50-cent floor on both (Stripe's minimum; free is an entitlement grant, not a discount); usage limits enforced by a database trigger at order insert so concurrent checkouts can't overspend a code; promotions are ended and re-created rather than edited, so each order points at the terms it got. A code's discount reaches Stripe by folding each line's share into that line, not through Stripe coupons, so no extra Stripe objects and the existing amount check still applies. The static pages and their structured data keep the catalog price (they're built from `data/`); the live price shows the sale.

## 2026-10-08: /admin is a 404 to everyone but admins

The Control Center page itself (not just its API) is now gated on the server and answers the site's ordinary 404 page, so it doesn't exist for signed-out visitors, customers, or an admin while impersonating.

## 2026-10-08: Creators own projects; free no-code creator sites at /<creator>/<project>

The owner set the long-term direction (Steam for independent music and creative content: "start for free, sell something, grow with AutoStacc") and, after two rounds of questions, the first step toward it. Built as [creators](creators.md) describes. Choices:
- **Creators are their own entity** (D1 `creators`, members by account), separate from projects, because the creator is the seller of record and, later, the payee. AutoStacc itself is the first creator (`autostacc`), and Glitches & Stitches is its project. **Addresses are `/<creator>/<project>[/<page>]`**, so G&S moved from `/projects/glitches-and-stitches` to `/autostacc/glitches-and-stitches` with 301s from every old address. Names are unique (creators site-wide, projects within their creator, ignoring case), platform words are reserved, and renames redirect and hold the old name for 90 days.
- **Any confirmed account can become a creator for free.** Abuse and cost are bounded by limits (one creator per account, 10 projects, 12 pages, 50 MB of images), by **noindex until an admin trusts the creator**, and by suspension.
- **Blocks only, for now.** The owner wants custom HTML/CSS eventually. It would run on autostacc.com beside logins and checkout, so it waits for a separate sandboxed origin. Creator pages carry no scripts, forms or payments (strict CSP), and products link to the AutoStacc store, where buyers pay.
- **Rendered at publish, not per view.** A creator page is a few rows in D1, not a deployment. `_routes.json` keeps static pages away from the catch-all Function, so they cost nothing extra.
- **The catalog stays in git** for first-party products. A `source` column on creators, projects and products lets the deploy's sync own only its rows, so database-made rows can join later.
- **Money and files are marketplace-ready, without payouts:** each order line records its seller and how its money splits (platform fee default 0 until pricing is decided, per-creator override). Paid files have a lifecycle (pending → published/rejected), and only published files are delivered. Connected accounts have a table and a provider registry but no provider yet.
