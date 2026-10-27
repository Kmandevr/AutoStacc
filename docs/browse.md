---
title: Browsing projects and content
summary: How visitors find projects and what they put out - the projects and creators browsers and their APIs, /explore for releases and events, the /events calendar, the home page hub, the dashboard's sections and Your Stacc search - and what each reads, keeps and sends.
covers: [discover.html, js/discover.js, css/discover.css, server/projects/creators.js, js/creators-browse.js, css/creators.css, explore.html, index.html, dashboard.html, server/projects/browse.js, server/projects/routes.js, js/projects-browse.js, js/project-card.js, js/follow.js, js/project-picks.js, js/explore-items.js, js/explore-browse.js, js/latest.js, js/daw-stage.js, css/daw-stage.css, css/cover.css, css/projects.css, css/explore.css, css/latest.css, css/home.css, css/dashboard.css, db/migrations/0013_projects_browse.sql, js/project-content.js, server/content/content.js, server/content/calendar.js, server/content/events.js, js/events-calendar.js, css/events.css, js/browse-shelves.js, css/shelves.css, server/spotlight/, server/projects/personality.js, js/studio-personality.js, js/admin-spotlight.js, db/migrations/0065_project_personality.sql, db/migrations/0066_spotlight_picks.sql]
updated: 2026-10-27
---

# Browsing projects and content

Owner decision 2026-10-09 ([decisions](decisions.md)): projects get their own browser, separate from the store; nothing is bought there. The other pages follow the store's lead with search, filters and sections. Real data only: nothing is invented to fill a page.

## Building blocks (owner, 2026-10-22, #207)

- **Project cards** (`js/project-card.js`) are AutoStacc's glass with the project's **personality**: the art tile wears the project's own look, and an accent (a track colour) and a small signature animation (pulse, glitch, wave or none; once as the card arrives, again on hover or focus, never for reduced motion) come from the Studio's presets (`project_personality`, `GET`/`PUT /api/studio/projects/:id/personality`, `js/studio-personality.js`), else `data/projects.js` `personality`, else the defaults. Every card has a type label (`.card-type`: Project, Creator, Community...). `compact` is a poster card for rows.
- **Browse layout** (`js/browse-shelves.js`, `css/shelves.css`, `GS.shelves`): a spotlight banner, sideways rows that snap (arrows with a mouse, a See all end card) shown only from 4 items, and tabs.
- **Spotlight:** the admins' picks first (Control Center › Manage › Spotlight, `server/spotlight/`, `spotlight_picks`, audited; public `GET /api/spotlight?page=discover|store|explore`, ids only), then a fair rotation the page computes from what it already lists: a new order each day (a stable hash of the date and id), so every creator gets equal turns and nothing is ranked by popularity (ranking stays an open question in [vision](vision.md)).

## Discover (`/discover`; owner, 2026-10-22, #208)

One page for creators, projects and communities, never products, with link tabs `?tab=all|creators|projects|communities` (`js/discover.js` removes the closed tabs' panels before the browsers below run, so only the open one loads; each browser keeps `tab` in the address). **All** is the spotlight (picks, then the fair rotation) and rows: Active this month, New on AutoStacc, Creators, one per genre, Communities (from `GET /api/community/spaces`); rows need 4 items, and while there are few the page leads with the spotlight and a "Become a creator" invitation. **Communities** lists every public space. `/projects` and `/creators` answer a 301 to the matching tab. The sections below describe the Projects and Creators tabs.

## Projects (`/discover?tab=projects`)

Every visible project: AutoStacc's own and published Studio projects of active creators. A Studio project is marked **Unverified creator** until AutoStacc trusts its creator. Anyone can follow it and switch on Auto-Stacc, verified or not. The follow control says what each does: following lists new releases (paid ones still need buying); Auto-Stacc, off until switched on, adds the project's free items to Your Stacc.

- **API:** `GET /api/projects/browse` (`server/projects/browse.js`).
  - Parameters: `q`, `genre`, `style`, `makes` (comma lists of lowercase words), `active=1`, `followed=0|1` (signed in only; ignored otherwise), `sort=active|name|newest|items`, `page`.
  - Unknown genre, style or makes values are skipped and reported in `ignored`. Malformed input is a 400 `invalid_filter`.
  - The answer holds: `total`, `page`, `pages`, `projects`, `facets` (`genre`, `style`, `makes`, each count worked out without its own group), `toggles` (`active`, `followed`), `signedIn` and `canFollow`.
  - Filters are OR within a group and AND between groups, worked out in the module over all visible projects (few enough today; move to SQL when the directory grows).
  - The answer is never cached (`private, no-store`): it depends on who asks, and a signed-out copy must not outlive logging in. 120 requests a minute per client (`limit(app, "browse")`).
- **What a project says about itself** is only derived from records:
  - genres and styles come from AutoStacc's data (`projects.genres`, synced from `data/projects.js`) and from the facets of its published products;
  - "what it makes" is its published product kinds, plus "Releases" when it has releases;
  - activity is the newest release or published product, and the next event (read at request time from the Studio's `project_releases` and `project_events` tables by `contentDates` in `server/content/content.js`; drafts and deleted items never count, and hidden news doesn't either, #174. The old `projects.activity` column is no longer written or read);
  - "recently active" means active in the last 30 days or an event within 60.
  - A project shows how many store items it has and links to `/shop?creator=<id>`, never a price or a buy button.
- **Page:** `js/projects-browse.js` keeps its state in the address (`/discover?tab=projects&genre=edm&active=1`) and has a phone drawer, chips and pages, the same as the store. Offline, it keeps the built list of AutoStacc's projects.
- **Cards:** `js/project-card.js` (`GS.projectCard`).
- **Follow controls:** `js/follow.js`, a drop-in for any `[data-follow-slot]`. It tells other features who is followed (`gs:follows`).

## Creators (`/discover?tab=creators`)

Built 2026-10-21 (owner: "all projects should be credited projects"). The people and teams behind the projects, browsable on their own; linked from the sidebar's Projects group and the footer.

- **Who is listed:** AutoStacc's own creators (`data/creators.js`) and Studio creators that are active, published and not deleted and have at least one published project. Suspended, unpublished or deleted creators and creators with no visible project never appear, nor do their projects. A Studio creator is marked **Unverified creator** until AutoStacc trusts it, as in the store.
- **API:** `GET /api/creators` (`server/projects/creators.js`, routed in `server/projects/routes.js`). Parameters: `q` (creator and project names, up to 80 characters), `sort=name|newest|projects`, `page` (24 a page). Malformed input is a 400 `invalid_filter`. The answer holds `total`, `page`, `pages`, `sort` and `creators`, each with only `name`, `slug`, `path`, `firstParty`, `verified` and its visible `projects` (name and address): what its `/<creator>` profile already shows. Nothing depends on who asks, so it is cached publicly for a minute; 120 requests a minute per client (`limit(app, "browse")`).
- **Page:** the Creators tab of `discover.html` (head, canonical and sitemap entry from the build; a plain built list of first-party creators between `<!-- creators:start -->` markers), enhanced by `js/creators-browse.js` (`css/creators.css`). Each card: name, its initial as avatar, a short bio only for first-party creators (their `summary`, read in the browser from `data/creators.js`), its projects and a link to `/<creator>`. The address holds the state (`/creators?q=&sort=&page=`). Offline, the page keeps its built list.

## New & upcoming: releases and events (`/explore`)

`/music` and `/news` stay redirects to Glitches & Stitches' pages (`/news` now to its home, since news is hidden, #174), so the platform view is a page of its own. It has two views as tabs:

- **Releases**, filtered by project, type and year;
- **Events**, upcoming only, filtered by project, city and month, with a link to the `/events` calendar.

Each view also has a search box. It reads the newest published releases and upcoming events from `GET /api/content/latest` (up to 50 of each, through `js/project-content.js`); drafts and past events never appear. The rules are in `js/explore-items.js` (`GS.exploreItems`, unit-tested) and the page is `js/explore-browse.js`. The address holds the state (`/explore?view=events&q=&project=...`; the old `view=shows` opens events, and `view=news` falls back to releases). Every creator's Studio-made releases and events are listed; a Studio site's hand-typed events stay in its site document and aren't.

## Events calendar (`/events`)

Built 2026-10-21 (owner, #178). The site's public calendar of what is happening where and when, so nobody has to search the site for it. It is server-rendered and cached (`server/content/calendar.js`, through `functions/[[path]].js`) and the same page for everyone, signed out included.
- **Views:** a month (a table of days you can move through with the arrow keys, `js/events-calendar.js`) or a list of event cards. Each card has the event's date, title, place and host and is styled like product and project cards (`css/events.css`). Phones get the list.
- **Filters:** a date range or month, city, country and host (a creator), as a plain GET form that works without JavaScript and is checked on the server (`server/content/events.js`).
- **Following:** a signed-in visitor also gets a **Following** filter, the events of the projects they follow (`GET /api/events?following=1`, private and never cached; follows already exist, so nothing new is collected).
- Each card links to the event's own page with "Add to calendar" ([creators](creators.md#music-and-events)). The page is indexable and listed in `/sitemap-content.xml` ([seo](seo.md)). Explore links to it.

## Home page hub (`/`)

**Shorter since 2026-10-22 (owner, #208):** the banner is the headline, the store search and two buttons (no lead, note or scroll cue, and no separate search and "ways in" block); store picks and the latest releases and events share one **New on AutoStacc** section; **Discover** shows four poster cards (`js/project-picks.js` `data-compact`) instead of "Projects to follow"; "How it works" is gone (it lives in /guide and /about); the closing sign-up box shows only signed out. About 2,500px on a phone, from about 4,400. The list below predates this and is kept for the parts that didn't change.

The home page has, in order:

- the banner: the cover's headline and buttons over a DAW arrange view drawn in code (`js/daw-stage.js`, `css/daw-stage.css`; lanes of clips in the track colours, a playhead the arrangement scrolls past, mixer meters). It takes about 85% of the first screen and is fixed behind the page: every section after it is frosted and slides over it like a curtain, so the studio stays faintly visible to the bottom. It is decorative (`aria-hidden`), follows the light or dark theme (owner decision 2026-10-16; it was always dark before), stops moving once the hero is scrolled away, and never moves for visitors who ask for less motion (owner decision 2026-10-09);
- a store search and three ways in (Store, Projects, Releases and events);
- two store sections from the store's recommendations, with the same tune, forget and turn-off controls (`[data-store-sections data-sections="2" data-brief]`). The featured products show instead while the store has no picks;
- **Projects to follow** (now the home page's Discover row; `js/project-picks.js`), ordered by how well their genres and styles match this browser's own history (`js/taste.js`, read on the device and never sent), leaving out projects already followed;
- **Latest from the projects** (`js/latest.js`), with followed projects first;
- How it works;
- a closing call to create an account and follow artists for their free releases.

On every visit the AutoStacc mark in the sidebar rail (computers) or top bar (phones) plays a short intro: its four bars drop and stack into place, bottom row first, in about a second, then rest (owner, 2026-10-21; `css/cover.css`, home only through `body[data-page="home"]`). It only moves the bars, so content and input are never delayed; under reduced motion it is the still mark.

## Dashboard (your home at `/`)

Since 2026-10-22 (owner, #208) a signed-in visitor's `/` is this page: `functions/_middleware.js` runs `guardHome` (`server/pages/guard.js`) for `/` only (Pages serves a root `index.html` before an index Function would run, so it has to be the middleware; `scripts/dist.js` keeps `/` routed to the Functions), which checks the session only when a session cookie is sent and then serves `dashboard.html`, no-store and `Vary: Cookie`; everyone else gets the public cover. `/dashboard` sends a signed-in visitor to `/` (signed out, it still goes to login).

The dashboard has:

- a Your Stacc search (`/library?q=`);
- Your Stacc at a glance and new releases;
- **Projects you follow** (`data-picks="following"`);
- the latest from the projects;
- **Projects to try**;
- account shortcuts.

## Your Stacc

Search narrows the files as you type; the box and its count line are drawn once and kept, so focus, the phone keyboard and the screen-reader announcement of the count survive each redraw. Every word must appear in the file's name, its file name, its product title, its folder or the person's own tags (`js/stacc-model.js`). The count says how many files match, with a button to clear search and filters. On `/library` the view, search and filters live in the address (`?q=&project=&kind=&format=&collection=&tag=&view=kinds`); collections, tags and saved searches are the person's own ([library](library.md)).

## Loading

Every list on these pages (the projects and creators browsers, Explore, the calendar's Following filter, the home hub's sections, the dashboard and Your Stacc) shows placeholders shaped like its cards or rows while it loads, through `GS.skeleton` ([modules](modules.md#shared-helpers-every-feature-uses)).

## Privacy

Searches and filters on Discover's Projects tab and `/explore` join the store's on-device history under its existing rules: 90 days, forget, turn off. The home page reads that history without sending it. `/privacy` says so (`data/legal.js`).

Tests:

- `test/api/projects.suite.js`: browse, filters, Studio visibility, trust and suspension, follows.
- `test/api/creators-browse.suite.js`: who `/api/creators` lists, what it says, search, sort and bad input.
- `test/browser/creators.test.js` and `test/browser/loading.test.js`: the creators page and the loading placeholders.
- `test/unit/explore-items.test.js`.
- `test/unit/stacc-model.test.js`: search.
- `test/browser/features.test.js`: discovery pages.
