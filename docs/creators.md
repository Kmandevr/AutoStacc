---
title: Creators and the Studio
summary: Creators own projects; addresses /<creator>/<project>; the Studio's free no-code sites (blocks, themes, images) and selling, how they stay safe and cheap, and the store foundations under them (seller per order line, fees, file lifecycle, quotas, connected accounts).
covers: [data/creators.js, server/creators/, server/studio/, server/sites/, server/revenue/, server/files/, server/integrations/providers.js, server/lib/slugs.js, functions/[[path]].js, functions/media/sites/, functions/studio.js, studio.html, js/studio*.js, js/product-page.js, css/studio.css, css/creator-site.css, scripts/dist.js, scripts/lib/creator-page.js, db/migrations/0006_creators.sql, db/migrations/0009_creator_selling.sql, db/migrations/0011_marketplace_payouts.sql]
updated: 2026-10-10
---

# Creators and the Studio

**A creator owns projects. A project has a page at `autostacc.com/<creator>/<project>`. Any account can become a creator for free and build its projects' pages in the Studio, without code.** AutoStacc itself is the first creator (`autostacc`), and Glitches & Stitches is its project at `/autostacc/glitches-and-stitches`. Decisions: [decisions](decisions.md). Model: [architecture](architecture.md).

## Addresses

| Address | What |
| --- | --- |
| `/<creator>` | the creator's profile: its published projects |
| `/<creator>/<project>` | the project's home page |
| `/<creator>/<project>/<page>` | another page of the project (`/events`, `/about`, ...); `/home` redirects to the project's home |

- **Names are unique.** A creator name is unique across AutoStacc and a project name is unique within its creator. Both are stored lowercase, so case never makes a second name; mixed-case addresses redirect to lowercase. A name is 3 to 40 lowercase letters, digits and single hyphens.
- **Platform words are reserved** (`server/lib/slugs.js`: `shop`, `studio`, `admin`, `autostacc`, ...). A unit test fails if a top-level page, folder or Function of the site isn't reserved, so a new platform page can't be taken by a creator first. First-party creators in `data/creators.js` may use a reserved name (`firstParty: true`).
- **Nobody can pose as a first-party project.** A creator can't take the address or the display name of a first-party creator or project ("Glitches and Stitches", any case or punctuation).
- **Renames redirect.** Renaming a creator or project 301s the old address to the new one for 90 days. The old name stays held for that creator, so nobody else can grab it to impersonate them (`slug_holds`). Published pages are rendered again with the new address. At most 3 names are held per creator or project, so renames can't be used to squat names.
- **Adding a first-party creator:** add its id to `RESERVED` and deploy that first, then add it to `data/creators.js`. The build refuses a first-party creator whose id isn't reserved; otherwise a Studio account could take the name in between and the deploy's sync would stop on the clash.

## Two kinds of creators, one model

- **First-party** (`data/creators.js`, today only `autostacc`). Their projects' pages are hand-written in this repo (`<creator>/<project>.html`, `<creator>/<project>/`, a skin, sounds, scripts), the build generates the creator's profile (`<creator>.html`), and all of it is static. The deploy's catalog sync writes their rows (`source = 'catalog'`) and never touches anything else.
- **Studio creators** sign up in `/studio`. They exist only in the database (`source = 'studio'`), and their pages are rendered by the store (`server/sites/`) and served by the catch-all Function `functions/[[path]].js`.

Both live in D1 `creators`. Projects point at their creator (`projects.creator_id`), products at their project, and order lines at both. Creator-made products are `products.source = 'studio'` rows in the same tables (`created_by` records who made them); their store page is `/product?p=<id>` (`js/product-page.js`: who made it, tags, preview clip, Add to cart, Get it free, or STACC'D when already in Your Stacc), while first-party products keep `/shop/<id>`. They are listed in the store with AutoStacc's own: the store's search and filters (`/api/store/search`, [discovery](discovery.md)) read them from the database like any product, and the other pages' grids (`js/shop.js`) add the published Studio products from `/api/products`. The API marks each with `source`, `projectName`, `creator`, `projectPath` and `verified` (false until AutoStacc marks the creator **trusted** in the Control Center); cards and the product page then show an **Unverified creator** label, and the product page says AutoStacc hasn't verified the creator and checks files for type, not content (owner decision: all creators are listed, clearly marked). Creators can give a product **Store details** (genre, contents, formats, DAW, plugin, key, BPM, sample rate and bit depth, only the fields its kind has; `js/studio-details.js`), checked against the store vocabulary on the server and suggested from the product's own words but never applied for them, tag it and upload a public preview clip (`PUT`/`DELETE /api/studio/products/:id/preview`: MP3, M4A, OGG or WAV under 20 MB whose bytes match; stored as `previews/<product>-<random>.<ext>` so a replaced clip is never served from a cache, the old one deleted). Published Studio projects are listed on `/projects`, marked unverified the same way, and can be followed with Auto-Stacc (owner decision 2026-10-09, [browse](browse.md)); polls still need a feature only `data/projects.js` sets.

## The Studio (`/studio`)

Signed-in accounts with a confirmed email (the page is gated like `/dashboard`):

1. **Claim a creator name.** It's free with no plan or card, one creator per account for now.
2. **Create projects** (up to 10) and open one in the editor.
3. **Build its site.** Up to 12 pages, each a list of blocks:
   - heading, text (paragraphs, **bold**, *italic*, links), image, gallery, button link, divider
   - music or video embed (YouTube, Spotify, SoundCloud, Apple Music share links)
   - events (date, title, venue, city, optional link)
   - social links (a fixed list of networks; https profile links only)
   - products (the creator's own products in the AutoStacc store, linking to their store pages)
4. **Look:** a style preset, an accent colour and a font from a short list.
5. **Images:** upload PNG, JPEG, GIF or WebP. Delete one and the quota is freed at once.
6. **Save the draft, preview it** (private, noindex) **and publish.** Unpublish takes the site offline.
7. **Sell** (`server/studio/products.js`, `product-files.js`): products of its projects (up to 25 per creator; kinds, price range and payout hold in `SELLING`, `server/creators/policy.js`). A product goes on sale only with a deliverable file, of a type on the shared allow-list (`server/files/policy.js`, kept equal to the vocabulary's `FORMATS`). Paid files from a creator not yet trusted wait as `pending` until approved in the Control Center. A whole pack (a ZIP in folders) goes through the Pack Builder instead (**Upload a whole pack** on a product card, `js/studio-packs.js`, [packs](packs.md)): every file is checked, kinds, instruments, tempos and keys are suggested for review, and a clean version publishes at once while a flagged one waits for AutoStacc's review (the automated review, `server/packs/review.js`). Uploads count against the creator's file storage (500 MB free). Owners and editors manage products; only the owner sees earnings, connects a payout account and asks for payouts (`earnings.js`, `payout-account.js`; [payouts-setup](payouts-setup.md)).

Each product opens in its own workspace, the **Product Studio** (Overview, Pac Builder, Store Page, Pricing, Insights, Release; [studio](studio.md)); a project's Products page is a list of them with a short form for a new draft.

Code: `studio.html`, `js/studio.js` (overview), `js/studio-editor.js` (editor), `js/studio-blocks.js` (block forms), `js/studio-products.js` (a project's product list), `js/studio-workspace.js` and `js/studio-section-*.js` (the Product Studio), `js/studio-details.js` (store details), `js/studio-earnings.js` (earnings and payouts), `css/studio.css`. API: `server/studio/` (`creators.js`, `sites.js`, `products.js`, `product-files.js`, `earnings.js`, `payout-account.js`, and for the Product Studio `workspace.js`, `pricing.js`, `insights.js`, `insights-data.js`).

## How creator pages stay safe

- **No creator HTML, CSS or JavaScript.** A site is a JSON document (`server/sites/document.js` accepts only the shape above, drops unknown fields and refuses the rest with a 400 naming the place). The server writes every tag itself (`blocks.js`, `render.js`), escaping all text first. Links are only `https:`, `mailto:` or an AutoStacc page (never `/api/` or `/media/`). Off-site links get `rel="noopener noreferrer nofollow ugc"`.
- **No logins, forms or payments on creator pages.** The CSP forbids scripts, forms, frames other than the embed providers, and being framed: `default-src 'none'; script-src 'none'; form-action 'none'; frame-ancestors 'none'`. Every page carries a thin AutoStacc strip saying accounts, carts and payments only happen on AutoStacc itself. Product blocks link to the AutoStacc store, and buyers pay there.
- **Embeds are rebuilt, not pasted.** `embeds.js` parses a share link from a known provider and builds the player address from the parts it parsed. Anything else is refused.
- **Images are checked by their bytes.** The type comes from the file's first bytes, never from its name or the browser, so HTML or SVG can't pass as an image. Images are served from `/media/sites/<id>` with `nosniff`, a sandbox CSP and only while active, and never while the creator is suspended.
- **Ownership.** Only a creator's members see or change it. Anyone else gets a 404 (`requireCreator`, `requireProject`). A document may show only its creator's own images and products; anything else is left out at render time.
- **New creators aren't indexed.** Their pages are `noindex` until an admin marks the creator **trusted** in the Control Center (Creators tab), so spam can't ride on autostacc.com's reputation. Studio pages are not in `sitemap.xml` yet.
- **Suspension** (Control Center) takes a creator's pages and images offline within a minute (the edge and browser cache time), stops it from publishing and takes its products off sale (buyers keep what they own).
- **Limits hold under load.** The creator and project limits are checked inside the insert, so parallel requests can't exceed them.
- **The project directory, follows and Auto-Stacc** cover published Studio projects of active creators too (`server/projects/projects.js` `VISIBLE`); a suspended creator's projects drop out at once. Polls stay first-party.

Future custom HTML/CSS needs its own model before it's allowed: creator code runs only in a sandboxed iframe on its own origin (`sandbox.autostacc.com`, opaque-origin sandbox), never on autostacc.com where logins and checkout live. The plan: [creator pages](creator-pages.md) (PLANNED / NOT IMPLEMENTED). The block document is the extension point: a "custom section" block can be added there later without changing anything else.

## How they stay cheap

- A creator page is **not a deployment**. Publishing renders each page once into `site_pages`. A view is one indexed D1 read, cached at the edge for a minute in production (`server/sites/public.js`).
- Static pages never invoke the catch-all Function: `scripts/dist.js` writes `_routes.json` to exclude every static page and folder, first-party creators' folders and every `_redirects` source. Only unknown top-level addresses (Studio creators, typos) reach it.
- Free-plan limits live in one file (`server/creators/policy.js`): projects, pages, blocks, document size, image size and count, an image storage quota (50 MB), and for selling products per creator, files per product and a separate paid-file quota (500 MB, owner 2026-10-10; extra storage will be paid by the creator, not built). A creator's own image quota (`storage_quota_bytes`) and paid-file quota (`files_quota_bytes`) can be set in the database to replace the plan's; there is no Control Center control for the paid-file one yet. The quota is checked before an upload is stored, and again atomically when it's recorded, so parallel uploads can't squeeze past it.

## Store foundations under creators

- **Seller and split per order line** (`server/revenue/split.js`). Each line records its project, creator, share of a promo code, net, platform fee and creator share, fixed when the order is written. The fee is the creator's own (admin-set, basis points) or the platform default, **20%** (`DEFAULT_PLATFORM_FEE_BPS` in `server/creators/policy.js`; owner, 2026-10-09). Changing it only affects later orders. Refunds are recorded on the order (`refunded_cents`) and, for full refunds, on each line. The Control Center's **Creators** statistics show fees and creators' shares. Nothing is paid out automatically: a creator's earnings and payout requests read these records (`server/revenue/earnings.js`, `payouts.js`), and the owner sends each payout from the Control Center ([payouts-setup](payouts-setup.md)).
- **Paid file lifecycle** (`server/files/`). Each paid file is `pending`, `published`, `rejected` or `deleted`, and only published, active files reach customers (downloads, Your Stacc, test-purchase checks). The admin can upload a file held back ("Hold back until I publish it") and publish it later. Uploads are limited by file type, size (95 MB) and count per product (`server/files/policy.js`). Creators' paid uploads use the same path (`server/studio/product-files.js`); packs uploaded through the Pack Builder pass the automated review instead (between checked and published, [packs](packs.md)).
- **Connected accounts** (`server/integrations/providers.js`, D1 `connected_accounts`). This is the extension point for Spotify, SoundCloud, YouTube, Instagram, TikTok and so on, with no provider switched on yet. The planned flow: OAuth with PKCE, the fewest read-only scopes, tokens encrypted before storage (or not kept at all), and the creator choosing what appears on their pages.

## Not built yet (on purpose)

- Per-project staff roles, paid extra storage, and per-creator tax forms. Selling and payouts are built: [payouts-setup](payouts-setup.md).
- Custom HTML/CSS (needs a separate sandboxed origin, see above), custom domains, more than one creator per account, team members beyond the owner (the `editor` role exists but can't be granted yet), reporting a page, Studio pages in the sitemap.
- Abandoned or orphaned upload cleanup. Images are a single request (stored, then recorded; a failed record deletes the object). Deactivated paid files stay in R2 by design, and a reconciliation job can list the `products/<id>/` and `sites/<creator>/` prefixes against the database.
