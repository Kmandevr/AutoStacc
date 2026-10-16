---
title: Architecture
summary: AutoStacc as a platform: projects, the Project → Stacclet → Pac → Asset hierarchy, products, Your Stacc, Auto-Stacc, polls and relationships, and where each lives in the code.
covers: [data/site.js, data/creators.js, data/projects.js, data/stacclets.js, data/pacs.js, data/content-types.js, data/product-types.js, data/polls.js, data/relationships.js, scripts/lib/platform.js, scripts/lib/platform-catalog.js, scripts/lib/relations.js, db/migrations/0003_platform.sql, server/projects/, server/polls/, server/entitlements/autostacc.js, server/app.js, js/stacc-model.js, js/projects.js, js/polls.js]
updated: 2026-10-16
---

# Architecture

**AutoStacc is the platform. Projects create. Stacclets organize related Pacs. Pacs contain content. Your Stacc makes that content useful. Auto handles the repetitive work.**

AutoStacc (the business, the store, accounts, library, delivery) is the technology and commerce layer. Projects are the creators that publish on it. [Glitches & Stitches](identity.md) is the first project; nothing in the platform code names it. What the words mean and how to use them: [autostacc](autostacc.md). How to add a project: [projects](projects.md). The library: [library](library.md). The store underneath: [store](store.md).

## What existed before this layer (2026-10-07)

- Static pages built from `data/*.js` by `scripts/build.js` (heads, item pages, sitemap, `db/catalog.sql`). See [seo](seo.md).
- A complete store API in `server/` (Better Auth accounts, D1 catalog synced from `data/products.js`, Stripe Checkout, one verified payment pipeline, entitlements separate from orders, HMAC-signed downloads from private R2, admin, analytics), plus store discovery (search, filters, recommendations, wishlists: [discovery](discovery.md)), with unit, API-security and browser tests. See [store](store.md).
- Already reusable and kept as is: entitlements (any source grants ownership), `product-types.js` (a new kind of product is data), the catalog sync, the download pipeline and its tests.
- Single-artist assumptions: `SITE.artist` named the creator of every product and release, and the library listed products, not content.

The platform layer is built **on top** of that store. Authentication, checkout, payments, entitlements and download security are unchanged; ownership is still decided only by `entitlements`, per product.

## The model

```
AutoStacc (platform: data/site.js → SITE)
└── Creator            data/creators.js / D1   owns projects; seller of record; address /<creator> (creators.md)
    └── Project        data/projects.js        creative entity; owns identity and features; /<creator>/<project>
    ├── Release        data/music.js           project: <id>
    ├── News post      data/news.js            project: <id>
    ├── Product        data/products.js        project: <id>, pacs: [<pac id>]  ← what is sold
    ├── Stacclet       data/stacclets.js       project: <id>                    ← groups related Pacs
    │   └── Pac        data/pacs.js            stacclet: <id>                   ← a folder of content
    │       └── Asset  D1 product_files        pac_id, kind                     ← one file
    ├── Poll           data/polls.js           project: <id> (project must use "polls")
    └── Relationship   data/relationships.js   "kind:id" → "kind:id" (project must use "relationships")
```

Every link is stored once, on the child, as an id. Everything else is derived: an asset's Stacclet and project come from its Pac; a product's contents come from its Pacs. Nothing is copied for a view.

| Concept | Is | Lives in | Notes |
| --- | --- | --- | --- |
| Creator | who owns projects and sells, with a team of members in roles | `data/creators.js` (first-party) or the Studio → D1 `creators`, `creator_members`, `creator_roles` | [creators](creators.md) |
| Project | creative work of a creator | `data/projects.js` (or the Studio) → D1 `projects` | `creator`; `features` lists which platform features it uses |
| Stacclet | a collection of related Pacs | `data/stacclets.js` | not a folder; never holds files directly |
| Pac | a container of content | `data/pacs.js` | sold through products; its files are assets |
| Asset | one file (MIDI, WAV, preset, …) | D1 `product_files` (uploaded in `/admin` or the Studio); from the Pack Builder also D1 `assets` (its identity across versions) with its place in each version in `pac_entries` | `pac_id`, `kind` (One-shots, Loops, MIDI, … from `server/discovery/vocabulary.js` `KINDS`, shown via the generated `data/content-types.js`), format from the filename |
| Product | what a customer buys | `data/products.js` → D1 `products` | `project`, `pacs`; price and availability as before |
| Entitlement | who owns which product | D1 `entitlements` | unchanged; owning a product unlocks the assets uploaded to it |

### Products, Pacs and assets

A product sells one or more Pacs of its own project (`pacs: [...]`). Its paid files are uploaded to it in the admin (or the Studio) as before, or published from a Pac version built in the Pack Builder ([packs](packs.md)); each single upload can name one of the product's Pacs and a content kind. So an asset keeps every relationship: project (via Pac → Stacclet), Stacclet, Pac, product, kind, format, and, through the product, licence and price. Download access is still checked against the asset's product (`product_files.product_id`), so the security model and its tests did not change. Files uploaded without a Pac are still delivered; the library shows them under their product.

The build (`scripts/lib/platform.js`) refuses: unknown projects, Stacclets or Pacs; a product selling another project's Pac; a published product selling a draft Pac; polls for projects that don't use polls; relationships to things that don't exist.

### Sync to the database

`scripts/build.js` writes `db/catalog.sql` from `data/`: products (now with `project_id` and `pacs`), first-party creators, projects, Stacclets, Pacs and polls (`scripts/lib/platform-catalog.js`). The sync owns only rows with `source = 'catalog'`; creators, projects and products made in the Studio (`source = 'studio'`) live only in D1 and are never touched ([creators](creators.md)). First-party Stacclets and Pacs are written in `data/` and synced to the `stacclets` and `pacs` tables (with each Pac's project) for the Pack Builder; a Studio product gets its own Stacclet and Pac in D1 with its first Pack Builder upload (`ensureStudioPac`, `server/packs/access.js`). The library still joins them in the browser. Schema: `db/migrations/0003_platform.sql`, creators in `0006_creators.sql`, Pacs, versions, stored originals, folders, assets and their values in `0014_packs.sql` ([packs](packs.md); forward-only).

## Your Stacc

The library page (`/library`) is "Your Stacc": every asset the customer can use, browsable by project → Stacclet → Pac → content type, or by content type across everything, filtered by project, kind and format, with single and selected downloads. Both views are computed from one list of assets (`js/stacc-model.js`); the same asset object appears in each. Details: [library](library.md).

## Auto

- **Purchase → Stacc:** already true; a paid order grants entitlements and the library reads them.
- **Following a project:** `PUT /api/follows/:projectId` (signed-in, verified). The directory (`GET /api/projects/browse`, [browse](browse.md)), follows and Auto-Stacc cover published Studio projects of active creators too; polls need a feature only `data/projects.js` sets. Followed projects' published products surface in Your Stacc under "New from projects you follow".
- **Auto-Stacc:** a follow with `autoStacc: true` grants every free, published product of that project (source `free`, the same idempotent grant as claiming it by hand), now and whenever the library is opened, so free releases added later arrive by themselves. Paid products are never granted by following; they appear as available until bought.
- **Automatic organization:** assets are placed by their Pac, kind and format with no per-customer work.

Code: `server/projects/` (projects, follows), `server/entitlements/autostacc.js` (the grant), `js/projects.js` (the static projects rack), `js/projects-browse.js` (the `/projects` browser) and `js/follow.js` (follow buttons anywhere).

## Reusable interactive infrastructure

- **Polls** (`data/polls.js` → D1 `polls`, votes in `poll_votes`; `server/polls/`): any project with `"polls"` in its features can publish one. One vote per verified account, changeable while open. `js/polls.js` renders polls on a page that lists them. Glitches & Stitches uses it; other projects can ignore it.
- **Relationships** (`data/relationships.js`, `scripts/lib/relations.js`): typed links between content (`built-from`, `remix-of`, `samples`, `evolved-from`) between releases, products, Stacclets, Pacs and polls. Release pages show "Built from" and the reverse ("Featured in") when links exist. Glitches & Stitches' stitch genealogy uses it; nothing in it is project-specific.

## Extension points

| To add | Change |
| --- | --- |
| a project | one entry in `data/projects.js`; its content names it with `project:` ([projects](projects.md)) |
| a Stacclet / Pac | entries in `data/stacclets.js` / `data/pacs.js`; list the Pac on a product |
| a kind of content, or a file format | one entry in `KINDS` or `FORMATS` in `server/discovery/vocabulary.js` (then `node scripts/build.js`; `data/content-types.js` is generated) |
| a kind of product | one entry in `data/product-types.js` (plus its tax code, store schema and licence; `template`, the community library's site templates, was added this way) |
| a poll | one entry in `data/polls.js` |
| a relationship type | one entry in `RELATIONSHIP_TYPES` (`data/relationships.js`) |
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
