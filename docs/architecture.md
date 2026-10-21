---
title: Architecture
summary: AutoStacc as a platform: projects, the Project → Stacclet → Pac → Asset hierarchy, products, Your Stacc, Auto-Stacc, polls and relationships, and where each lives in the code.
covers: [data/site.js, data/creators.js, data/projects.js, data/content-types.js, data/product-types.js, data/polls.js, data/relationships.js, scripts/lib/platform.js, scripts/lib/platform-catalog.js, scripts/lib/relations.js, db/migrations/0003_platform.sql, server/projects/, server/polls/, server/entitlements/autostacc.js, server/app.js, js/stacc-model.js, js/projects.js, js/polls.js]
updated: 2026-10-21
---

# Architecture

**AutoStacc is the platform. Projects create. Stacclets organize related Pacs. Pacs contain content. Your Stacc makes that content useful. Auto handles the repetitive work.**

AutoStacc (the business, the store, accounts, library, delivery) is the technology and commerce layer. Projects are the creators that publish on it. [Glitches & Stitches](identity.md) is the first project; nothing in the platform code names it. What the words mean and how to use them: [autostacc](autostacc.md). How to add a project: [projects](projects.md). The library: [library](library.md). The store underneath: [store](store.md).

## What existed before this layer (2026-10-07)

- Static pages built from `data/*.js` by `scripts/build.js` (heads, item pages, sitemap, `db/catalog.sql`). See [seo](seo.md).
- A complete store API in `server/` (Better Auth accounts, D1 catalog synced from data/products.js, Stripe Checkout, one verified payment pipeline, entitlements separate from orders, HMAC-signed downloads from private R2, admin, analytics), plus store discovery (search, filters, recommendations, wishlists: [discovery](discovery.md)), with unit, API-security and browser tests. See [store](store.md).
- Already reusable and kept as is: entitlements (any source grants ownership), `product-types.js` (a new kind of product is data), the catalog sync, the download pipeline and its tests.
- Single-artist assumptions: `SITE.artist` named the creator of every product and release, and the library listed products, not content.

The platform layer is built **on top** of that store. Authentication, checkout, payments, entitlements and download security are unchanged; ownership is still decided only by `entitlements`, per product.

## The model

```
AutoStacc (platform: data/site.js → SITE)
└── Creator            data/creators.js / D1   owns projects; seller of record; address /<creator> (creators.md)
    └── Project        data/projects.js        creative entity; owns identity and features; /<creator>/<project>
    ├── Release        Studio → D1 project_releases   project_id, slug, tags   (creators.md)
    ├── Event          Studio → D1 project_events     project_id, slug, tags   (was Show, #178)
    ├── News post      D1 project_news, hidden        waits for the creator's Community page (#174)
    ├── Product        Studio → D1 products           project, pacs     ← what is sold, /shop/<id>
    ├── Stacclet       Studio → D1 stacclets          project_id        ← groups related Pacs
    │   └── Pac        Studio → D1 pacs               stacclet_id       ← a folder of content
    │       └── Asset  D1 product_files        pac_id, kind                     ← one file
    ├── Poll           data/polls.js           project: <id> (project must use "polls")
    └── Relationship   data/relationships.js   "kind:id" → "kind:id" (project must use "relationships")
```

Every link is stored once, on the child, as an id. Everything else is derived: an asset's Stacclet and project come from its Pac; a product's contents come from its Pacs. Nothing is copied for a view.

| Concept | Is | Lives in | Notes |
| --- | --- | --- | --- |
| Creator | who owns projects and sells, with a team of members in roles | `data/creators.js` (first-party) or the Studio → D1 `creators`, `creator_members`, `creator_roles` | [creators](creators.md) |
| Project | creative work of a creator | `data/projects.js` (or the Studio) → D1 `projects` | `creator`; `features` lists which platform features it uses |
| Stacclet | a collection of related Pacs | D1 `stacclets` (made with a Studio product's first Pack Builder upload; data/stacclets.js retired, #176) | not a folder; never holds files directly |
| Pac | a container of content | D1 `pacs` (the Studio's Pack Builder; data/pacs.js retired, #176) | sold through products; its files are assets |
| Asset | one file (MIDI, WAV, preset, …) | D1 `product_files` (uploaded in `/admin` or the Studio); from the Pack Builder also D1 `assets` (its identity across versions) with its place in each version in `pac_entries` | `pac_id`, `kind` (One-shots, Loops, MIDI, … from `server/discovery/vocabulary.js` `KINDS`, shown via the generated `data/content-types.js`), format from the filename |
| Release, event | a project's music and dates | the Studio → D1 `project_releases`, `project_events` (every creator, first-party included, since 2026-10-21) | pages rendered by the server at `/<creator>/<project>/music/<slug>` and `/events/<slug>`, plus the `/events` calendar ([creators](creators.md#music-and-events)); tags under the store's rule |
| News post | a project's announcement | D1 `project_news`, hidden (#174) | waits for the creator's Community page; old addresses 301 to the project home ([community](community.md)) |
| Product | what a customer buys | the Studio → D1 `products` (the code-based catalog was retired, #176) | `project`, `pacs`; a page at `/shop/<id>` for every creator (`server/shop/`, #175) |
| Entitlement | who owns which product | D1 `entitlements` | unchanged; owning a product unlocks the assets uploaded to it |

### Products, Pacs and assets

A product sells one or more Pacs of its own project (`pacs: [...]`). Its paid files are uploaded to it in the admin (or the Studio) as before, or published from a Pac version built in the Pack Builder ([packs](packs.md)); each single upload can name one of the product's Pacs and a content kind. So an asset keeps every relationship: project (via Pac → Stacclet), Stacclet, Pac, product, kind, format, and, through the product, licence and price. Download access is still checked against the asset's product (`product_files.product_id`), so the security model and its tests did not change. Files uploaded without a Pac are still delivered; the library shows them under their product.

The Studio checks a product's Pacs on the server (`server/packs/`). The build (`scripts/lib/platform.js`) refuses unknown projects and features, polls for projects that don't use polls, and relationships to things that don't exist or to Studio content (products, Stacclets, Pacs, releases), which `data/` can't check.

### Sync to the database

`scripts/build.js` writes `db/catalog.sql` from `data/`: first-party creators (trusted), projects (with their look, `projects.look`) and polls (`scripts/lib/platform-catalog.js`, SQL helpers in `scripts/lib/catalog.js`). Products, Stacclets, Pacs, releases, events and news are not in `data/` any more (owner, 2026-10-21, #176). They live only in D1, first-party ones included, and the sync never touches them. Migration `0040_project_content.sql` moved the real release and post. `0042_retire_catalog_products.sql` unpublished and marked deleted the product, Stacclet and Pac rows the old sync had left; they are never dropped, because orders point at them. The sync owns only rows with `source = 'catalog'`; whatever the Studio made (`source = 'studio'`) is never touched ([creators](creators.md)). A Studio product gets its own Stacclet and Pac in D1 with its first Pack Builder upload (`ensureStudioPac`, `server/packs/access.js`). Tests and local work use fixtures outside `data/` (seeded by `scripts/dev.js`). Schema: `db/migrations/0003_platform.sql`, creators in `0006_creators.sql`, Pacs, versions, stored originals, folders, assets and their values in `0014_packs.sql` ([packs](packs.md); forward-only).

## Your Stacc

The library page (`/library`) is "Your Stacc": every asset the customer can use, browsable by project → Stacclet → Pac → content type, or by content type across everything, filtered by project, kind and format, with single and selected downloads. Both views are computed from one list of assets (`js/stacc-model.js`); the same asset object appears in each. Details: [library](library.md).

## Auto

- **Purchase → Stacc:** already true; a paid order grants entitlements and the library reads them.
- **Following a project:** `PUT /api/follows/:projectId` (signed-in, verified). The directory (`GET /api/projects/browse`, [browse](browse.md)) and the creators directory (`GET /api/creators`, `server/projects/creators.js`: active, published creators with at least one visible project, only name, address, verified and project links, cached publicly a minute), follows and Auto-Stacc cover published Studio projects of active creators too; polls need a feature only `data/projects.js` sets. Followed projects' published products surface in Your Stacc under "New from projects you follow".
- **Auto-Stacc:** a follow with `autoStacc: true` grants every free, published product of that project (source `free`, the same idempotent grant as claiming it by hand), now and whenever the library is opened, so free releases added later arrive by themselves; it skips a creator space whose selling is paused by copyright strikes ([copyright](copyright.md)). Paid products are never granted by following; they appear as available until bought.
- **Automatic organization:** assets are placed by their Pac, kind and format with no per-customer work.

Code: `server/projects/` (projects, follows), `server/entitlements/autostacc.js` (the grant), `js/projects.js` (the static projects rack), `js/projects-browse.js` (the `/projects` browser) and `js/follow.js` (follow buttons anywhere).

## Reusable interactive infrastructure

- **Polls** (`data/polls.js` → D1 `polls`, votes in `poll_votes`; `server/polls/`): any project with `"polls"` in its features can publish one. One vote per verified account, changeable while open. `js/polls.js` renders polls on a page that lists them. Glitches & Stitches uses it; other projects can ignore it.
- **Relationships** (`data/relationships.js`, `scripts/lib/relations.js`): typed links between content (`built-from`, `remix-of`, `samples`, `evolved-from`) Products, Stacclets, Pacs and releases moved to the Studio (2026-10-21, #176), so `data/` can't check a link to one, and the build refuses such links in relationships and polls; only polls can be linked for now. Linking to Studio content is not built. Glitches & Stitches' stitch genealogy uses it; nothing in it is project-specific.

## Extension points

| To add | Change |
| --- | --- |
| a project | one entry in `data/projects.js` (first-party) or the Studio ([projects](projects.md)) |
| a Stacclet / Pac | the product's Pack Builder in the Studio ([packs](packs.md)) |
| a kind of content, or a file format | one entry in `KINDS` or `FORMATS` in `server/discovery/vocabulary.js` (then `node scripts/build.js`; `data/content-types.js` is generated) |
| a kind of product | one entry in `data/product-types.js` (plus its tax code, store schema and licence; `template`, the community library's site templates, was added this way) |
| a release or event | the project's Music or Events in the Studio ([creators](creators.md#music-and-events)); news waits for the community |
| a poll | one entry in `data/polls.js` |
| a relationship type | one entry in `RELATIONSHIP_TYPES` (`data/relationships.js`) |
| a community feature | a folder in `server/community/features/` with a manifest, one line in `features/index.js` ([community](community.md#built-as-independent-features-owner-2026-10-20)) |
| a request-wide rule | a gate called once in `server/app.js` before the route runs, beside the impersonation policy (the copyright text-only gate, `server/copyright/policy.js`) |
| a server feature | a folder in `server/` with its own `routes`, one import and one line in `server/app.js` (a module with no routes of its own, like `server/usage/`, is called by the modules that need it; one area may wire more than one route table, like `server/packs/` or `server/account/`) |
| a store-wide switch the owner flips | a key in `SETTINGS` (`server/settings/settings.js`) |
| a section of the Product Studio or Control Center | an entry in `data/workspaces.js` and a section module ([studio](studio.md)) |

## Not built yet (on purpose)

- (Built 2026-10-10: ZIPs of several owned files, `POST /api/downloads/bundle`, for files published from the Pack Builder; server areas `packs/`, `blobs/`, `maintenance/` and feature switches in `server/lib/features.js`: [packs](packs.md). "Download selected" still fetches each file's own link in turn.)
- **Pac-level ownership:** access is per product. Bundles that share Pacs across products need a `product_pacs` table and a Pac-aware access check; the entitlement `bundle` source is reserved.
- **Notifications:** new-release mail is sent by hand from the Control Center (Products → **Email followers**) to followers who switched new-release emails on, once per person per product (`server/admin/news.js`). Nothing sends it automatically when a product is published.
- **Licences:** one licence per kind of product (`data/licenses.js`, picked by `license` in `data/product-types.js`), shown on `/license` and each product page; no per-purchase licence records.
- **Project pages per project and project-specific branding** beyond the first project's existing pages; the first second project will show what it needs. Creators' own sites and profiles, designed in the visual builder with checked CSS and AutoStacc's trusted interactive pieces, and selling from the Studio are built ([builder](builder.md), [creators](creators.md)); the earlier design for sandboxed creator code is in [creator pages](creator-pages.md) (not built; superseded for now).
- (Resolved 2026-10-08: the site is AutoStacc; projects live at `/<creator>/<project>` and creators build free sites in the Studio; see [creators](creators.md) and [decisions](decisions.md).)
