---
title: Modules
summary: Drop-in features: how a feature is placed on any page by attributes, each module's options, project looks, and the single-use app roots.
covers: [js/shop.js, js/product-card.js, js/store.js, js/projects.js, js/polls.js, js/release-feed.js, js/account-nav.js, js/layout.js, js/project-frame.js, js/util.js, js/news.js, js/shows.js, js/releases.js, js/music.js, js/newsletter.js, js/press.js, js/profiles.js, js/stacc-glance.js, js/library.js, js/dashboard.js, data/shows.js, css/projects/, scripts/lib/data.js, scripts/lib/pages.js]
updated: 2026-10-16
---

# Modules

The owner's rule: every feature is modular, so it can be used anywhere on the site, for any project. A feature is a **drop-in module** when a page uses it by placing an element with `data-*` attributes and loading the script, with no page-specific ids and no project hard-coded.

## The pattern

- One script finds every `[data-<feature>]` element and mounts on each (several per page are fine). Its options are attributes on that element; its header comment lists them.
- Templates that a module renders live in their own file and set one namespace on `GS` (e.g. `js/product-card.js` → `GS.productCard`).
- Project styling travels with the item: `GS.look(projectId)` returns `look-<id>` and loads `css/projects/<id>/look.css` (the project's colours, type, buttons and tiles). Inside a project's own pages the same rules apply through `.skin-<id>`. A project with `skin: true` ships both `look.css` (portable) and `skin.css` (page effects).
- A module's project is its `data-project`, else the open project's (`GS.moduleProject(el)`); `GS.wear(el, projectId)` puts that project's look on the module when it sits outside the project's own pages.
- Links between modules are shared helpers in `js/util.js` (`GS.shopItemPath`: a product's own page; `GS.projectPath`) and the same addresses in the generator (`projectPath` in `scripts/lib/data.js`, `shopItemPath` in `scripts/lib/pages.js`).

## Drop-in now

| Module | Element | Options |
| --- | --- | --- |
| Product grid (`js/shop.js` + `js/product-card.js`) | `[data-shop]` | `data-project`, `data-featured`, `data-limit`, `data-level`, `data-mixed` (store-style sizes: featured products as wide banner cards with a Preview button when they have a clip, the rest as artwork capsules whose name and price always show, with the description and buy button sliding out on hover (the buy button always shows on phones); the store uses them too); each card opens the product's own page |
| The store page (`js/store-browse.js`, `js/store-filters.js`, `js/store-suggest.js`, `js/store-sections.js`) | `[data-browse]`, `[data-store-sections]` | none: one per page, state in the address ([discovery](discovery.md)); sections elsewhere take `data-sections`, `data-brief`, `data-fallback` |
| Wishlist hearts (`js/wishlist.js`) | `[data-wish]` | the product id |
| What's inside (`js/product-contents.js`) | `[data-product-contents]` | the product id (else `?p=` in the address); hidden unless its files came from the Pack Builder ([discovery](discovery.md)) |
| Similar products (`js/similar.js`) | `[data-similar]` | the product id (else `?p=` in the address) |
| Buy buttons, live prices, status (`js/store.js`) | `[data-buy]`, `[data-price]`, `[data-status]` | the product id |
| Projects rack (`js/projects.js`) | `[data-project-list]` | `data-creator` (only that creator's projects, on its profile) |
| Project cards and follow controls (`js/project-card.js`, `js/follow.js`) | `[data-follow-slot]` | the project id, `data-name` |
| Projects to follow (`js/project-picks.js`) | `[data-project-picks]` | `data-limit`, `data-picks="following"` (the projects you follow instead) |
| Latest releases, news and shows (`js/latest.js`) | `[data-latest]` | `data-limit` (per list) |
| Projects browser, explore (`js/projects-browse.js`, `js/explore-browse.js`) | `[data-projects-browse]`, `[data-explore]` | none: one per page, state in the address ([browse](browse.md)) |
| DAW backdrop (`js/daw-stage.js`, `css/daw-stage.css`) | `[data-daw-stage]` | `[data-daw-hero]` on the element it sits behind (it stops moving when that is out of view) |
| New releases feed (`js/release-feed.js`) | `[data-release-feed]` | `data-limit`, `data-personal` (dashboard only: followed projects first, owned items marked) |
| Account links and menu (`js/account-nav.js`) | `[data-auth="in"\|"out"]`, `[data-account-menu]`, `[data-signout]` | |
| Site notice (`js/site-notice.js`) | every page's `<main>` (loaded after `js/account-nav.js`, in `scripts/lib/pages.js` too) | the owner's one-line notice from `GET /api/site-status`, text only; nothing when there's none |
| Polls (`js/polls.js`) | `[data-polls-for]` | the project id |
| News (`js/news.js`) | `[data-news]` | `data-project`, `data-limit`, `data-full` (whole posts as h2 sections, the news page; otherwise headlines and summaries as h3) |
| Shows (`js/shows.js`) | `[data-shows]` | `data-project` (shows carry `project` in `data/shows.js`; ticketed ones go into structured data once per project) |
| Releases (`js/releases.js`) | `[data-releases]` (a list) | `data-project`, `data-limit` |
| Official profiles (`js/profiles.js`) | `[data-profiles]` | `data-project` (music and press pages) |
| Listen player (`js/music.js`) | `[data-listen]` | `data-release` (a release page; counts a release view), else `featured` in `data/music.js` if it is the project's, else its newest; `data-project`; `data-links` (the release's streaming links under the player) |
| Newsletter sign-up (`js/newsletter.js`) | `[data-newsletter]` holding a `<form>` and a `.form-msg` (an empty element gets the standard form) | `data-project` (the list it joins); reads `?newsletter=<result>` from the confirmation link |
| Press contact (`js/press.js`) | `[data-press-contact]` | `data-project`; also wires `[data-copy="<id>"]` copy buttons |
| Your Stacc at a glance (`js/stacc-glance.js`) | `[data-stacc-glance]` | `data-project`, `data-limit` (latest additions, default 4); signed-out visitors get a log-in link; Auto-Stacc grants say "added by Auto-Stacc" |
| Your Stacc (`js/library.js`) | `[data-stacc]` | `data-project` (starts filtered to it), `data-stacc-view="kinds"` (starts by content type); a receipt's guest key is redeemed once per page. Its inner file area is `[data-stacc-files]`. Signed in, it also shows the person's collections, tags and saved searches (`js/library-personal.js`). |
| Frames (`js/layout.js`, `js/project-frame.js`) | `#site-header`, `#site-footer` (link columns: Explore with Community, Help with Guides, Legal with Copyright and Community rules) | the page's `data-project` |

Store items wear their project's look in the store, the new releases feed (home page, dashboard) and on their product page; clicking one opens the store filtered to its project with it selected at the top.

## Single-use by nature

The store and app pages keep one root each, because a page has one cart, one checkout and one form: cart (`#cart-app`), checkout (`#checkout-app`), login (`#auth-app`), settings (`#settings-app`), the creators' product page (`#product-app`), Studio (`#studio-app`), admin (`#admin-app`), and the dashboard's greeting (`[data-dashboard-hello]`, `js/dashboard.js`, which also sends an ended session to log in). Their parts (order list, cart lines) can still become modules when another page needs them. Every other feature is a drop-in (#52).
