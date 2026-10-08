---
title: Projects
summary: Projects on AutoStacc: the data contract, which features a project uses, Glitches & Stitches as the first project, and how to add another.
updated: 2026-10-08
---

# Projects

A project is a creator on AutoStacc: it publishes releases, products, Stacclets and Pacs, news, polls and relationships, and keeps its own identity. The platform treats every project the same; projects differ only in their data. Model: [architecture](architecture.md).

## Data contract (`data/projects.js`)

| Field | Meaning |
| --- | --- |
| `id` | lowercase-hyphenated, permanent; everything else points at it with `project: "<id>"` |
| `name` | as the project writes it (shown in credits: "by <name>") |
| `summary` | one plain-text line for the directory; only confirmed facts |
| `title`, `description` | its home page's search title and description |
| `features` | platform features it uses: `releases`, `news`, `shows`, `store`, `polls`, `relationships` |
| `pages` | its own pages, listed under it in the sidebar: `[{ label, path }]`, path relative to `/projects/<id>` (`""` = home, `"music"`, `"#shows"`) |
| `skin` | `true`: its pages load `css/projects/<id>/skin.css` (its own look inside the AutoStacc frame) |
| `sounds` | `true`: its pages load the UI sounds and easter eggs. Platform pages never play sounds |
| `entity` | its schema.org type (`MusicGroup`, `Person`, `Organization`) |
| `bio`, `tagline`, `genres`, `alternateNames`, `image`, `logo` | identity for its pages and structured data (alternate names only for search engines) |
| `email`, `pressKitUrl`, `newsletterAction`, `socials` | its own contact, press kit, newsletter form and official profiles (empty = not set; never made up) |
| `draft` | `true` keeps it out of the directory and the database sync |

Content names its project: products, releases and news posts carry `project`. Stacclets carry `project`; Pacs carry `stacclet` (their project comes from it). The build fails if any of these point at a project that doesn't exist.

## Glitches & Stitches

The first project (`glitches-and-stitches`). It uses every feature, including polls (community votes on unfinished music) and relationships (which tracks were built from which fragments; see [identity](identity.md)). Its pages are `/projects/glitches-and-stitches` (its home: hero, listen, latest, shows, about, the loop, newsletter) and `/music`, `/news`, `/press` under it, written by hand in `projects/glitches-and-stitches.html` and `projects/glitches-and-stitches/`; release and news pages are generated under the same address. It has a skin (the glitch terminal, [brand](brand.md)) and sounds. Its identity is owner-written in [identity](identity.md); facts in [artist](artist.md).

## Adding a project

1. Add an entry to `data/projects.js` with only the features it uses.
2. Give its products, releases, news, Stacclets and Pacs `project: "<id>"` (Pacs via their Stacclet).
3. Run `node scripts/build.js`; it validates every link and syncs the project into the store database.
4. It appears on `/projects`; customers can follow it; its products show "by <name>" and its content files itself in Your Stacc.

No platform code changes. Its home page is `projects/<id>.html` (copy a project page, set `data-project`; title and description come from its data entry) and any further pages go in `projects/<id>/`; a skin is `css/projects/<id>/skin.css` scoped to `.skin-<id>` (set `skin: true`), without one its pages use the AutoStacc look. Not built yet: a generated default home page for projects that don't want to write one.
