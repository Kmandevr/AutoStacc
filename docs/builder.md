---
title: Visual builder
summary: PLANNED (owner, 2026-10-15): one visual, Wix-like editor for creator profiles and project sites (free grid, edit on the live page, templates, checked CSS, AutoStacc's trusted interactive library, a shared community library with paid pieces, roles, version history, scheduling, fonts, one storage cap); the decisions and the build order.
updated: 2026-10-15
---

# Visual builder

> **PLANNED.** The owner's answers of 2026-10-15, turned into a build plan. It replaces the Studio's form-based block editor ([creators](creators.md#the-studio-studio)) with one visual editor. Each phase is marked as it is built; nothing below exists until its phase says **Built**. Decisions: [decisions](decisions.md#2026-10-15-the-visual-builder).

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
- **At the cap only new uploads stop.** Live sites and products stay up.
- **A deleted template's images stay** while any site still uses them, and stop counting against the seller once the template is deleted (proposed by Claude, following the rule that buyers keep what they own).

## How it stays safe

The rules in [creators](creators.md#how-creator-pages-stay-safe) still hold; these are the changes:

- **Still no creator HTML or JavaScript.** A site is still a JSON document that the server checks and renders itself. The grid adds positions (`x`, `y`, `w`, `h` in grid units), section backgrounds, class names and settings for the trusted pieces, all checked values.
- **CSS is parsed and rebuilt, never pasted.** The server's checker (a new module, server/sites/css.js) reads the stylesheet into rules and declarations and writes a new one. Every selector is put under the page area (`.cs-site …`), so `body`, `html`, `:root`, the AutoStacc strip and the footer can't be reached. Refused: `@import`, `@font-face`, `@namespace`, `@charset`, `url()` other than the creator's own images and fonts, `image-set()`, `expression()`, `behavior`, `-moz-binding`, backslash escapes, `<`, nesting (`&`), and anything over the size limit. The page area itself is `contain: paint` and `isolation: isolate`, so even `position: fixed` stays inside it and nothing can be drawn over the strip.
- **One trusted script.** The page's CSP changes from `script-src 'none'` to the address of AutoStacc's runtime (/js/site-runtime.js, new) only. `connect-src`, forms and frames stay as they are. The runtime reads the settings the server wrote into `data-` attributes; it never evaluates anything a creator typed. Every piece works without it (all slides shown, every tab open, plain audio controls).
- **Fonts are checked by their bytes** (the `wOF2` signature) and served from `/media/sites/<id>` like images, with `font-src` allowing only them and the curated Google Fonts.
- **Shared and bought pieces** are copied into the buyer's document as data and checked again like anything the buyer typed. Their images stay the seller's, so a document may show its creator's own images **and** images of pieces its creator installed.

## Data

- **Site document version 2** (`server/sites/document.js`):
  `{ version: 2, theme: { preset, accent, font, fontAsset?, logo?, css }, nav: [{ label, page | url }], pages: [{ slug, title, sections: [{ id, height, background, cls, elements: [{ id, type, box: { x, y, w, h }, phone: { hidden, order, h }, cls, effect, …fields }] }] }] }`.
  A version 1 document (a list of blocks per page) converts to one section per page with the blocks stacked in full-width rows, so a converted site looks as it did.
- **Shared renderer.** The HTML is written by one pure module shared by the server and the editor (js/site-render.js, new, shared the way `js/pack-diff.js` is), so what the editor shows is what visitors get.
- **Profile sites**: `creator_sites` (draft, published, version) and `profile_pages`, served at `/<creator>` and `/<creator>/<page>`. A profile page's address and a project's address share one namespace per creator; each refuses a name the other uses.
- **History**: `site_versions` (the last 20 published documents per site).
- **Scheduling**: `scheduled_at` with a snapshot of the draft; published by the next visit to the site after that time or by the daily sweep, whichever comes first.
- **Roles**: `creator_members.role` gains `admin`, `publisher`, `store_manager` (the existing `editor` stays: drafts only); invitations by email, accepted while signed in with that address.
- **Community library**: `library_pieces` (kind section, element or template; the checked fragment; trusted creators only), `library_installs`, `library_reports`. A paid piece is a store product of kind `template` with no file; owning it allows installing it.

## Build order

Each phase merges with the feature switch `studio.visualBuilder` off until the editor is complete, so the live Studio keeps working.

1. **Document v2 and shared renderer**: grid layout, section backgrounds, phone rules, automatic conversion of version 1, profile sites and their addresses.
2. **CSS checker and fonts**: the stylesheet and class names, font and logo uploads, the combined storage cap.
3. **Visual editor**: edit on the live page, drag and resize on the grid, undo / redo, phone view, pages and menu, the side panel.
4. **Templates**: the four starters, a template picker for new sites and profiles.
5. **Trusted library**: js/site-runtime.js and its pieces (motion, slideshow, tabs, accordion, lightbox, audio player with waveform, countdown, store-link pieces).
6. **History and scheduling**: last 20 publishes with restore, scheduled publishing.
7. **Roles**: the four roles across the Studio API, invitations.
8. **Community library**: share, browse, install, report, Control Center takedown; selling pieces as store products.
9. **Switch on**: remove the old editor, turn `studio.visualBuilder` on, update [creators](creators.md), `/privacy` and the terms.
