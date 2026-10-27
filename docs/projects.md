---
title: Projects
summary: Projects on AutoStacc: the data contract, which features a project uses, Glitches & Stitches as the first project, and how to add another.
covers: [data/projects.js, data/creators.js, scripts/lib/platform.js, scripts/lib/platform-catalog.js, scripts/lib/creator-page.js, js/project-frame.js, js/util.js, css/projects/, autostacc/, autostacc.html, js/project-content.js, js/project-events.js]
updated: 2026-10-22
---

# Projects

A project is creative work owned by a creator ([creators](creators.md)), at `/<creator>/<project>`: it publishes releases, events, products (with their Stacclets and Pacs), polls and relationships, and keeps its own identity. The platform treats every project the same; projects differ only in their data. Model: [architecture](architecture.md).

## Data contract (`data/projects.js`)

| Field | Meaning |
| --- | --- |
| `id` | lowercase-hyphenated, permanent; everything else points at it with `project: "<id>"` |
| `name` | as the project writes it (shown in credits: "by <name>") |
| `creator` | the creator that owns it (`data/creators.js`); its pages live at `/<creator>/<id>` |
| `summary` | one plain-text line for the directory; only confirmed facts |
| `title`, `description` | its home page's search title and description |
| `features` | platform features it uses: `releases`, `events`, `store`, `polls`, `relationships` (`events` gives it the server-rendered events list at `/<creator>/<id>/events`) |
| `pages` | its own pages, the nav of its own header (on its pages only): `[{ label, path }]`, path relative to `/<creator>/<id>` (`""` = home, `"music"`, `"events"`) |
| `logoFull` | optional `{ src, width, height }` of its full logo: the heading of its project card (Discover, dashboard), which wears its look |
| `wordmark` | optional lettering for its header logo (else its name); an `&` in it can be styled (`.ph-amp`) |
| `skin` | `true`: its pages load `css/projects/<id>/skin.css` (its own look inside the AutoStacc frame); synced with `sounds` and `entity` into `projects.look`, so its server-rendered release and event pages wear it too |
| `sounds` | `true`: its pages load the UI sounds and easter eggs. Platform pages never play sounds |
| `entity` | its schema.org type (`MusicGroup`, `Person`, `Organization`) |
| `bio`, `tagline`, `genres`, `alternateNames`, `image`, `logo` | identity for its pages and structured data (alternate names only for search engines); `logo` also sits beside the wordmark in its header, linking to its home. `genres` are also the store genre of its products that state none ([discovery](discovery.md)); a store item from any project links to the item's own page (`GS.shopItemPath` in `js/util.js`; its other shared helpers, such as `GS.say` and the cart count, are platform-wide) |
| `email`, `pressKitUrl`, `newsletterAction`, `socials` | its own contact, press kit, newsletter form and official profiles (empty = not set; never made up) |
| `draft` | `true` keeps it out of the directory and the database sync |

This contract is for first-party projects in `data/`. Projects made in the Studio exist only in the database and have no such entry ([creators](creators.md)); they are listed on `/projects` and can be followed, marked unverified until their creator is trusted ([browse](browse.md)). Every project is also credited to its creator on `/creators`, the creators directory: a creator is listed there while at least one of its projects is visible ([browse](browse.md#creators-creators)).

Polls (`data/polls.js`) and relationships in `data/` name their project and are synced to the store database by `db/catalog.sql` like projects; the build fails if one points at a project that doesn't exist (`scripts/lib/platform.js`). **Products, Stacclets, Pacs, releases and events are not in `data/`** (owner, 2026-10-21, #176, #178): every project, first-party included, makes them in the Studio (the Product Studio and Pack Builder, and the Music and Events editors), and they live in the store database ([creators](creators.md#music-and-events)). data/products.js, `stacclets.js` and `pacs.js` were retired; `data/product-types.js` stays. Its pages read releases and events from the content API with `js/project-content.js` (`GS.content`): `[data-events]` lists only its project's upcoming events (`js/project-events.js`). News is hidden until the creator's community opens ([community](community.md)).

## Glitches & Stitches

The first project (`glitches-and-stitches`). It uses every feature, including polls (community votes on unfinished music) and relationships (which tracks were built from which fragments; see [identity](identity.md)). Its pages are `/autostacc/glitches-and-stitches` (its home: hero, listen, latest, shop, events, about, the loop, polls when there are any, newsletter) and `/music`, `/events` (server-rendered) and `/press` under it, written by hand in `autostacc/glitches-and-stitches.html` and `autostacc/glitches-and-stitches/` from drop-in modules ([modules](modules.md)). Those hand-written pages, with their skin (the glitch terminal, [brand](brand.md)), sounds and scripts, are the **only** first-party exception (owner, 2026-10-21). Its products, releases and events are run in the Studio like any creator's, by the members of `autostacc` (its owner is the account the `FIRST_PARTY_OWNERS` secret names, #172). Its release and event pages are rendered by the server, in its skin; its old news addresses redirect to its home (#174). Since 2026-10-22 (owner) it has its own community space at `/autostacc/glitches-and-stitches/community` (feature `community`, linked from its nav, AutoStacc's admins as its team) and a card personality in `data/projects.js` (`personality: { accent: "lime", motion: "glitch" }`). Its identity is owner-written in [identity](identity.md); facts in [artist](artist.md).

## Adding a project

1. Add an entry to `data/projects.js` with only the features it uses.
2. Its products, releases and events are made in the Studio by its creator's members (a first-party creator's owner is the account named in the `FIRST_PARTY_OWNERS` secret, [store-setup](store-setup.md)).
3. Give it a `creator` (an entry of `data/creators.js`; first-party projects belong to `autostacc`). Run `node scripts/build.js`; it validates every link and syncs the project into the store database.
4. It appears on Discover (Projects tab and the A–Z list), under its creator on the Creators tab, and on its creator's generated profile (`/<creator>`, `scripts/lib/creator-page.js`); customers can follow it; its products show "by <name>" and its content files itself in Your Stacc.

No platform code changes. Its home page is `<creator>/<id>.html` (copy a project page, set `data-project`; title and description come from its data entry) and any further pages go in `<creator>/<id>/`; a skin is `css/projects/<id>/skin.css` scoped to `.skin-<id>` (set `skin: true`), without one its pages use the AutoStacc look. Not built yet: a generated default home page for projects that don't want to write one.
