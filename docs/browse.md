---
title: Browsing projects and content
summary: How visitors find projects and what they put out - the projects browser and its API, /explore for releases, news and shows, the home page hub, the dashboard's sections and Your Stacc search - and what each reads, keeps and sends.
covers: [projects.html, explore.html, index.html, dashboard.html, server/projects/browse.js, server/projects/routes.js, js/projects-browse.js, js/project-card.js, js/follow.js, js/project-picks.js, js/explore-items.js, js/explore-browse.js, js/latest.js, css/projects.css, css/explore.css, css/latest.css, css/home.css, css/dashboard.css, db/migrations/0013_projects_browse.sql]
updated: 2026-10-09
---

# Browsing projects and content

Owner decision 2026-10-09 ([decisions](decisions.md)): projects get their own browser, separate from the store; nothing is bought there. The other pages follow the store's lead with search, filters and sections. Real data only: nothing is invented to fill a page.

## Projects (`/projects`)

Every visible project: AutoStacc's own and published Studio projects of active creators. A Studio project is marked **Unverified creator** until AutoStacc trusts its creator. Anyone can follow it and switch on Auto-Stacc, verified or not.

- **API:** `GET /api/projects/browse` (`server/projects/browse.js`).
  - Parameters: `q`, `genre`, `style`, `makes` (comma lists of lowercase words), `active=1`, `followed=0|1` (signed in only; ignored otherwise), `sort=active|name|newest|items`, `page`.
  - Unknown genre, style or makes values are skipped and reported in `ignored`. Malformed input is a 400 `invalid_filter`.
  - The answer holds: `total`, `page`, `pages`, `projects`, `facets` (`genre`, `style`, `makes`, each count worked out without its own group), `toggles` (`active`, `followed`), `signedIn` and `canFollow`.
  - Filters are OR within a group and AND between groups, worked out in the module over all visible projects (few enough today; move to SQL when the directory grows).
  - Signed in, the answer is `private, no-store`; otherwise `public, max-age=60`.
- **What a project says about itself** is only derived from records:
  - genres and styles come from AutoStacc's data (`projects.genres`, synced from `data/projects.js`) and from the facets of its published products;
  - "what it makes" is its published product kinds, plus "Releases" when it has releases;
  - activity is the newest release, news post or published product, and the next show (`projects.activity`, synced from `data/music.js`, `news.js` and `shows.js`; drafts never count);
  - "recently active" means active in the last 30 days or a show within 60.
  - A project shows how many store items it has and links to `/shop?creator=<id>`, never a price or a buy button.
- **Page:** `js/projects-browse.js` keeps its state in the address (`/projects?genre=edm&active=1`) and has a phone drawer, chips and pages, the same as the store. Offline, it keeps the built list of AutoStacc's projects.
- **Cards:** `js/project-card.js` (`GS.projectCard`).
- **Follow controls:** `js/follow.js`, a drop-in for any `[data-follow-slot]`. It tells other features who is followed (`gs:follows`).

## Releases, news and shows (`/explore`)

`/music` and `/news` stay redirects to Glitches & Stitches' own pages, so the platform view is a new page. It has three views as tabs:

- **Releases**, filtered by project, type and year;
- **News**, filtered by project, topic and year;
- **Shows**, upcoming only, filtered by project and city.

It reads `data/music.js`, `news.js` and `shows.js`; drafts and past shows never appear. The rules are in `js/explore-items.js` (`GS.exploreItems`, unit-tested) and the page is `js/explore-browse.js`. The address holds the state (`/explore?view=news&project=...`). Only first-party projects have this data today. Studio projects' events blocks live in their site documents and aren't listed.

## Home page hub (`/`)

The home page has, in order:

- the cover;
- a store search and three ways in (Store, Projects, Releases, news and shows);
- two store sections from the store's recommendations, with the same tune, forget and turn-off controls (`[data-store-sections data-sections="2" data-brief]`). The featured products show instead while the store has no picks;
- **Projects to follow** (`js/project-picks.js`), ordered by how well their genres match this browser's own history (`js/taste.js`, read on the device and never sent), leaving out projects already followed;
- **Latest from the projects** (`js/latest.js`), with followed projects first;
- How it works.

## Dashboard

The dashboard has:

- a Your Stacc search (`/library?q=`);
- Your Stacc at a glance and new releases;
- **Projects you follow** (`data-picks="following"`);
- the latest from the projects;
- **Projects to try**;
- account shortcuts.

## Your Stacc

Search narrows the files as you type. Every word must appear in the file's name, its file name or its product title (`js/stacc-model.js`). The count says how many files match, with a button to clear search and filters. On `/library` the view, search and filters live in the address (`?q=&project=&kind=&format=&view=kinds`).

## Privacy

Searches and filters on `/projects` and `/explore` join the store's on-device history under its existing rules: 90 days, forget, turn off. The home page reads that history without sending it. `/privacy` says so (`data/legal.js`).

Tests:

- `test/api/projects.suite.js`: browse, filters, Studio visibility, trust and suspension, follows.
- `test/unit/explore-items.test.js`.
- `test/unit/stacc-model.test.js`: search.
- `test/browser/features.test.js`: discovery pages.
