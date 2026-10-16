---
title: Product Studio and the workspace shell
summary: How creators work on one product (Overview, Pac Builder, Store Page, Pricing, Insights, Release) in a shared workspace shell that the Control Center also uses; names, data ownership, API contracts, and what is built versus planned.
covers: [data/workspaces.js, js/workspace.js, css/workspace.css, js/studio-workspace.js, js/studio-section-*.js, js/studio-kit.js, js/studio-preview.js, js/studio-store-media.js, js/product-view.js, css/studio-sections.css, server/studio/workspace.js, server/studio/pricing.js, server/studio/insights.js, server/studio/insights-data.js, server/creators/readiness.js, server/creators/events.js, server/creators/product-history.js, server/promotions/creator-sales.js, server/settings/, server/payments/creator-sales.js, server/admin/creator-sales.js, db/migrations/0017_product_studio.sql]
updated: 2026-10-15
---

# Product Studio and the workspace shell

> **Status (2026-10-10): built (issue #106), except what is marked Not in this pass.** This note is the owner's brief ("AutoStacc Project Studio, Architecture Outline") adapted to AutoStacc's model and names. Each section below is marked **Built**, **Planned**, or **Not in this pass**. The section names are working names and can change. They live in one data file (`data/workspaces.js`), so a rename is one edit.

## Where things live

| Place | What it is for |
| --- | --- |
| **Creator Dashboard** (`/studio`) | Everything that belongs to the creator as a whole: the creator name and public profile, all projects and their sites (block editor), each project's list of products, earnings across all products, the payout account, and payout requests. This page already exists as `/studio`. |
| **Product Studio** (`/studio#product=<id>`, plus `&section=<key>`) | One product, opened from its project's product list. It has a persistent sidebar of sections and a compact header. Every section works on the same product record. |
| **Control Center** (`/admin`) | The owner's admin, in the same workspace shell (sidebar, compact header, drawer on phones) with its own sections. |

**Why one product, not one project** (owner, 2026-10-10). In AutoStacc a *Project* (for example Glitches & Stitches) is a creative identity that holds many products. The brief's "project studio" manages one sellable thing: one Pac, one store page, one price. So its unit is the **product**. Project-level work (the site, the product list, project follows) stays on the Creator Dashboard.

## Names (owner chose the Stacc vocabulary)

| Brief | AutoStacc | Key | State |
| --- | --- | --- | --- |
| Main Project Studio / Overview | **Overview** | `overview` | Built (default when reopening a product) |
| Pack Studio | **Pac Builder** | `pacs` | Built (the main creation step: a new product opens here) |
| Storefront Studio | **Store Page** | `store` | Built |
| Pricing Studio | **Pricing** | `pricing` | Built |
| Analytics Studio | **Insights** | `insights` | Built |
| Publishing and Release Controls | **Release** | `release` | Built (shared by every section and the header) |
| Collaboration Studio | **Team** | `team` | Not in this pass (listed as planned, not shown in the sidebar) |
| Creator Dashboard | **Creator Dashboard** | — | The existing `/studio` home |

"Pac" is the platform's word for a folder of content ([autostacc](autostacc.md)). Elsewhere the names are plain words.

## Layout (shared shell: `js/workspace.js`, `css/workspace.css`)

`css/workspace.css` also styles the Pack Builder's review table and the Pac editor where Studio and the Control Center share them (the waveform beside each file, the folder tree, the previews panel; [packs](packs.md#pac-editor-built-2026-10-15)). In the Pac Builder section, the one drop zone (`js/pac-drop.js`) takes a single file too and opens it in the builder; older single files are listed with Remove (`js/studio-section-pacs.js`).

- **Desktop:** a persistent sidebar of sections on the left, with the open section in the central workspace. Sections can be grouped; the Control Center uses groups.
- **Compact header:** the item's name, its status (Draft, On sale, Paused, Removed for a product; LIVE or TEST for the Control Center), a save status ("All changes saved", "Saving…", "Unsaved changes", "Couldn't save"), a **Preview** action and a settings menu.
- **Phones (below about 900px):** the sidebar becomes a drawer opened from a "Sections" button in the header. Sections are not squeezed into tabs.
- **Addresses:** the open section is kept in the address, so a reload or a shared link lands on it. Product Studio uses `#product=<id>&section=<key>`; the Control Center keeps `/admin#<key>`.
- **Accessibility:** the sidebar is a `<nav>` of buttons, with `aria-current` on the open one. The drawer traps focus while open and closes on Escape. Focus moves to the section heading after navigation.
- One shell, two versions: `GS.workspace.mount(root, { label, title, subtitle, status: {text, tone}, groups: [{label, items: [{key, label, badge}]}], current, actions, menu, onSelect, onAction })` draws it and returns `{ body, select, current, setTitle, setSubtitle, setStatus, setSave, setBadge, setActions, setMenu }`. Tones are `neutral`, `good`, `warn` and `danger`. Stable hooks for tests: `[data-ws-item=<key>]`, `[data-ws-open]` (the phone Sections button), `[data-ws-status]`, `[data-ws-save]`, `[data-ws-menu]`.
- **Section modules** (`js/studio-section-<key>.js`) each register `GS.studioSections.<key> = { draw(el, ctx) }`. `ctx` is `{ product, workspace, reload(), go(key), setSave(state), note(text, error), release(act, btn) }`, where `product` is the latest `GET /api/studio/products/:id` payload. `draw` may return a function that runs when the section is left (Store Page saves pending edits that way). `[data-sw-go=<key>]` and `[data-sw-release=<act>]` work anywhere in the body. A missing or failing module shows "This section isn't available right now". Shared helpers: `js/studio-kit.js` (status words, history sentences, readiness lists, the checkout note) and `js/studio-preview.js` (the Studio record in the product page's shape, and the included-content summary).

## Data ownership (one product record, no copies)

All sections read and write the same D1 rows. No section keeps its own copy of product data.

| Owner | Owns | Stored in |
| --- | --- | --- |
| Overview | nothing of its own: it summarizes the others | — |
| Pac Builder | files buyers get, Pac structure, per-file details | `product_files`, `pacs`, `pac_versions`, `assets`, `pac_additions`, `pac_previews` (server/packs, server/files) |
| Store Page | title, description, highlights ("what's inside"), cover art, preview clip, kind, tags, store details | `products`, `product_facets` (server/creators/products.js) |
| Pricing | base price, the creator's sales | `products.price_cents`, `promotions` rows with `creator_id` (server/promotions) |
| Insights | reads orders, order lines, refunds, downloads and per-day view counters; stores nothing | `order_items`, `orders`, `download_events`, `analytics_daily` |
| Release | readiness rules, publish state, release history | `products.published`/`sales_paused`/`deleted_at`, `product_events` |

- **Store Page reuses the Pac's facts.** The "included content" summary on the store page is counted from the published files (how many of each kind and format, and the total size), never typed in again. Store details suggested from the product's own words stay suggestions until the creator accepts them.
- **Typing is never lost to a redraw.** Pricing draws at once and again when the server's numbers arrive; that second draw keeps anything already typed (and the cursor), unless it follows a save.
- **Pricing supplies the displayed price.** A creator's sale is an ordinary `promotions` sale scoped to that one product, so the cart, checkout, search, the "on sale" filter and order history already handle it (`server/cart/pricing.js` is still the only place prices are combined).
- **Release reads everything.** It runs one readiness check (`server/creators/readiness.js`), and the same check guards `published: true` on the server. No other code path can publish around it.

## Sections in detail

### Overview (Built)

Cover art, name, status and the project it belongs to. A readiness checklist: blocking items first, then recommendations, each linking to the section that fixes it. Quick actions: Edit Pac, Edit store page, Set price, Preview, Publish. Recent activity (the last 10 product events), and a 30-day summary (orders, revenue, the creator's share, downloads, views) with a link to Insights.

### Pac Builder (Built; uses Phase 5's creator Pack Builder)

The product's files, in one of two ways:

- **Pac (ZIP).** The creator Pack Builder from Phase 5 ([packs](packs.md)), shown inside the workspace (`js/studio-packs.js` through `js/studio-section-pacs.js`). It offers a resumable upload, an in-browser preview of the ZIP, the engine's findings and the automated review, review of values and folders, versions, publish and discard. The product gets its own Stacclet and Pac with its first upload. A clean version goes live at once. A flagged one waits in the Control Center's review queue, where an admin approves it or rejects it with a note the creator sees. Uploads count against the creator's file storage (500 MB free).
- **Pac editor** (switch `packs.editor`, [packs](packs.md#pac-editor-built-2026-10-15)): one drop zone (`js/pac-drop.js`) for a file, a folder or a whole ZIP, and a visual builder that works like a file manager (`js/pac-editor.js`: folders of file cards with waveforms and play buttons, drag and drop, new folders, rename, move and remove, a read me) plus up to three preview clips (`js/pac-previews.js`). Everything waits for Publish.
- **Single files.** With the Pac editor on, through the drop zone into the Pac (checked by the engine, waiting for Publish). Without it, the existing per-file upload (held for approval unless the creator is trusted).

Only the product's owners and editors can use it; anyone else gets a 404. With the `packs.builder` switch off, the section shows only single files.

### Store Page (Built)

The product's title, description, highlights ("What's inside" lines), kind, tags, store details (`js/studio-details.js`), cover art (one of the creator's images), the preview clip, and a read-only licence line (AutoStacc's standard licence; licence choices are an open question in [vision](vision.md)). Alongside sits a **live preview** drawn by the same renderer as the real product page (`js/product-view.js`, shared with `js/product-page.js`), so the creator sees what buyers will see. Edits autosave about two seconds after typing stops, and the header shows the save status.

Not in this pass: screenshots and promotional galleries, product-type-specific layouts beyond the store-details schema.

### Pricing (Built)

- **Base price:** free, or $1 to $500 (`SELLING`).
- **One sale at a time per product,** created by the creator: a percentage (1–90%) or an amount off, starting now or at a set time, with an optional end (at most 90 days). The store keeps a paid product at 50¢ or more, the same floor as admin sales. A sale can't start in the past or end before it starts. It can be ended early but not edited: end it and make another, so every order keeps the terms it got (the same rule as admin promotions).
- **Estimated earnings:** for the list price and for the sale price, the platform fee (the creator's own, or 20%) and the creator's share, computed by the server's own split (`server/revenue/split.js`). Payment processing is AutoStacc's cost and is not taken from the share.
- If a store-wide sale from AutoStacc also applies, the buyer gets whichever price is lower, and the section says so.

Not in this pass: tiers, bundles, and per-product promotion eligibility rules. Payout methods stay on the Creator Dashboard.

### Insights (Built; this product only)

For the last 30, 90 or 365 days, each compared with the period before: orders, units, gross revenue, discounts, net revenue, platform fees, the creator's share, refunds, free claims, downloads, product page views, and conversion (orders divided by views). A daily chart, sales performance (orders and money taken off per sale), and a CSV export of the daily rows. Everything comes from records the store already keeps. Views come from the existing per-day counters (`POST /api/events`, which keeps no personal data), so nothing new is collected.

Not tracked: traffic sources. The section says "not tracked yet" instead of showing a number.

### Release (Built; shared)

- **Readiness** in two lists. *Blocking:* no title; no file buyers can get yet; a Pac version waiting for review (`in_review`) with no other deliverable file; a paid price outside the allowed range; the creator suspended. *Recommended:* a description shorter than 80 characters, no cover art, no preview clip, no tags, no store details, no "what's inside" lines.
- **Controls:** Publish (put on sale), Back to draft, Pause and resume sales, and Remove (buyers keep their files). Saved edits to a published product are live as soon as they are saved, and the history records them. The section says that publishing doesn't email followers (only the Control Center's Email followers does), that a free product goes straight to followers with Auto-Stacc on, and that the files buyers download change only by publishing a Pac version in the Pac Builder.
- **Release history:** every publish, unpublish, pause, resume, removal, price change, sale start or end, store preview clip added or removed, Pac version submitted, approved, refused or published, and file added or removed, with who did it and when (`product_events`).
- **Rollback:** not supported yet. A superseded Pac version can't be restored; upload it again. Removed or replaced files stay delivered to earlier buyers for 30 days ([packs](packs.md)).

### Creator purchases switch (Built)

Until the marketplace Stripe key is set (`STRIPE_MARKETPLACE_KEY`, [payouts-setup](payouts-setup.md)), creators can still build, publish and list products, and buyers can add them to their cart. The cart marks them "Creator checkout isn't open yet" and keeps them outside the totals, checkout sends only the other items, and the store refuses a checkout that includes them (`503 creator_sales_closed`). The Product Studio's Overview and Release say so too. The owner can also pause creator purchases at any time, and allow them again, in the Control Center (Creators, "Creator purchases"; `GET|PUT /api/admin/creator-sales`, audited). Pausing also closes the payment pages already open for creators' products (expired at Stripe, their orders cancelled; the answer and the audit entry say how many), so nothing can be paid after the pause (`server/payments/creator-sales.js`). The same store settings (`server/settings/settings.js`, each key with its allowed values or a check) hold the budget guard's override month and storage cap (Control Center, Usage and storage; [admin](admin.md)). Purchases are open only when both hold: the key is set and they aren't paused (`server/payments/creator-sales.js`, stored in `store_settings`). The mock payment provider used in development and tests needs no key.

### Team (Not in this pass)

The plan from the brief, kept for later: invite and remove collaborators, roles and permissions (edit, publish, manage commercial settings), contribution credits, revenue-share agreements with authorization and clear confirmation, and agreement history. The `editor` role already exists but can't be granted yet ([creators](creators.md)). Roles and split options are open questions in [vision](vision.md), so nothing about them is decided here.

## API contracts (server/studio/)

All routes need a signed-in member of the product's creator (owner or editor; earnings-related numbers are owner-only). Everyone else gets a 404. State-changing routes are refused during a support impersonation.

- `GET /api/studio/products/:id` returns `{ product, project, creator, role, readiness: { ready, blocking[], recommended[] }, activity[], summary, limits, features }`. Each readiness item is `{ code, message, section }`.
- `PATCH /api/studio/products/:id`: the existing edit route. `published: true` now refuses with `409 not_ready` and the blocking list when readiness fails, and every change records a product event.
- `GET /api/studio/products/:id/activity?limit=` returns the release history, newest first.
- `GET /api/studio/products/:id/pricing` returns `{ priceCents, currency, feeBps, effectivePriceCents, estimate: { list, sale }, sales[], storeSale, limits }` (`feeBps` and the estimate's fee and share are owner-only).
- `POST /api/studio/products/:id/sales` with `{ percentOff | amountOffCents, startsAt?, endsAt? }`; `DELETE /api/studio/products/:id/sales/:saleId` ends a sale now, or deletes one that hasn't started.
- `GET /api/studio/products/:id/insights?days=30|90|365` returns `{ range, totals, previous, daily[], sales[], tracked }`; with `&format=csv` it returns `text/csv`.
- Pac Builder: Phase 5's `/api/studio/packs/…` routes (`server/packs/access.js`, [packs](packs.md)).
- Readiness codes. Blocking: `no_title`, `needs_file`, `pac_in_review`, `price_out_of_range`, `creator_suspended`. Recommended: `short_description`, `no_artwork`, `no_preview`, `no_tags`, `no_store_details`, `no_includes`. Publishing with only the file missing answers `409 needs_file`; otherwise `409 not_ready`. Either way the error carries `blocking`.
- History: the same person's plain edits within 15 minutes are merged into one "edited" event (`recordEdit`), so autosave doesn't flood it. A product taken off sale automatically when its last file goes isn't recorded yet, nor is a discarded Pac version (`pac_created` and `pac_version_discarded` are allowed kinds nothing records).
- The workspace payload also carries `checkout: { open, reason }` (see the creator purchases switch).

## Control Center version

The same shell with these groups: **Store** (Overview, Products, Pacs, Promotions, News), **People** (Orders, Customers, Entitlements, Creators, Payouts) and **Tools** (Test purchases, Usage and storage, Audit log). The header shows LIVE or TEST and the environment. Every panel keeps its id (`#admin-<key>`), so each tab's own script is unchanged.

## Implementation order (from the brief) and where it stands

1. Shared data model and permissions: the product record, `product_events`, readiness, and creator sales on `promotions`. **This pass.**
2. Overview and navigation. **This pass.**
3. Pac Builder with uploads, organization and validation for creators. **Built** (Phase 5, with automated review).
4. Store Page and live preview. **This pass.**
5. Pricing and validation. **This pass.**
6. Shared release controls. **This pass.**
7. Team. **Later.**
8. Insights: **this pass** for the basics; advanced reporting later.
9. Testing across kinds of product and screen sizes: browser tests at 390px and desktop.
