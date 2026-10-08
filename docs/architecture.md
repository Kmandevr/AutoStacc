---
title: Architecture
summary: AutoStacc as a platform: projects, the Project → Stacclet → Pac → Asset hierarchy, products, Your Stacc, Auto-Stacc, polls and relationships, and where each lives in the code.
updated: 2026-10-08
---

# Architecture

**AutoStacc is the platform. Projects create. Stacclets organize related Pacs. Pacs contain content. Your Stacc makes that content useful. Auto handles the repetitive work.**

AutoStacc (the business, the store, accounts, library, delivery) is the technology and commerce layer. Projects are the creators that publish on it. [Glitches & Stitches](identity.md) is the first project; nothing in the platform code names it. What the words mean and how to use them: [autostacc](autostacc.md). How to add a project: [projects](projects.md). The library: [library](library.md). The store underneath: [store](store.md).

## What existed before this layer (2026-10-07)

- Static pages built from `data/*.js` by `scripts/build.js` (heads, item pages, sitemap, `db/catalog.sql`). See [seo](seo.md).
- A complete store API in `server/` (Better Auth accounts, D1 catalog synced from `data/products.js`, Stripe Checkout, one verified payment pipeline, entitlements separate from orders, HMAC-signed downloads from private R2, admin, analytics), with unit, API-security and browser tests. See [store](store.md).
- Already reusable and kept as is: entitlements (any source grants ownership), `product-types.js` (a new kind of product is data), the catalog sync, the download pipeline and its tests.
- Single-artist assumptions: `SITE.artist` named the creator of every product and release, and the library listed products, not content.

The platform layer is built **on top** of that store. Authentication, checkout, payments, entitlements and download security are unchanged; ownership is still decided only by `entitlements`, per product.

## The model

```
AutoStacc (platform: data/site.js → SITE.platform)
└── Project            data/projects.js        creative entity; owns identity and features
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
| Project | a creator | `data/projects.js` → D1 `projects` | `features` lists which platform features it uses |
| Stacclet | a collection of related Pacs | `data/stacclets.js` | not a folder; never holds files directly |
| Pac | a container of content | `data/pacs.js` | sold through products; its files are assets |
| Asset | one file (MIDI, WAV, preset, …) | D1 `product_files` (uploaded in `/admin`) | `pac_id`, `kind` (`data/content-types.js`), format from the filename |
| Product | what a customer buys | `data/products.js` → D1 `products` | `project`, `pacs`; price and availability as before |
| Entitlement | who owns which product | D1 `entitlements` | unchanged; owning a product unlocks the assets uploaded to it |

### Products, Pacs and assets

A product sells one or more Pacs of its own project (`pacs: [...]`). Its paid files are uploaded to it in the admin as before, and each upload can name one of the product's Pacs and a content kind. So an asset keeps every relationship: project (via Pac → Stacclet), Stacclet, Pac, product, kind, format, and, through the product, licence and price. Download access is still checked against the asset's product (`product_files.product_id`), so the security model and its tests did not change. Files uploaded without a Pac are still delivered; the library shows them under their product.

The build (`scripts/lib/platform.js`) refuses: unknown projects, Stacclets or Pacs; a product selling another project's Pac; a published product selling a draft Pac; polls for projects that don't use polls; relationships to things that don't exist.

### Sync to the database

`scripts/build.js` writes `db/catalog.sql` from `data/`: products (now with `project_id` and `pacs`), projects and polls (`scripts/lib/platform-catalog.js`). Stacclets and Pacs stay in `data/` (the library joins them in the browser) until a server feature needs them. Schema: `db/migrations/0003_platform.sql` (forward-only).

## Your Stacc

The library page (`/library`) is "Your Stacc": every asset the customer can use, browsable by project → Stacclet → Pac → content type, or by content type across everything, filtered by project, kind and format, with single and selected downloads. Both views are computed from one list of assets (`js/stacc-model.js`); the same asset object appears in each. Details: [library](library.md).

## Auto

- **Purchase → Stacc:** already true; a paid order grants entitlements and the library reads them.
- **Following a project:** `PUT /api/follows/:projectId` (signed-in, verified). Followed projects' published products surface in Your Stacc under "New from projects you follow".
- **Auto-Stacc:** a follow with `autoStacc: true` grants every free, published product of that project (source `free`, the same idempotent grant as claiming it by hand), now and whenever the library is opened, so free releases added later arrive by themselves. Paid products are never granted by following; they appear as available until bought.
- **Automatic organization:** assets are placed by their Pac, kind and format with no per-customer work.

Code: `server/projects/` (projects, follows), `server/entitlements/autostacc.js` (the grant), `js/projects.js` (the `/projects` page and follow buttons).

## Reusable interactive infrastructure

- **Polls** (`data/polls.js` → D1 `polls`, votes in `poll_votes`; `server/polls/`): any project with `"polls"` in its features can publish one. One vote per verified account, changeable while open. `js/polls.js` renders polls on a page that lists them. Glitches & Stitches uses it; other projects can ignore it.
- **Relationships** (`data/relationships.js`, `scripts/lib/relations.js`): typed links between content (`built-from`, `remix-of`, `samples`, `evolved-from`) between releases, products, Stacclets, Pacs and polls. Release pages show "Built from" and the reverse ("Featured in") when links exist. Glitches & Stitches' stitch genealogy uses it; nothing in it is project-specific.

## Extension points

| To add | Change |
| --- | --- |
| a project | one entry in `data/projects.js`; its content names it with `project:` ([projects](projects.md)) |
| a Stacclet / Pac | entries in `data/stacclets.js` / `data/pacs.js`; list the Pac on a product |
| a kind of content | one entry in `data/content-types.js` |
| a kind of product | one entry in `data/product-types.js` |
| a poll | one entry in `data/polls.js` |
| a relationship type | one entry in `RELATIONSHIP_TYPES` (`data/relationships.js`) |
| a server feature | a folder in `server/` with its own `routes`, one line in `server/app.js` |

## Not built yet (on purpose)

- **ZIP of a selection:** "Download selected" fetches each file's own signed link in turn. A server-side ZIP (`POST /api/downloads/bundle {fileIds}` → one signed link, streamed store-only ZIP) is the next step if customers want it.
- **Pac-level ownership:** access is per product. Bundles that share Pacs across products need a `product_pacs` table and a Pac-aware access check; the entitlement `bundle` source is reserved.
- **Notifications:** follows record who wants news; nothing sends it yet. A "new release" mail is one template in `server/email/templates.js` plus a send when a product is published.
- **Licences:** shown per product only as metadata; no licence records.
- **Project pages per project and project-specific branding** beyond the first project's existing pages; the first second project will show what it needs. The planned design for creator-made pages (sandboxed HTML/CSS, later JavaScript) is in [creator pages](creator-pages.md) (PLANNED / NOT IMPLEMENTED).
- (Resolved 2026-10-08: the site is AutoStacc and projects live under `/projects/<id>`; see [decisions](decisions.md) and [autostacc](autostacc.md#site-structure).)
