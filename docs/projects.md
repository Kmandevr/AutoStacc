---
title: Projects
summary: Projects on AutoStacc: the data contract, which features a project uses, Glitches & Stitches as the first project, and how to add another.
updated: 2026-10-07
---

# Projects

A project is a creator on AutoStacc: it publishes releases, products, Stacclets and Pacs, news, polls and relationships, and keeps its own identity. The platform treats every project the same; projects differ only in their data. Model: [architecture](architecture.md).

## Data contract (`data/projects.js`)

| Field | Meaning |
| --- | --- |
| `id` | lowercase-hyphenated, permanent; everything else points at it with `project: "<id>"` |
| `name` | as the project writes it (shown in credits: "by <name>") |
| `summary` | one plain-text line for the directory; only confirmed facts |
| `home` | the project's main page on this site (root-relative) |
| `features` | platform features it uses: `releases`, `news`, `shows`, `store`, `polls`, `relationships` |
| `draft` | `true` keeps it out of the directory and the database sync |

Content names its project: products, releases and news posts carry `project`. Stacclets carry `project`; Pacs carry `stacclet` (their project comes from it). The build fails if any of these point at a project that doesn't exist.

## Glitches & Stitches

The first project (`glitches-and-stitches`). It uses every feature, including polls (community votes on unfinished music) and relationships (which tracks were built from which fragments; see [identity](identity.md)). Its pages are the current home page, `/music`, `/news` and `/press`. Its identity is owner-written in [identity](identity.md); facts in [artist](artist.md).

## Adding a project

1. Add an entry to `data/projects.js` with only the features it uses.
2. Give its products, releases, news, Stacclets and Pacs `project: "<id>"` (Pacs via their Stacclet).
3. Run `node scripts/build.js`; it validates every link and syncs the project into the store database.
4. It appears on `/projects`; customers can follow it; its products show "by <name>" and its content files itself in Your Stacc.

No platform code changes. Not built yet: a generated page per project (`/projects/<id>`) and per-project theming; add them when the second project needs them (`scripts/lib/pages.js` template plus one line in `build.js`).
