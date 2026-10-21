---
title: Decisions
summary: Dated record of what was chosen and why.
updated: 2026-10-21
---

# Decisions

## 2026-10-21: Community in the menu, a creators directory, loading placeholders, still chrome and the home logo intro (owner)

The owner asked for a Community tab in the menu, every creator credited, a better loading screen everywhere, smooth page changes and a small logo animation on the home page, then answered the questions one by one in chat. Built the same day (Claude):
- **Menu.** The sidebar's AutoStacc group is Home, Store, Explore, **Community**, About (`/community`, its own icon). The Projects group shows **Projects** (renamed from "All projects", `/projects`) and **Creators** (`/creators`). The phones' bottom bar adds Community: Store, Projects, Community, Your Stacc or Log in, Menu, with no sideways scroll at 320px. The footer's Explore column lists Creators too (`js/layout.js`).
- **Creators directory (`/creators`).** "All projects should be credited" became a page to browse creators, not just projects: each card has the name, an initial as avatar, a short bio only for AutoStacc's own creators (their `summary` in `data/creators.js`), their visible projects and a link to `/<creator>`, with search and sort. It lists first-party creators and Studio creators that are active, published, not deleted and have at least one published project, never suspended or unpublished ones; "Unverified creator" follows the store's trust rule. Its data is `GET /api/creators` (`server/projects/creators.js`), cached publicly because it holds nothing per person. It says no more than the `/<creator>` profiles and `/projects` already show (name, address, trust, project names and addresses), so **`/privacy` is unchanged**.
- **Loading placeholders.** Everywhere content loads from the API, the region shows grey shapes like the coming content (cards, rows, lines, buttons, tiles, panels) with `aria-busy`, a soft shimmer only without reduced motion, and no layout shift. One shared helper, `GS.skeleton` (`js/skeleton.js`, `css/skeleton.css`), serves every feature, and features work without it. Login, sign-up, reset and other request buttons show a small spinner (`GS.skeleton.busy`) and stay disabled while pending. Store-offline and error states are unchanged.
- **Seamless page changes.** The cross-document view transitions stay, but the sidebar, top bar, phone bar and project header no longer animate, so only the main content cross-fades (`css/core.css`). Same-origin pages are preloaded on hover or press: Speculation Rules (prefetch, moderate eagerness) from a same-origin file, `speculation-rules.json`, named by a `Speculation-Rules` response header, not an inline script, so no content policy is loosened. It excludes `/api/*`, `/media/*`, `/logout`, `/admin`, `/cart`, `/checkout`, links with a query string and `[download]` or `[data-no-prefetch]` links. Browsers without it get one `<link rel=prefetch>` per link on hover or press (`js/prefetch.js`, skipped when saving data). No animation under reduced motion.
- **Home logo intro.** On every visit to `/`, the mark's four bars drop and stack into place in about a second, then rest (`css/cover.css`). It is movement only, so it never hides or delays content or input, and it is skipped under reduced motion.

## 2026-10-21: The community opens (owner)

The owner asked to activate the community. `community.forum` is on through `FEATURES_ON` in `wrangler.toml` (production and preview), so it ships with the deploy. `/privacy`, `/terms` and `/community-rules` no longer say it is opening soon. Still open at launch, by the owner's choice: the UK and EU risk assessments, the NCMEC reporting steps and contest rules (challenges aren't built), plus the LLC-dependent legal setup and DMCA agent deferred on 2026-10-20. Each creator's Community page and the move of news posts there (#174) are not built yet.

## 2026-10-21: The owner's answers to #171 to #179 (owner)

Given one by one in chat after the #154 entry below. Built the same day (Claude); where an answer changed what #154 built, this entry wins.

- **#172 Who manages first-party creators.** The account `FIRST_PARTY_OWNERS` names owns that first-party creator (the owner's account for `autostacc`). It is a deploy **secret** like `ADMIN_EMAILS` (`<creator>=<email>` pairs, `server/lib/config.js`), so no email is in the public repository and no email or project is hard-coded in platform logic. Only a verified, non-impersonated account with that email becomes owner, and only of a creator whose source is `catalog`. It happens when that account opens the Studio (`server/studio/creators.js`, in one batch, audited). The interim "any admin can become the first owner once" path is removed. Anyone who claimed that way stays on the team as an admin and is not removed (migration `0043_first_party_owners.sql`). Setup: [store-setup](store-setup.md).
- **#173 Placeholders.** The draft posts and the 5 draft shows stay gone. Every other placeholder in `data/` is removed too, including the placeholder Stacclet `frayed-signals` and its Pacs, and so are the warnings that existed only for them. Nothing was invented to replace them. Tests use fixtures outside `data/`.
- **#171 and #177 Money and limits.** A first-party creator gets 100% of its sales, on AutoStacc's main Stripe account. There is no platform fee and no creator share or payout records (`server/revenue/split.js`: such a line has fee 0 and share 0, so earnings and payouts never see it), and its sales are never held. First-party creators have **no** Studio limits (products, projects, pages, images, files, storage quota) and no paid-storage charges (billing refuses a plan). The test is always the creator's source (`isFirstParty`, `limitOf`, `includedQuotaOf` in `server/creators/policy.js`), never a project id. The platform's Cloudflare usage budget guard still applies to everyone, as documented ([store](store.md)). This settles the vision's open question "Free-tier limits" only for first-party creators.
- **#176 No code-based product system.** The catalog pipeline for products is retired, and so is the code-defined Stacclet and Pac data: `data/products.js`, `data/stacclets.js` and `data/pacs.js` are gone. Also gone are the product parts of `scripts/lib/catalog.js`, the static `shop/<id>` pages, the product, Stacclet and Pac rows in `db/catalog.sql`, and the Control Center tools that served only catalog products. Whatever the old sync left (`source = 'catalog'`) is unpublished and marked deleted, never dropped, because orders and entitlements point at it (migration `0042_retire_catalog_products.sql`). Products are made in the Studio by every creator. Tests use API-created Studio products or test-only fixtures outside `data/` (`scripts/dev.js` seeds them for local work). `data/product-types.js` stays. Creators, projects and polls are still synced from `data/`.
- **#175 Product pages and search.** Every Studio product gets a page rendered on the server at **`/shop/<product-id>`**, for every creator (the owner chose `/shop/<product>` over per-creator addresses). The page names the creator and project (`server/shop/`). A trusted creator's product page (first-party included) is indexable, with a canonical, Open Graph and Product JSON-LD, with an Offer only while it is for sale. It is listed in `/sitemap-shop.xml`, which `robots.txt` names. Other creators' pages are noindex. The old `/product?p=<id>` answers a 301 to `/shop/<id>`. That redirect lives in the Function, because `_redirects` can't match query strings. `seo-test.js` checks it ([seo](seo.md)).
- **#174 News waits for the community (changed).** Posts, updates and announcements belong on each creator's **Community** page, which appears only when the community opens (owner: "wait for community"). Until then news is hidden. The Studio News editor is removed and news pages are offline. `/<creator>/<project>/news` and `/news/<slug>` answer a 301 to the project's home, so nothing 404s. News is gone from sitemaps, the home, Explore and dashboard feeds and project pages. The `project_news` rows stay in D1, unpublished to the public, because facts are never dropped. They become the creator's community posts later at the same addresses ([community](community.md)). This replaces "all news moves to Updates" (2026-10-16) and the #154 News editor.
- **#178 Events and the builder (changed).** Shows become **events** (`project_shows` → `project_events`, migration `0041_events.sql`, every row kept):
  - Each project with events has an Events page at `/<creator>/<project>/events`, and each event has its own page at `/<creator>/<project>/events/<slug>`. An event page carries Event JSON-LD and "Add to calendar": a static `.ics` download and a Google Calendar link, with no new data collected.
  - The site gets a public events **calendar** at `/events`, linked from Explore. It shows a month or a list of event cards (styled like product and project cards), with filters for date range, city, country and host. Signed-in visitors also get a **Following** filter for the projects they follow. Signed out, everyone sees the calendar. It is server-rendered and cached, the month table is keyboard-reachable, and phones get the list.
  - The Studio's Shows editor becomes the **Events** editor. Releases keep their own pages and the **Music** editor. Both take tags under the store's tag rule (`server/lib/tags.js`).
  - The visual builder gets **Releases** and **Events** elements that show a creator's own project's releases or upcoming events. The existing hand-typed events element gained an optional project ([builder](builder.md)).
- **#179 HAIL's artwork.** Release artwork that is still a file of the site (`/img/releases/`) moves into the creator's storage like any Studio image. SQL can't upload bytes, so this is a one-time, idempotent admin action (`GET`/`POST /api/admin/content/artwork[/move]`, `server/admin/artwork.js`, audited). It copies the file from the deployed assets through the normal image checks, then swaps the release's artwork with a compare-and-set. The page keeps working until it runs. **Follow-up:** `img/releases/` is deleted only after the action has run in production. Migration 0040's text still references it, and migrations are never edited ([admin](admin.md)).

## 2026-10-21: Glitches & Stitches runs through the Studio like every creator (owner, #154)

The owner's answers to #154 ("manage Glitches & Stitches in the creator hub while keeping its custom code"):
1. **Everything at once.** Products, releases, news and shows all move out of `data/` into the Studio and D1. The Studio gets **Music** (releases), **News** and **Shows** editors for **every** creator, not just first-party ones. "Music" avoids a clash with the Product Studio's existing **Release** section (publishing a product).
2. **The 6 placeholder products are deleted** (`sample-pack-vol1`, `serum-presets`, `stems-patchwork`, `ep-corrupted-thread`, `wallpapers`, `vj-loops`; all drafts). The owner makes the real ones in the Studio. `data/products.js` stays, empty: the catalog pipeline is dormant until #176 is answered. The deploy's sync unpublishes and soft-deletes the 6 rows. The tests keep them as dev-only fixtures (`test/support/catalog-fixtures.js`), never as data.
3. **The only first-party exception is the page code.** The project's hand-written pages (`autostacc/glitches-and-stitches*`, its CSS, JS and sounds) may keep running their own scripts and skin. Everything else goes through the same paths as any creator. Nothing names the project in platform code; its look on server-rendered pages is data (`projects.look`, synced from `skin`/`sounds`/`entity` in `data/projects.js`).

How it was built (Claude, following the architect's plan):
- **Real facts were migrated, never invented or dropped.** Release `hail` and post `hail-out-now` are seeded into `project_releases` and `project_news` by `db/migrations/0040_project_content.sql`, published, with the same slugs. The post's HTML body became site-text markup. The release keeps its root-relative `/img/releases/` artwork while it is untouched (#179).
- **Not migrated:** the draft posts `fall-tour-dates` and `frayed-signals-sample-pack` and the 5 draft shows, which were placeholders and never facts. They are still in git history if the owner wants them back (#173).
- **Addresses kept.** Release and news pages stay at `/<creator>/<project>/music/<slug>` and `/news/<slug>`. They are now rendered on the server for every creator (`server/content/`, through `functions/[[path]].js`), with the same title format, canonical, Open Graph and JSON-LD. They are indexable only for **trusted** creators; the catalog sync marks first-party creators trusted. They are listed in `/sitemap-content.xml`, named in `robots.txt`. `scripts/dist.js` now excludes a first-party creator's hand-written files one by one, not its whole folder, so these addresses reach the Function. `seo-test.js` accepts a recorded release or news URL only if a migration seeds it.
- **Access.** Catalog creators and projects stay strict by default. Only product and content routes opt in (`{ allowCatalog: true }`). The builder, profile site, renames, deletes, new projects, team and money stay closed for first-party creators, whose pages are hand-written. `autostacc` had no members, so an AutoStacc admin can **become the first owner** of a first-party creator that has none, once (Studio overview, audited). This is interim until the owner answers #172 (the alternative is "admins count as owner"). Content editing reuses the existing capabilities: `site.edit` for drafts, `site.publish` to publish, change live items or delete. No new roles were made (vision open question "Final project and creator permission roles").
- **Money unchanged.** A first-party creator's Studio products are AutoStacc's own sales: the main Stripe account, never held while creator purchases are closed (#154: "no creator split and no payouts"; #171 confirms). The test is the creator's source (`creatorSaleSql` / `creatorSaleIds` in `server/creators/creators.js`), never a project id.
- **News and community Updates.** The community plan (2026-10-16 below) still says all news, first-party included, moves to Updates. The Studio News editor doesn't settle that: whether it replaces Updates for news, or Updates later takes it over with the same addresses, is #174.
- **Known gaps against the old static pages (verification, not decisions; follow-ups):** the music and news hand pages lost their ItemList JSON-LD; release pages have no "From the shop" or connections section yet (`scripts/lib/relations.js` is kept but unused by the build); news pages say NewsArticle where the static ones said BlogPosting; release views aren't counted (the server-rendered player doesn't load `js/music.js`); HAIL's Deezer widget fallback player is dropped. The pages are indexable only once the deploy's catalog sync has marked first-party creators trusted, which runs after migration 0040. `server/content/render.js` (about 375 lines) copies the page shell from `scripts/lib/pages.js` and the share image and logo from `data/site.js`; splitting it and sharing those is a follow-up. `server/revenue/split.js` still records a creator share for first-party Studio sales; it is never shown (first-party earnings stay closed) and whether it should be recorded is undecided.
- **Fixed in verification:** first-party product listing and creation (`server/studio/products.js`) and artwork upload and delete (`server/studio/site-files.js`) opt in with `{ allowCatalog: true }`; an image a release uses as artwork is kept when deleted (`stillUsed` in `server/sites/images.js`). Tested in `test/api/content.suite.js`.
- **Open items, all answered the same day** (owner, 2026-10-21; next entry above):
  - #172: who manages first-party creators: the account named in the `FIRST_PARTY_OWNERS` secret; the admin one-time claim is gone.
  - #173: the dropped drafts stay gone, and every other placeholder in `data/` is removed.
  - #174: news is hidden until each creator's community opens; its posts move there.
  - #175: every Studio product gets a page at `/shop/<id>`.
  - #176: the catalog pipeline for products, Stacclets and Pacs is retired.
  - #171 and #177: first-party creators keep 100% of their sales and have no Studio limits.
  - #178: shows become events, with a public calendar; Releases and Events builder elements.
  - #179: HAIL's artwork moves into storage through a one-time admin action.

## 2026-10-20: Community legal gates deferred (owner)

The operator's legal setup and the DMCA designated agent are no longer launch gates for the community: they wait until AutoStacc is an LLC, planned once the site has traction. Reason: not worth the cost and paperwork before there's traction. Trade-off accepted: until the agent is registered, the US hosting protection for user uploads doesn't apply. CSAM scanning is on; the other gates in [community safety](community-safety.md) stand.

## 2026-10-15: The community library

Phase 8 (Claude, following the owner's answers): a shared piece is a checked fragment of a site document, never markup; it drops the seller's own products, projects and audio players, which a buyer's site couldn't show anyway. A paid piece is an ordinary store product of a new kind, `template` (general digital-goods tax code, its own licence), so buying, refunds, payouts and Your Stacc need nothing new; ownership is the buyer account's, usable on any creator it edits for. A takedown hides the piece's files everywhere but can't take back words already copied into drafts. After the security review: non-buyers see a paid piece's layout only; using a bought piece counts as a download for refunds (as with files); an installer's sites show a paid piece's files only while the installer still owns it; installing your own piece never keeps files alive. Changed from the earlier proposal: a deleted piece's files used elsewhere keep counting against their creator until the sweep deletes them (otherwise two accounts could pass the storage cap); a paid piece is unlisted until its product is on sale; a refund claims its order so a simultaneous use can't slip through.

## 2026-10-15: Team roles are capabilities

Phase 7 of the builder (Claude, following the owner's four roles): routes ask for a capability (`site.edit`, `site.publish`, `products`, `projects`, `members`, `library.share`, `money`), mapped to roles in one file (`server/creators/roles.js`), so roles can change without touching routes. The existing `editor` role, never grantable before, now means site drafts only; product work moved to the new Store manager. Any member may upload site files (product pages use them too). Admins manage the team but can't touch the owner, other admins, or make admins.

## 2026-10-15: The visual builder

Owner's request: turn the Studio's mini web builder into an "account builder", simple and visual like Wix. Answers, full plan and build order in [builder](builder.md):

- **One editor** for the creator profile (`/<creator>`) and every project site, edited on the live page with a **free 12-column grid**, automatic phone layouts with phone-only tweaks, several pages with a custom menu, undo / redo, a phone preview, section banners and backgrounds. Existing sites convert automatically; the form editor goes.
- **Four starter templates**: Artist / Producer, DJ / Live, Sample-pack brand, Label / Collective.
- **CSS, never creator JavaScript.** A checked, rebuilt stylesheet confined to the page area plus class names; interactivity comes from a library AutoStacc writes (motion, slideshows, tabs, accordion, lightbox, audio player with waveform, countdown, store pieces), the only script a creator page may load. Chosen over sandboxed creator code ([creator-pages](creator-pages.md)) because it needs no second origin and can't run anything a creator wrote.
- **Store pieces are links only**: carts, sign-in and payment stay on AutoStacc's own pages.
- **Community library**: trusted creators share sections, elements and templates; anyone can report; the Control Center takes pieces down. Pieces can be sold as store products (20% fee); buyers use them on their own sites only.
- **Roles**: Editor, Publisher, Store manager, Admin; only the owner controls money. **History**: last 20 publishes. **Scheduled publishing.** **Uploaded fonts (WOFF2) and logos.**
- **Storage: one 550 MB cap** for images, fonts, templates, history and paid files; template images count only against the seller; history counts only images old versions alone still use; at the cap only uploads stop. A deleted template's images stay while sites use them and stop counting against the seller (proposed by Claude).
- **How phases 1–6 were built (Claude, same day):** shipped together instead of behind a switch (the new document would have broken the old editor); the editor draws the page with the same renderer as the server; the audio player draws its waveform live from the playing audio (products' preview clips have no stored waveform, and creator pages may make no requests); a profile page and a project share `/<creator>/<name>` and each refuses the other's name; a scheduled publish happens at the first visit after its time or the daily sweep, since Pages Functions have no cron of their own.

## 2026-10-10: Engine Phase 0 measurements confirm Rust, zlib-rs, no SIMD

Measured on a 1 GB synthetic pack (918 files; numbers in [engine](engine.md)): listing is instant (10 ms native, 0.7 s in Chromium), and decompression is what costs. Native and WebAssembly results are identical. zlib-rs replaced miniz_oxide (about 20% faster, same results). WebAssembly SIMD brought nothing measurable, so it's off and older browsers keep working. In Chromium, 4 Web Workers check a 1 GB pack in about 8 s, far less than the upload takes, so browser-side checking is kept. The engine's WebAssembly build is 389 KB (about 180 KB gzipped). With the `basic` Container's limits the engine checks a 1 GB pack in about 20 s using 7 MB of memory and is healthy 0.5 s after starting, so the Container now sleeps 15 s after its last job instead of 30 s (it is billed while awake). The engine Worker is a separate Worker because Pages Functions can't consume Queues or own Containers; the container has no internet and no storage credentials: it reads job inputs through the engine Worker, which answers from its R2 binding (decided 2026-10-10, below).

## 2026-10-10: Pack Builder, asset engine and selective downloads (planned)

Owner's request and answers; full plan in [packs](packs.md) (built through Phase 9 by 2026-10-14).

- **Packs are assets, not ZIPs.** A Pac holds folders and individually identified assets with versions and provenance; an uploaded ZIP is unpacked, every file stored byte for byte and checked by SHA-256, and the ZIP discarded. Originals are never converted, resampled or recompressed.
- **Who:** the admin and Studio creators, in the first release. Moderation is **automated review**: clean versions publish; flagged ones wait for an admin with reasons.
- **Buying stays per product.** Customers download any subset they own (file, folder, Pac, selection across products) as one store-only ZIP; checkout, entitlements and download authorization are unchanged.
- **Revisions (decided after the vision, §6):** buyers keep whatever they downloaded. Files are stored once, git-style, so unchanged files cost nothing across versions. A file a revision removes or replaces stays downloadable to buyers for 30 days with an "Updated" notice and date, then only the latest version remains: keeping every version of every file is too much storage (owner). Deltas inside files only if measurements show they help.
- **Library label:** "Samples" becomes "One-shots"; old values fold to it.
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
- **Confirmed by the owner in Cloudflare:** the Bulk Redirect from `autostacc.pages.dev` to `autostacc.com`. Creator payouts weren't set up then; the marketplace Stripe account ("AutoStacc Payments") got its own key and webhook on 2026-10-11 ([payouts-setup](payouts-setup.md)).

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

## 2026-10-10: The engine reads storage through its Worker, with no keys

On Cloudflare, a Container with internet switched off can reach an allowed host over HTTPS only if its traffic is decrypted and re-sent by the Worker anyway. So instead of giving the engine an R2 API token, the engine Worker answers a private address (`http://storage.engine`) from its own R2 binding: reads of the allowed bucket only, one byte range at a time. The Container has no internet, no credentials and no D1 access, and the two R2 secrets (`ENGINE_R2_*`) are no longer needed; the deploy removes them from the Worker. Writes of stored originals (Phase 3) will go the same way. How it works: [engine](engine.md).

## 2026-10-10: Suggestions from names and headers are a separate engine step

Classification (`engine/src/naming.rs`, `classify.rs`) runs over the engine's own answer plus a vocabulary the server sends with each job, so the taxonomy lives in one place (`server/discovery/vocabulary.js`) and the step can be switched off or replaced without touching archive checks. Every value is a suggestion with its origin (filename, folder name, written in the file, or a rule), a confidence and its reasons; nothing inferred is shown as verified, and a creator's own value always wins. Two choices to avoid false positives: a key needs a mode ("Am", "C# minor"; a bare "A" is too often something else), and a bare number counts as a tempo only for loops and MIDI ("Kick 01" isn't 1 bpm, "Bass Loop 140" is 140). A loop's tempo is checked against its length (whole 4/4 bars). The confidences are starting values, calibrated later on labelled packs (Phase 8). The engine is 0.2.0; the contract stays v1 (the new fields are optional).

## 2026-10-10: How Phase 3 stores, publishes and downloads pack files

Reviewed before building (architect review), so the first end-to-end slice keeps its tables owned and its trust boundaries tight:

- **One pass, written by the engine, hashed by the Worker.** The engine streams each accepted file once, as it checks it, to `blobs/<owner>/<job>/<n>` through its Worker. The Worker accepts writes only under the running job's own prefix, never overwrites, requires the length up front, and computes each file's SHA-256 itself; the import trusts the Worker's hash, not the engine's. Duplicates are found afterwards (one stored original per owner and SHA-256) and the extra copy is deleted. Two passes would double the decompression, and Container time is the scarce part of the $5 plan.
- **Owners of the new tables:** `server/blobs/` (stored originals, retention), `server/usage/` (monthly meters), `server/packs/` (versions, uploads, processing, import, publish); `server/files/` still owns `product_files`, and publishing writes it through `files/`. R2 multipart lives in `server/storage/buckets.js` with the rest of R2.
- **File ids stay stable.** Publishing keeps a file's id when its bytes didn't change, retires a replaced or removed file (still downloadable for 30 days), and adds new rows. Rows backed by a stored original carry a placeholder `r2_key` (`blob/<file id>`, keeping that column unique without rebuilding the table); the real key is looked up in one place.
- **The engine Worker gets no database.** It brokers an untrusted Container, so its bindings stay minimal. Its cron asks an internal store route (signed, 404 otherwise) to run the retention sweep.
- **Phase 3 uploads the whole ZIP** (resumable multipart, parts streamed, never buffered); uploading each file with its hash, which skips unchanged files in revisions, follows with revisions (Phase 6).

## 2026-10-10: Phase 3 review fixes

The security and backend reviews of Phase 3 found one trust gap and several correctness gaps, all fixed with tests: the store now decides every stored key itself (an engine's claim must match it exactly), each `process` job runs in a freshly started Container, retired files follow the 30-day earlier-buyers rule everywhere, a Pac's files go to every product that sells it, no version can stay stuck in processing, and conditional D1 batches use a dedicated `batch_guard` table instead of breaking another table's rule. The retention sweep is the next piece.

## 2026-10-10: How a file's values are decided (Phase 4)

One resolver (`js/pack-resolve.js`), the same code in the Control Center and on the server, decides each file's kind, instrument, tempo, key and MIDI role: the creator's own value; else the nearest folder's default; else a suggestion the creator accepted, or one the engine is at least 85% sure of that nobody rejected; else nothing. An empty creator value means "none" and stops inheritance. Defaults are resolved when read, never copied onto files, so moving a file changes only what it inherits, and the review shows those changes before the move. 85% is a starting threshold, to be calibrated with the other confidences (Phase 8).

## 2026-10-10: How the automated review decides (Phase 5)

Following the owner's decision that only flagged versions wait for an admin, the review is a fixed set of flags computed by the server from the engine's answer and its own checks (`server/packs/review.js`), stored with the version. Hard flags (unsafe or damaged entries, files whose contents don't match their names, password-protected files, programs or scripts) always hold the version; soft flags (types AutoStacc doesn't deliver, archives inside the pack, over half the files in unknown formats, every file already stored by this creator, a revision removing over 25% of the live files or over half the bytes) hold it unless the creator is trusted. An admin can set a creator to "always hold". The thresholds are starting values, to be revisited with real uploads. What automation can't judge (rights to the sounds, their quality) stays with reports and spot checks. The admin's approval of a held version is an audited override; a rejection carries a note the creator sees and deletes the upload.

Storage is reserved when an upload starts (the ZIP's size against the creator's quota, in the same statement that records it), so concurrent uploads can't pass the quota; what counts is the creator's live files plus, for unfinished versions, the archive or, once checked, the unpacked files if larger (a ZIP can compress a lot, so the unpacked size is checked again before anything is stored). A file's extension can't be renamed after the review (the review judged that type). Admin and Studio share every Pack Builder handler through two scopes (`server/packs/access.js`) rather than two copies, so a fix to one is a fix to both.

## 2026-10-10: Product Studio, one workspace per product, in a shell shared with the Control Center

The owner sent an architecture outline for a "Project Studio" and answered four questions. Built as [studio](studio.md) describes. Choices:
- **The unit is a product, not a project.** In AutoStacc a project is a creative identity holding many products, while the outline's studio manages one sellable thing (one pack, one store page, one price). Project-level work stays on the Creator Dashboard (`/studio`).
- **Names use the Stacc vocabulary:** Overview, Pac Builder, Store Page, Pricing, Insights, Release (Team later). They are working names, kept in `data/workspaces.js` so a rename is one edit.
- **One shell, two versions.** `js/workspace.js` draws the sidebar, compact header and phone drawer for both the Product Studio and the Control Center, so the admin isn't a separate design.
- **No copies of product data.** A creator's sale is an ordinary `promotions` sale scoped to one product (`creator_id` set), so the cart, checkout, search and order history already price it. The store page's "included content" is counted from the published files. One readiness check guards publishing on the server and feeds the Overview and Release sections.
- **The Pac Builder section reuses Phase 5** (built in parallel and merged first): the same `/api/studio/packs` routes, automated review and the admin's review queue. The Product Studio only gives it a place in the workspace.
- **Collaboration (Team) is not built.** Roles and revenue splits are open questions in the vision.
- **Insights collects nothing new:** orders, refunds, downloads and the existing per-day view counters. Traffic sources are shown as not tracked.

## 2026-10-13: How a revision is matched (Phase 6)

A new version is matched to the live one when it's imported, by hash first and never by name alone (same bytes in the same place: unchanged; same bytes elsewhere: moved; new bytes at a live file's path: replaced; the rest new or removed). The plan put this `diff` in the Rust engine; it is plain JavaScript instead (`js/pack-diff.js`), because it needs the live version from the database, takes milliseconds for thousands of files, and the same file runs in the browser for a preview, like the resolver. A file's values belong to its asset, not to a version: a matched file keeps them, so a creator never re-enters them, and edits made while reviewing a draft are the asset's (customers only ever see what a published version snapshot). A replaced file keeps its values too and is shown first, tagged, so they can be checked against the new bytes.

## 2026-10-13: A revision uploads a thin ZIP of what changed (Phase 6)

The plan said the browser would upload each file separately. It uploads one thin ZIP instead: the entries the store doesn't have, copied byte for byte from the creator's archive, plus a list of the files it left out (path and SHA-256). That keeps one way in for the engine (the same `process` job, contract and Container run, resumable multipart upload) instead of a second contract for loose files, and the Container still checks every new byte. The server trusts nothing in the list: paths pass the engine's rules, hashes must be the owner's own checked originals, and a file can't change type by being carried. The store only ever answers "which of these do I have" about the asking owner's own files, so it says nothing about anyone else's.

## 2026-10-13: Deltas inside files: measured; recommendation not to build (owner to confirm)

The owner asked for deltas inside a file only if measurements show real savings. `node test/bench/delta-bench.js` (an 8 s, 24-bit stereo WAV, 2 MB) measured how much of a revised file a delta store could reuse from the old one:

| Edit | 64 KiB blocks | Content-defined chunks |
| --- | --- | --- |
| New tag text, or a tag added | 0% | 99% |
| Trimmed 10 ms at the start | 0% | 99% |
| Fade-out on the last 0.5 s | 93% | 92% |
| Half a second added at the end | 90% | 92% |
| Gain −1 dB, normalize (every sample changes) | 0% | 0% |
| Re-rendered from the project | 0% | 0% |

Savings are real only for tag edits and trims with content-defined chunking; re-exports, normalizing and re-renders, the usual reasons a sample changes, save nothing. A replaced file's old bytes are kept only 30 days (owner's decision), so any saving is temporary, while a chunk store would change how every original is stored and delivered (files assembled from chunks instead of streamed byte for byte from one object, more storage operations). **Recommendation: don't build deltas**; whole-file dedup by SHA-256 (built) already covers unchanged, moved and renamed files. This is the owner's call; until they confirm, nothing is built either way.

## 2026-10-13: Personal collections and tags point at item keys (Phase 6b)

The plan had collection items and tags reference asset ids, so they survive revisions. Files sold before the Pack Builder have no asset, so an item key is the file's asset when it has one and its file id otherwise; both are shown to the person anyway. Every add is checked against what the person can download at that moment, and a file that stops being theirs is counted, never listed, so the feature can't reveal or keep anything they don't own. It is a feature switch of its own (`library.collections`): Your Stacc and every download work the same without it.

## 2026-10-13: The store learns from what packs contain (Phase 7)

A product's store details now come from two places kept apart in `product_facets`: what its creator (or the catalog) chose, and what its published files contain (`origin = 'derived'`, worked out at each publish from the files' published details). The creator's always win and are the only ones the Studio form shows; derived values only add. Instrument, sample rate and bit depth exist only as derived facets, so they can't be claimed by hand. The plan kept the totals in `products.metadata.contents`; they live in their own table, `product_contents`, because the catalog sync rewrites a catalog product's `metadata` on every deploy. Search with 3,000 products stayed within a few percent of its timing before the change (the plan allowed ±20%). Each switch (`store.derivedFacets`, `product.contentsTree`) turns its part off without affecting the rest.

## 2026-10-14: What the engine hears is a suggestion, never a claim (Phase 8)

Audio analysis (tempo, key, waveform) runs natively in the one processing job, not as a separate later stage as the plan had it: it bounds itself to 30 s of each file and adds about 4 s per GB, which didn't justify a second job, queue message and Container start. Its values are origin `analysis` and weigh at most 0.8 (`ANALYSIS_MAX`), under the store's auto-accept (0.85), so nothing only heard ever counts until the creator or an admin accepts it, and against a value a name, folder or header gives it weighs half: it can question what the creator wrote, never replace it. The threshold stays where the plan put it because the labelled set (183 synthetic files, [engine](engine.md#analysis-phase-8-2026-10-14)) shows the misses are exactly the ones a person catches at a glance (half or double time, the relative key) and synthetic material can't stand in for real packs; raising it to auto-accept needs a labelled set of real packs first. Silent and undecodable audio are warnings, never refusals; the automated review holds a version (soft) when they are over a quarter of the audio heard and at least four files were heard. The release engine now unwinds on panic so a crafted file that crashes a decoder becomes a warning, not a dead Container (found by the security review). The waveform peaks are stored with the original's facts (measured from its bytes) and in the published details. Switch: `packs.analysis`. Engine 0.3.0; contract v1 gains the optional `analysis` field and job `analyze`, so older answers stay valid.

## 2026-10-14: The budget guard is built (Phase 9)

The cost rules decided on 2026-10-10 (alert at 80%, pause at 95%, owner override, 9 GB storage cap) were planned in Phase 0 but never built; they are now (`server/usage/`, [packs](packs.md)). Choices made building them: Container time is metered from each job's recorded time plus 20 s per attempt (cold start and `sleepAfter`), since Cloudflare's usage can't be read without Account Analytics access; meters are counted inside the batch that finishes a job or upload, so nothing counts twice; waiting jobs are sent by the daily sweep three at a time, oldest first, so a month's backlog doesn't time out queued behind itself; the cap counts every stored object once (originals, other delivered files, archives in flight, creators' images) and holds only creators' uploads, never AutoStacc's own. The guard is soft (two requests at once can both pass at 94%); Cloudflare's billing notification stays the backstop and is an owner step.

## 2026-10-14: Phase 9 choices: deflate variants, older files, originals, removed files

- **Deflate variants are made by the store's daily sweep, not the engine** as the plan had it: the files are small (≤8 MB), the work is a built-in CompressionStream plus a re-hash, and a Container job per file would cost more of the free allowance than it saves. Off by default (`downloads.deflate`, turned on with `FEATURES_ON`), as the plan said, until downloads show a need.
- **Older files are hashed, not imported as stored originals** (the plan's "legacy import job"): the sweep records SHA-256 and CRC-32 in `product_files.meta`, which lets them join ZIP downloads, while their storage and deletion rules stay as they were. Turning them into stored originals would hand their deletion to the originals' sweep, a risk to files buyers rely on, for no benefit customers see.
- **Removed single files' bytes are deleted a day later** (`server/files/retention.js`), where before they stayed in R2 forever ("by design", with a reconciliation job planned). The budget guard's review showed keeping them let a creator fill AutoStacc's storage by deleting and uploading again; they now count against the creator's quota until deleted. Rows stay, for orders and the audit trail.
- **Creators download their originals** from any checked version of their Pac, one file or a ZIP (vision §10). Full creator export (metadata, records) stays open in the vision.

## 2026-10-15: A Pac is built one thing at a time; single files are checked like packs (owner)

The owner asked for a small system that lets a creator build a whole Pac one thing at a time, and answered:
- **Who sees a Pac's view:** the creator, as a file manager in the Studio (add files into a folder, make folders, rename, move and remove, edit each file's details, then publish), and customers in Your Stacc (the Pac's folders as a tree, with its read me and previews).
- **Single files:** checked automatically by the engine like packs; a clean one goes live, only a flagged one waits for an admin (settles that question in #111).
- **Read me:** both, text written in the Studio that ships in the Pac as a file, or any document the creator uploads.
- **Previews:** 0 to 3 per Pac that customers can play, each either an uploaded clip or picked from the Pac's own audio files and cut short.
How it's built: [packs](packs.md).

## 2026-10-15: CI runs each check once (owner: about 200 Actions minutes left this month)

The repository is private, so every job counts against the monthly Actions minutes, rounded up to a whole minute per job. A PR and its merge cost about 40–60 minutes, because the merge re-ran everything the PR had just passed, and weekly fuzzing about 30 minutes a week. Now:
- **Checks run on pull requests only.** Store tests, SEO and site checks, and the engine's checks don't run again on the push to `main` that merges a PR. The deploy still runs the build check, the SEO tests and the unit tests before publishing, and the engine's merge only deploys.
- **A newer push to a PR cancels the run it replaces.** The engine workflow no longer runs a second time for branch pushes alongside the PR.
- **The SEO and docs checks share one job.**
- **Fuzzing is monthly**, with cargo-fuzz cached; longer runs happen locally.
- **Files that already passed aren't tested again** (owner, same day: "avoid running the tests multiple times when possible"). Each check job fingerprints the files it reads, by content: everything but notes for the store suites, the site and its checker for the browser checks, and the engine's own paths for the engine. Once green, it leaves a small marker under that fingerprint in the Actions cache. A later push with the same files skips the job, as do a push that changes only notes and a re-run. A marker only says "passed"; nothing is restored from it, and any change to a file the job reads, the workflow included, tests again. Markers live in a PR's own branch scope and expire after a week unused.
- **Trade-off:** if `main` moves between a PR's checks and its merge, the merged result isn't tested as a whole; the deploy's checks and requiring PRs to be up to date before merging cover most of that.

## 2026-10-15: One drop zone; everything opens in the builder (owner)

The owner asked for the upload to be one thing, easy and visual: drop one file or a whole pack in the same place, and AutoStacc sets it up in the visual builder. Answers:
- **One drop zone** replaces both the ZIP form and the Product Studio's "Add a file", in the Studio and the Control Center (`js/pac-drop.js`), and dropping takes you to the builder.
- **Everything opens in the builder** and waits for Publish, a single file too. This replaces the earlier answer that a clean single file goes live at once (the entry above, and #111).
- **A whole Pac (a ZIP or a folder) onto a Pac with files:** ask each time, "Replace the Pac with this" or "Add these files". Replacing makes a new version from the drop alone; its files are matched to the live ones by their bytes, so unchanged files stay the same files for buyers, and the automated review sees the change as any revision. A ZIP that becomes the whole Pac goes up as a version through the existing upload (listed in the browser first; on a revision only changed files upload), a folder through an empty draft.
- **Limits (2026-10-15, after review):** one file in a Pac is at most 4 GB until bigger files are tested end to end (the engine reads up to 20 GB); the browser checks that and the 2,000-file limit before uploading, and warns (doesn't refuse) when a drop looks bigger than the creator's free storage, since files already stored count once.
- **Visual:** file cards with a kind icon, waveform and badges (format, tempo, key, length, sample rate), a play button on audio, and drag and drop in the tree (files and folders onto a folder; files from the computer onto a folder add them there). Move buttons do the same from the keyboard.

## 2026-10-15: Hardening before the repository goes public (owner)

The owner will make the repository public (free CodeQL, unlimited Actions minutes on standard runners) and asked to raise security first. A full review found no exploitable bug in the site or store: nothing depends on the code being secret. The risks of going public are about process, so:
- **Published, not licensed:** `LICENSE` keeps all rights reserved; `SECURITY.md` asks for private reports through GitHub's Security tab.
- **Scanning:** CodeQL on pull requests and weekly, Dependabot monthly and grouped; `npm audit` and `cargo audit` clean on this date.
- **Secrets in CI:** the deploy jobs use the `production` Environment (secrets can move there, limited to `main`); dependency install scripts never see the tokens; the step that listed the Cloudflare token's permissions is gone; mail failures in deploy logs blank any address; fuzz crashes are uploaded only while private.
- **Untrusted text:** the `tasks` skill acts only on the owner's and collaborators' issues and comments; fork pull requests are never run by a Claude session. `.github/CODEOWNERS` covers CI, the store API, the engine, scripts and Claude's instructions.
- **Left to the owner's GitHub settings** (they can't be set from the repository): approval for fork PR workflows, a `main` ruleset (PR, code-owner review, no force push), secret scanning with push protection, private vulnerability reporting, Dependabot alerts, the `production` Environment, deleting old Actions runs and artifacts, and a private commit email. The admin login should be an address that isn't in the public commit history.

## 2026-10-15: Private reports and private work, once the repository is public (owner)

The owner asked for a way to keep information and bugs private, "so that it's harder to spoof the server and so they don't always know how things run". The code itself will be public, and the store doesn't depend on it being secret (see the entry above). What can and should stay private is everything around the code:
- **Security problems:** reported and fixed through GitHub's private security advisories. `SECURITY.md` and the issue forms point there, and the forms warn that issues are public. Fix PRs say what changes, not how it could be abused, and the advisory is published after the deploy.
- **Other private work** (operational notes, incidents, owner-only decisions, bugs that reveal how the live setup runs): issues in a private repository, `Kmandevr/AutoStacc-private`, which the owner creates (a Claude session can't). The `tasks` skill says what goes where.
- **Logs:** Actions logs are public too. The deploy no longer prints the database's id, and reports failed emails only as a count by kind. The reasons are read with a query run on the owner's computer (`docs/store-setup.md`).
- **Not hidden:** how the code works. Hiding it would add little, because every check runs on the server and secrets live only in GitHub and Cloudflare settings. It would also cost the free code scanning and CI minutes the public repository brings.

## 2026-10-15: Retired files count against storage; pausing closes open checkouts; the docs reminder is on (owner)

The owner approved closing three gaps the pre-public review named:
- **Storage:** files a Pac revision replaced or removed stay downloadable for buyers for 30 days. They now count against the creator's file storage for that time too (`server/creators/storage.js`), so a creator can't stack revisions to hold more than the quota (#111).
- **Creator purchases switch:** pausing now also closes the payment pages already open for creators' products. Each is expired at Stripe, and its order is cancelled. Before, a page opened before the pause could still be paid until it expired (#107). A page Stripe won't close, because it was just paid, is left to its webhook.
- **Docs reminder:** `.claude/hooks/docs-reminder.sh` is registered as the `Stop` hook, so a session is asked to check stale notes before it finishes. CI's `--strict` check is the backstop.

## 2026-10-15: Two-step sign-in for admins, built but switched off (owner)

The owner asked for two-step sign-in on admin accounts: "Set it up but don't enable it" (they don't have an authenticator app yet). Built on Better Auth's own `twoFactor` plugin rather than our own code (the rule: no session or token crypto of ours): TOTP codes from an authenticator app plus ten one-time backup codes; no email or SMS codes (a mailbox is what a stolen password usually comes with, and there's no SMS provider). Behind the feature switch `auth.adminTwoFactor`, off by default: off, the plugin isn't loaded at all, so sign-in and every route are exactly as before. Only admins can set it up, and nobody is forced to. The key is shown as text and an `otpauth://` link, not a QR code, because no QR library is a dependency and the key must not go to an outside QR service. Switching off needs the password and a code. To switch on: `FEATURES_ON=auth.adminTwoFactor` in the deployment (production's `[env.production.vars]` in `wrangler.toml`), then enrol in Settings › Security ([store-setup](store-setup.md#switching-on-two-step-sign-in)). Switching the feature off again turns the code step off for everyone who enrolled (the escape hatch if every code is lost), and back on restores it.

## 2026-10-15: Commit history rewritten to drop the owner's email (owner)

Before going public, the owner asked for the old commits to stop showing their personal address. `main` was rewritten with `git filter-branch` (author and committer email replaced by the GitHub no-reply address `177585597+Kmandevr@users.noreply.github.com`; the file contents of every commit are unchanged, and there are still 365 commits) and force-pushed. Consequences:
- Commit ids on `main` changed: older clones must be re-cloned or reset, and links to old commit ids no longer resolve on `main`.
- GitHub's "Verified" mark on its own merge commits is gone.
- Old branches and the stored copies of past pull requests still hold the old commits. The owner deletes the branches on GitHub, which a Claude session can't do (403), and asks GitHub Support to purge the pull request copies before the repository goes public.
- New commits stay private through GitHub's "Keep my email address private" and "Block command line pushes that expose my email" settings.

## 2026-10-15: No private tracker (owner)

The owner decided not to create the private repository `Kmandevr/AutoStacc-private` planned in the entry on private reports above. Security problems still go to private security advisories. Other private work (operational notes, incidents, owner-only decisions) is told to the owner in the session and never written into the public repository (the `tasks` skill, "What stays private").

## 2026-10-16: Guides and community forum planned (owner)

The owner set the next step as a support wiki and a community page, and chose: a guide written only by AutoStacc at `/guide` (with a full creator manual) beside the quick answers in `/help`, rather than a wiki users can edit or support tickets, because users can talk in the forum instead and static pages stay cheap and safe. For community, on-site discussions rather than a read-only hub or comments on releases. It is platform-wide at `/community`, with a space each project can turn on, and no outside community. Accounts with a confirmed email post, and anyone can read. Creator teams moderate their own space and AutoStacc moderates everywhere. Posts are text and links only, no uploads. Threads are public and indexed. The forum stays behind a switch until reporting, blocking and moderation are built, as [vision](vision.md) §8 requires. Plans: [guides](guides.md), [community](community.md). Nothing is built yet.

Same day, the owner widened it ("like Reddit but less of a do-what-you-want"). Besides AutoStacc's space and project spaces, there are communities any verified account can start straight away, without being a creator. Every space has channels. Creators' updates and polls are post types in their space, so Studio creators get news and polls too: polls are posted by creators and community moderators, not members. Communities about a creator are allowed but marked Unofficial. AutoStacc's base rules (nothing illegal, no threats, harassment and the like) apply everywhere and can't be loosened. Each space may add stricter rules, which its own team enforces, while AutoStacc enforces the base rules and handles appeals. The reason: communities can grow without creators, while the platform keeps one floor of rules. Guardrails against squatting and spam are proposed in [community](community.md) for the owner to confirm.

Later the same day, asked one question at a time, the owner added a place to ask questions, get answers and have fun, plus ways to show off an account and connect:
- **Q&A:** a Question post type in spaces plus a central Q&A page, accepted answers, and Helpful votes (up only).
- **Votes and ranking:** thread upvotes, no downvotes, because bad posts are handled by reports.
- **Fun:** challenges (hosted by creators and moderators, who choose audio uploads, links or both, and how to judge; prizes are store items only), Show your Stacc, games and events, badges and streaks.
- **Profiles:** Steam-style profiles with points earned from purchases, badges, helping and taking part, spent on profile items creators make. Creators get about half the points spent on their items. Points never have money value. Item files over a set size count toward the creator's storage cap.
- **Connecting:** friends, a friends-only feed and collab requests; no direct messages.
- **Age:** 16+, self-declared, with no verification system.
- **Accounts:** deleted accounts' posts stay as "deleted user", and a founder's community passes to a moderator.
- **Notifications:** emails for answers, replies, updates, friends and collabs, each configurable.
- **News:** first-party news moves to Updates, keeping its addresses.
- **Communities:** a cap of 3 per account that AutoStacc can adjust (creator and project spaces don't count), name checks, and abandoned communities handed over.

Plans: [community](community.md), [profiles](profiles.md).

Then legal and security, again one question at a time. The owner will settle the operator's legal setup (tracked privately) before the community goes live and register a DMCA agent at a registered-agent address, not their home. The community is open worldwide, meeting UK and EU duties. Copyright strikes are tiered and expire after 12 months: 1 is a warning, 2 pauses selling (it can be restored), 3 leaves text posting only, and buying and using purchases is never taken away. Uploaded images go through Cloudflare's CSAM scanning. Regular users upload an avatar only. Challenges are free to enter and judged on skill, with rules against vote rigging. Turnstile guards risky actions. Two-step sign-in is optional for moderators, offset by logged, reversible and rate-limited moderator actions. Removed content is kept for 12 months. Data goes out only for valid legal process. Urgent danger reports filter false ones by reporter trust, a required reason, several reporters and keyword triage. A lawyer review comes later, not as a launch gate; the legal setup, DMCA agent and CSAM scanning are gates. Details: [community safety](community-safety.md).

Finally, the owner narrowed the community and AutoStacc's role so as few laws apply as possible. The scope is music and sound plus ideas and thoughts about products, not a general social site, kept welcoming to newcomers (a guideline, not a base rule). Space owners are accountable for moderation. AutoStacc does only the legal minimum (illegal-content notices, copyright, CSAM, impersonation) plus automatic help (spam filters, rate limits, auto-hiding posts with several reports, crisis resources). Danger reports go to the space team, not the owner's email. A space turns read-only by itself after 40 days with no team activity or with unhandled reports. Posting stays open worldwide. This replaces the earlier plan in which AutoStacc handled base-rule reports, appeals and moderator abuse.

## 2026-10-16: Paid creator storage is built and off; a refund is recorded before tax (Claude)

The task asked for creator storage billing on top of the existing quotas, without enabling a price that isn't approved. Built ([creators](creators.md#paid-storage-built-2026-10-16-off)), off. Choices made by Claude first, then the owner's answers (below):
- **Usage, not the limit, is charged.** The limit only stops uploads, so changing it needs no proration and can't cost more than what is stored.
- **Measured once a day; monthly statements paid on a Stripe page**, on the main account (AutoStacc's own service), instead of Stripe Billing subscriptions: the server stays the only source of the figures, and the existing webhook, event-once and compare-and-set code covers it. Automatic card charges can come later.
- **Overdue pauses the paid limit and nothing else.** Files are never deleted or hidden for billing.
- **Cancelling keeps charging above the allowance until it's back under**, so storage can't be filled under a plan and kept free.
- **Each stored original counts once.** This fixed a double count of files two products share (or re-added with the same bytes), and rejected Pac files' originals now count (they were stored but counted nowhere).

Owner's answers the same day: the rate is **$0.05 per GB a month**; the owner switches billing on in the Control Center; a creator sets **a monthly cap in dollars**, which buys the upload limit at the rate; storage above a lowered cap (or after cancelling) **keeps being charged until it's back under**, with a Studio notice linking to support; statements are settled **from earnings ready to pay out first, then by card** for the rest; long-unpaid statements **only pause uploads**; the Stripe account was left to Claude (the main one: AutoStacc's own service, existing webhook and tax setup). After a security review: a payment on an earlier page is matched by the statement id it carries (it was refused, so a creator could pay twice), a chargeback makes the statement unpaid and pauses the limit until won, two clicks can't close each other's page, and the overdue step can't override a payment that lands at the same moment.

Also fixed (#129, taxed orders): Stripe's refund amounts include the tax Managed Payments adds on top of the order, so `refunded_cents` could exceed the order total and a partial refund cut the creator's share too far. Refunds are now scaled back to the order's own (pre-tax) money and never exceed its total (`preTaxRefund`, `server/payments/events.js`). The refund email names the same amount.

## 2026-10-16: Reviews from confirmed buyers: stars and optional text (owner)

The owner chose stars (1 to 5) with an optional short text for #96. Built (`server/reviews/`): one review per account and product, editable; only an account that owns the product right now can write one, and a review shows only while its author still owns it (read from entitlements at show time), so a refund or revoked grant takes it off without deleting it. Shown as "Verified buyer", never with a name or email. AutoStacc hides reviews with a note (audited); creators have no way to change them. In the data download, deleted with the account; `/privacy` and `/terms` updated. Then (same day) ratings joined the store: a "Top rated" sort and a "4 stars and up" filter, stars on cards, and half of the ranking's quality score, all from a confidence-adjusted average (prior 3.5 as if 5 reviews; Claude's choice, in `server/discovery/weights.js` `RATING`). Not built: replies from creators (not decided).

## 2026-10-16: Community foundations: rules published early, retention, report thresholds (owner)

For #135 the `architect` agent reviewed the community design. Its changes are recorded in [community](community.md#design-architect-review-2026-10-16): one `server/community/` area; a separate Pages Function for `/community` rather than the creators' catch-all; `community_mod_log` beside `admin_audit` (space teams must see and undo their own actions, while the admin audit log is admin-only); a `source` column before community polls (the catalog sync deletes other polls); per-project excludes in `scripts/dist.js` before first-party project spaces; and folding look-alike characters in display names. The owner then chose:
- **Publish the rules now**: `/community-rules`, marked "opening soon", and `/copyright`, which already applies to creators' uploads. Copyright notices go to the support address until the DMCA agent is registered.
- **Deleting an account wins** over the 12-month keeping of removed content, except for content removed for a legal reason (illegal content, copyright, CSAM).
- **Report thresholds**: a trusted reporter is an account 7+ days old with fewer than 3 dismissed reports in 90 days, and 3 trusted reports hide a post until the team decides.

Built and off: the `community.forum` switch, migration 0031, `server/community/format.js`, and `community` reserved as a project-site page address. `/privacy` lists community data in the change that first collects it.

## 2026-10-20: The community's look and words (owner)

Asked one question at a time, the owner chose a clean but charming community in the app's own theme. The community gets its own small studio vocabulary: takes (threads), New take, Boost, Hot / Fresh / Top and Best answer. It's an exception to the platform's plain-words voice, kept "a little less corny" than the first proposal, with Reply and Helpful left plain. The look: channel-strip lists with track colours, a level-meter Boost, a tiny waveform beside each name, an inline composer with a preview, and a mixer row of spaces on the front page. Four short moments of charm (boost bounce, stacking in, empty states, best-answer glow) are all off for reduced motion. Replies are fully nested rather than flat. Details: [community](community.md#look-and-words-owner-2026-10-20).

## 2026-10-20: Community features, and independent features (owner)

The owner chose the community's features (listed in [community](community.md#features-owner-2026-10-20)):
- **In posts:** music embeds, store item cards and code blocks.
- **Keeping up:** following takes, joining spaces and saving for later.
- **Notifications:** @mentions and an on-site inbox.
- **Finding:** search, tags from AutoStacc's list plus each space's extras, and similar takes while asking.
- **People and teams:** a mini profile card with Block and Report; team tools for channels and rules, pins and featured takes, a welcome message and the space's look.
- **Store links:** product takes, an opt-in buyer badge and release takes.
- **Self-promotion:** never in answers to questions or in question channels, and a team can switch it off per channel or for the whole space.
- **Posting pace:** slow mode chosen by each space, about 3 posts a minute site-wide, duplicates refused, and daily caps only as a high safety net.

The owner also set a design rule: "no system is reliant on another, so a major change needs no big rewrite". The community is built as a small core plus independent features, each with its own switch, tables, routes, scripts, styles and tests. They plug in only through the core's events, page slots, formatter extensions and pre-write checks, and never import each other ([community](community.md#built-as-independent-features-owner-2026-10-20)).

Later the same day, the owner added rules for links and automatic moderation:
- **Links to AutoStacc pages** are welcome anywhere and show as preview cards. Product pages are the exception and follow the self-promotion rule.
- **Links to other sites** pass when the site is on AutoStacc's safe list or the space's own allowed list; are always refused when on the site-wide ban list (adult, auto-download, malware); and otherwise wait for the space's moderators.
- **Automatic moderation:** every space gets word and phrase filters (with AutoStacc's slur list always on), new-account rules, link rules, and form-built pattern rules like Reddit's AutoModerator. Each is a feature of its own.

## 2026-10-20: Moderation's shared core, and the small calls inside it (#137)

Hiding, removing and restoring is needed by two features (team tools and reports), so it lives in the core (`server/community/core/moderate.js`), following the owner's rule that features never depend on each other. Calls made while building, inside the owner's decisions of 2026-10-16 and open to change: reporters are anonymous to the space's team (less retaliation); a team member's own post is never hidden automatically (an announcement can't be brigaded away; it still goes to the queue); only reports made since a post was last brought back count toward hiding it again; "abusers lose the danger option" means 2 dismissed danger reports in 90 days; dismissing a report brings back only what the automatic rule hid, never a moderator's own decision; bans name people by community name, so account ids never reach the browser; a reason is required to hide, remove, ban or refuse an appeal, since the author is told why.

## 2026-10-20: Blocks, help lines and the 40-day rule, as built (#137)

Calls made while building, inside the owner's decisions: blocking stops replies from the blocked person under your takes and posts, and folds their posts away in your own browser (the pages are shared and cached, so the server can't hide them per person); the blocked person isn't notified (a refused reply does show them they can't reply there), the space's team is never stopped from replying in its own space, and Boost and Helpful aren't blocked. The crisis note shows under the post for everyone reading it, never hides or flags it, and uses the same word list as the report triage (`server/community/core/wording.js`). The 40-day rule runs in the existing daily sweep, never for AutoStacc's own space, emails the founder (or a project's owners) once, and the team reopens the space itself once no report has waited 40 days. Retention clears text 12 months after removal (a new `removed_at`), after which a removal can't be undone; legal removals, and reports routed to AutoStacc, wait for AutoStacc's legal tools.

## 2026-10-20: Copyright strikes: who gets them, and how notices arrive (owner)

Asked while building #137's last part. **Who gets a strike:** both the account that uploaded the infringing thing and the creator space it was uploaded for, "but much more lenient towards the owner of the space, so long as they aren't the one causing the infringement" (owner, same day: each strike a member gets counts as **half a strike for the creator space**, so two member strikes make one space strike; the owner's own account isn't touched unless they uploaded it). **How notices arrive:** a public form on `/copyright`, landing in the Control Center for an admin to accept or reject (rather than admins entering emailed notices by hand). Recorded in [community safety](community-safety.md#copyright-tiered-strikes).

## 2026-10-20: Copyright strikes, the details (owner) and the build plan

The owner's answers: the space owner's own upload gives the space a **full** strike (not half); a member's account at **2 strikes** stops only that person publishing or pricing products, in any creator space (the spaces keep selling what's live, judged by their own count); while a space's selling is paused, its **free claims and Auto-Stacc grants pause too** (what's already claimed stays); a file removed by a valid notice **can't be downloaded by anyone**, past buyers included (they keep the rest of the product and can get a refund for it).

Build plan (architect review): a new area `server/copyright/` outside the community (`notices.js`, `strikes.js`, `standing.js` with `accountLevel` and `creatorsSellingPaused`, `targets.js` as the one registry that calls each owning module's own remove and restore, `routes.js`, `sweep.js`), levels computed when asked so expiry needs no sweep, never writing `products.sales_paused` (the creator's own switch). Steps, each leaving checkout, downloads and ownership rules untouched: (1) migration, admin-entered notices, strikes, standing, the cart and checkout hold for paused spaces; (2) the public notice form with rate limits and `/privacy`; (3) removal and restore per target with a core `legalRestore`, counter-notices and the restore sweep; (4) the level-3 gate on Studio writes and the community's link check. Later: stripping links from older posts, Turnstile, an `uploaded_by` column on product files.
