---
title: Visual builder
summary: BUILT (phases 1–9, 2026-10-15) (owner, 2026-10-15): one visual, Wix-like editor for creator profiles and project sites (free grid, edit on the live page, templates, checked CSS, AutoStacc's trusted interactive library, a shared community library with paid pieces, roles, version history, scheduling, fonts, one storage cap); the decisions and the build order.
covers: [server/library/, js/admin-library.js, db/migrations/0027_community_library.sql, js/builder*.js, js/site-*.js, css/builder.css, css/builder-canvas.css, css/creator-site.css, server/sites/, server/studio/sites.js, server/studio/site-files.js, server/creators/storage.js, db/migrations/0025_visual_builder.sql, test/unit/builder.test.js, test/api/builder.suite.js, test/browser/builder.test.js]
updated: 2026-10-28
---

# Visual builder

> **BUILT: every phase (2026-10-15).** The owner's answers of 2026-10-15, turned into a build plan. The visual editor replaced the Studio's form-based block editor ([creators](creators.md#the-studio-studio)). Each phase below is marked; what isn't marked **Built** doesn't exist yet. Decisions: [decisions](decisions.md#2026-10-15-the-visual-builder).

## What the owner asked for

"Turn the mini web builder into an account builder ... simple and visual like Wix." One editor builds a creator's whole public presence: the **creator profile** at `/<creator>` (today a generated list of projects) and **every project site** at `/<creator>/<project>`.

## Decisions (owner, 2026-10-15)

| Topic | Decision |
| --- | --- |
| What it builds | One editor for the creator profile and every project site; today's form editor goes away |
| Editing | On the live page: click anything to edit it, side panel for colours, fonts and images |
| Layout | A **free grid**: elements snap to a 12-column grid and are moved and resized by dragging; sections have banner and background images and colours |
| Phones | Built automatically from the desktop grid (top to bottom, left to right); in phone view an element can be hidden, reordered or resized for phones only |
| Pages | Several pages per site with a menu the creator arranges |
| Start | Pick a template: **Artist / Producer**, **DJ / Live**, **Sample-pack brand**, **Label / Collective** |
| Existing sites | Converted automatically; the old editor is removed |
| Must-haves | Undo / redo, phone preview toggle, banner and background images, custom navigation and pages |
| Custom code | **CSS yes, creator JavaScript never.** A site-wide stylesheet plus a class name on any element or section. AutoStacc checks the CSS and confines it to the page area, so it can't cover the AutoStacc strip, fake a login or load anything from outside |
| Interactivity | A **library of trusted pieces written by AutoStacc** that creators configure: motion and scroll effects; slideshows, tabs, accordion / FAQ, lightbox; an audio player for preview clips with a waveform, and release countdowns; store pieces |
| Script on creator pages | Only AutoStacc's one script (`script-src` names that one file); creators can't add any |
| Store pieces | **Links only**: product cards, cart and Follow / Auto-Stacc buttons link to AutoStacc's own pages. Carts, sign-in and payment never happen on a creator page (the rule in [creators](creators.md#how-creator-pages-stay-safe) stands) |
| Community library | Creators save sections, elements and templates and share them. **Only creators AutoStacc marked trusted can share**; anyone signed in can report a piece and the Control Center can take it down |
| Paid pieces | Creators can **sell** templates and sections as store products (usual platform fee, 20%). Buyers may use them on **any of their own sites**, never reshare or resell |
| Team editing | Roles **Editor** (drafts only), **Publisher** (edit and publish), **Store manager** (products, never payouts), **Admin** (everything but payouts and deleting the creator). Only the owner controls money |
| Version history | The **last 20 publishes** of each site, with restore |
| Scheduling | Publish a site's draft at a set date and time |
| Fonts and logo | Upload a font (WOFF2 only, checked by its bytes) and a logo or wordmark image, beside the curated font list |

### Storage (owner, 2026-10-15)

- **One combined cap: 550 MB free** (today's 50 MB of site images plus 500 MB of paid files). Images, fonts, templates, version history and paid files all count toward it. An admin-set quota still overrides it.
- **Template images count only against the seller.** Buyers' sites point at the seller's copy; only what a buyer uploads or changes counts for them.
- **History counts only unique files**: images that only old versions still use. Page layouts are free.
- **First-party creators upload too.** `server/studio/site-files.js` opts in with `{ allowCatalog: true }`, so a first-party creator's members upload release and product artwork the same way (2026-10-21, [decisions](decisions.md)).
- **At the cap only new uploads stop.** Live sites and products stay up. Site files are one of the parts `server/creators/storage.js` adds up (`PARTS.siteFiles`); more than the cap is [paid storage](creators.md#paid-storage-built-2026-10-16-off).
- **A deleted template's images stay** while any other creator's site still uses them, and keep counting against the seller until the daily sweep deletes them (Claude first proposed they stop counting; changed after the security review showed two accounts could then pass the cap).

## How it stays safe

The rules in [creators](creators.md#how-creator-pages-stay-safe) still hold; these are the changes:

- **Still no creator HTML or JavaScript.** A site is still a JSON document that the server checks and renders itself. The grid adds positions (`x`, `y`, `w`, `h` in grid units), section backgrounds, class names and settings for the trusted pieces, all checked values.
- **CSS is parsed and rebuilt, never pasted.** The server's checker (a new module, server/sites/css.js) reads the stylesheet into rules and declarations and writes a new one. Every selector becomes a descendant of the page area (`.cs-site …`), and the page area itself can't be named (its containment is what holds everything in; style `.cs-main` or a section instead), so `body`, `html`, `:root`, the AutoStacc strip and the footer can't be reached. Selectors can't name the editor's own `bx-` marks either. Brackets, quotes and braces must balance in every selector, value and condition, so the browser can't read a rule's end anywhere other than where the checker did (both found in the security review, 2026-10-15, and covered by tests). Refused: `@import`, `@font-face`, `@namespace`, `@charset`, `url()` other than the creator's own images and fonts, `image-set()`, `expression()`, `behavior`, `-moz-binding`, backslash escapes, `<`, nesting (`&`), and anything over the size limit. The page area itself is `contain: paint` and `isolation: isolate`, so even `position: fixed` stays inside it and nothing can be drawn over the strip.
- **One trusted script.** The page's CSP changes from `script-src 'none'` to the address of AutoStacc's runtime (/js/site-runtime.js, new) only. `connect-src`, forms and frames stay as they are. The runtime reads the settings the server wrote into `data-` attributes; it never evaluates anything a creator typed. Every piece works without it (all slides shown, every tab open, plain audio controls).
- **Fonts are checked by their bytes** (the WOFF2 header: signature, a known flavor and the file's own length) and served from `/media/sites/<id>` like images, with `font-src` allowing only them and the curated Google Fonts.
- **Shared and bought pieces** are copied into the buyer's document as data and checked again like anything the buyer typed. Their images stay the seller's, so a document may show its creator's own images **and** images of pieces its creator installed.

## Data (built)

- **Site document version 2** (`server/sites/document.js`, its parts `elements.js`, `fields.js`, `networks.js`):
  `{ version: 2, theme: { preset, accent, font, fontAsset, logo, header, css }, nav: { items: [{ label, page | url }] }, pages: [{ slug (never `community`: a project's community space keeps that address), title, description, sections: [{ id, rows, full, cls, background: { color, asset, fit, overlay, text }, elements: [{ id, type, box: { x, y, w, h }, phone: { hidden, order, h }, cls, style: { align, color, bg, radius, pad, size, shadow }, effect, hover, …fields }] }] }] }`.
  A version 1 document (a list of blocks per page) converts when read (`server/sites/convert.js`): one section per page, blocks stacked in full-width rows. The draft is saved as version 2 at the next save; published version 1 sites keep their rendered pages until published again.
- **Releases and Events elements** (owner, 2026-10-21, #178): any creator can place them on a page. They show the published releases (newest first, 1 to 12) or upcoming published events (soonest first) of one of the creator's **own** projects, made in the Studio's Music and Events editors, as cards linking to their pages. The events element existed with hand-typed dates (date, title, venue, city, link). It keeps them and gains an optional `project`, so no second type clashes with it. The project is checked like a follow button's (`server/sites/context.js` refs), and `server/sites/content-refs.js` reads the cards when the page is rendered. A shared library piece drops these project references, like the other creator-own content (`cleanFragment`). News has no element: it waits for the creator's community ([community](community.md)).
- **Shared modules** in `js/`, used by the server (thin re-exports in `server/sites/`) and the editor, the way `js/pack-diff.js` is: `site-text.js` (escaping, safe links, the text markup), `site-embeds.js`, `site-theme.js` (presets, fonts, header modes), `site-css.js` (the CSS checker), `site-elements.js` (each element's HTML) and `site-render.js` (sections on the grid, phone order, header and menu, the whole page). What the editor shows is what visitors get.
- **Grid:** 12 columns and rows of 24px that grow to fit their content (`css/creator-site.css`); an element's box is in those units. Phones (under 640px) get one column ordered top to bottom, then left to right, unless an element has its own phone order; phone-hidden elements and empty boxes drop out; a phone height is a minimum.
- **Profile sites**: `creator_sites` (draft, published, version, `live`) and `profile_pages` (migration `0025_visual_builder.sql`), served by `server/sites/public.js`. A site is a *target* (`server/sites/targets.js`: a project's or a profile's tables, address and titles), so editing, publishing, history and scheduling share one path (`server/sites/publish.js`, `server/studio/sites.js`: the same handlers under `/api/studio/projects/:id/…` and `/api/studio/creators/:id/…`).
- **History**: `site_versions`, the last 20 publishes per site (`LIMITS.versionsPerSite`); restore copies one into the draft (`server/sites/versions.js`).
- **Scheduling**: `scheduled_at` and a copy of the saved draft on the site's row (a schedule made by an account that has since reached three copyright strikes is dropped, not published: [copyright](copyright.md)); published on the first visit after that time or by the daily sweep (`server/sites/schedule.js`; a compare-and-set takes the copy, so it publishes once). Edits after scheduling stay in the draft.
- **Files**: `site_assets` holds images and fonts; `hidden_at` marks a deleted file a published page, a kept version or a Studio release's artwork still uses (still served and counted; released after the next publish that leaves nothing using it; `server/sites/images.js`). Storage: `inUseSql` in `server/creators/storage.js` now adds site files, and `quotaOf` in `server/creators/policy.js` is the one 550 MB cap for every kind of upload.
- **Templates**: `server/sites/templates.js`, four documents with placeholder words only and no files (`GET /api/studio/templates/:id`). Their buttons link only to AutoStacc addresses (a "Listen now" goes to New & upcoming, `/discover/explore`).
- **Roles** (built, phase 7): `creator_roles` beside `creator_members` (its CHECK allows only `owner` and `editor`, and migrations never rebuild tables), invitations in `creator_invites` ([creators](creators.md#teams-built-2026-10-15)). In the editor, members who can't publish see no Publish, Unpublish or schedule; the server refuses them anyway.
- **Community library**: see below (migration `0027_community_library.sql`).

## The editor (built)

`studio.html` loads the shared modules and the editor: `js/builder.js` (toolbar, tabs, save, publish, preview, files, history, schedule; keyboard: Delete, arrows to nudge, Ctrl/Cmd+D duplicate, Ctrl/Cmd+Z / Shift+Z / Y, Ctrl/Cmd+S, Escape), `builder-canvas.js` (the page in a same-origin iframe drawn by the shared renderer with `css/builder-canvas.css` on top: select, drag to move, also into another section, handles to resize, a section's bottom edge for its height, double-click to type into a heading or button; in phone view, drag to reorder and the bottom handle for a phone height), `builder-edit.js` (every change to the document, recorded for undo), `builder-panel.js` and `builder-fields.js` (the Edit and Site tabs, with a Layers list so everything can be reached by keyboard), `builder-add.js` (elements, section layouts, templates), `builder-files.js` (Files, History), `builder-model.js` (pure: element defaults, layouts, free spots, ids, undo history). Embeds show as placeholders in the editor (the Studio's CSP frames nothing), and the editor never runs the runtime. The Studio overview opens a profile with **Design your profile** (`#profile=<creator id>`) and a project with **Edit site** (`#project=<id>`).

## The trusted runtime (built)

`js/site-runtime.js`, standalone, no dependencies: motion as elements scroll in (`data-fx`; hover effects are CSS), slideshow arrows, keys and autoplay, tabs (ARIA tabs, arrow keys), a lightbox for galleries (drawn outside the contained page area so it can fill the window), countdowns (`data-countdown`, the finished text from `data-done`), and an audio player that draws a live waveform from the page's own `<audio>` with Web Audio while it plays (no network: the engine keeps no waveform for products' preview clips) and seeks on click. It uses `textContent` only and catches its own errors; all of it is off for reduced motion where it moves.

## Build order

1. **Built.** Document v2 and shared renderer: grid layout, section backgrounds, phone rules, automatic conversion of version 1, profile sites and their addresses.
2. **Built.** CSS checker and fonts: the stylesheet and class names, font and logo uploads, the combined storage cap.
3. **Built.** Visual editor: edit on the live page, drag and resize on the grid, undo / redo, phone view, pages and menu, the side panel.
4. **Built.** Templates: the four starters, offered when a site starts and any time under Add.
5. **Built.** Trusted library: `js/site-runtime.js` and its pieces (motion, slideshow, tabs, accordion, lightbox, audio player with waveform, countdown, store-link pieces).
6. **Built.** History and scheduling: last 20 publishes with restore, scheduled publishing.
7. **Built.** Roles: the four roles across the Studio API (capabilities in `server/creators/roles.js`), invitations by email, the Team panel.
8. **Built.** Community library: share, browse, install, report, Control Center takedown; selling pieces as store products.
9. **Built.** Finish: `/privacy`, licences and notes for roles and the library.

Phases 1–6 shipped together in one change, without the feature switch first planned: the new document would have broken the old form editor, so the editor replaced it in the same change.

## Community library (built)

- **Share** (`POST /api/studio/creators/:id/library`, `server/library/routes.js`): creators AutoStacc trusts, members whose role may share (`library.share`). An element, a section or the whole draft is checked like any document (`server/library/pieces.js` `cleanFragment`) and stripped of what is the creator's own (audio players, Follow buttons, the products a products element names); its images and fonts must be the creator's own files. Up to 50 shared pieces per creator, 100 KB each.
- **Sell**: a price (and the role that runs products) makes the piece a store product (the piece stays `pending`, unlisted and unusable, until its product is on sale; if that fails, neither exists) of type `template` (`data/product-types.js`, licence `templates` in `data/licenses.js`: use on your own sites, never reshare or resell), created and put on sale at once; its deliverable is the piece (`server/library/links.js`, `creators/readiness.js`). It is bought like any product.
- **Browse**: a paid piece you don't own comes as an outline only (its elements as plain boxes where they sit), never its words, settings or files; previews draw in a sandboxed frame.
- **Use** (`…/library/:id/install`, members who edit sites): free pieces, your own, or paid ones you own (else `402 buy_first` with the product's address). Using a bought piece is logged like a download, so its order can't be refunded by the buyer afterwards (the refunds page says so); and an installer's sites show a paid piece's files only while whoever installed it still owns it (by account or by the email it bought with). A refund and a use at the same moment can't both succeed: the refund claims its order first, and a use checks for that claim. The editor gets the fragment and its files and inserts it (element into the selected section, section after it, template replacing the draft after asking; undoable). `library_installs` records which creators installed what: their sites may show the piece's files (`sites/context.js`), and the editor lists them under Files as "From the library".
- **Storage**: a piece's files stay the seller's and count against them only. A file a shared piece uses is hidden, not deleted, if the seller deletes it. Deleting a piece takes its product off sale (buyers keep it, and can still use it); its files the seller's own sites don't use are released (no longer theirs to show or delete, `site_assets.released_at`, but still counted against them, so two accounts can't use it to pass the cap) while other creators' sites that installed it use them (installing your own piece counts for nothing), and deleted by the daily sweep once no site of a creator who installed it names them (`server/library/sweep.js`; pasting a file's public address into your own draft doesn't keep it); the seller can also delete a paid piece left pending; files of a piece nobody installed go at once.
- **Report and takedown**: anyone signed in reports a piece once (`library_reports`); the Control Center's Community library section takes pieces down, including ones their creator already deleted, and restores them to what they were, their product back on sale only if it was and is still ready ([admin](admin.md#community-library)). A paid piece whose product can't be put on sale isn't shared at all. A taken-down piece's files stop showing everywhere; words already copied into drafts stay.
- **Editor**: the Library tab (`js/builder-library.js`): search, filter, preview in its own frame, Use, Buy, Report, Delete your own; Share buttons on elements and sections and "Share as a template" under Site, for those who may share.

## Tests

`test/unit/builder.test.js` (document, CSS checker, renderer, templates, fonts), `test/api/builder.suite.js` (profiles, ownership, the address space, history, scheduling, CSS, fonts, storage, kept files, templates) `test/api/team.suite.js`, `test/api/library.suite.js` (trust, own files only, personal parts stripped, free and paid installs, deleting, reports and takedown) and `test/browser/builder.test.js` (template, edit, type, add, drag, undo / redo, phone view, publish, the public page's only script; CSS; teams; sharing and using a library piece; the editor on a phone). `BUILDER_SHOTS=<folder>` saves its screenshots.

The team test opens the Studio's **Team** tab first (the Studio's first screen has tabs since 2026-10-27, #221).
