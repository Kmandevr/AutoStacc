---
title: Modules
summary: Drop-in features: how a feature is placed on any page by attributes, project looks, and which features still need converting.
covers: [js/shop.js, js/product-card.js, js/store.js, js/projects.js, js/polls.js, js/release-feed.js, js/account-nav.js, js/layout.js, js/project-frame.js, js/util.js, js/news.js, js/shows.js, js/releases.js, js/music.js, js/newsletter.js, js/press.js, css/projects/, scripts/lib/data.js, scripts/lib/pages.js]
updated: 2026-10-09
---

# Modules

The owner's rule: every feature is modular, so it can be used anywhere on the site, for any project. A feature is a **drop-in module** when a page uses it by placing an element with `data-*` attributes and loading the script, with no page-specific ids and no project hard-coded.

## The pattern

- One script finds every `[data-<feature>]` element and mounts on each (several per page are fine). Its options are attributes on that element; its header comment lists them.
- Templates that a module renders live in their own file and set one namespace on `GS` (e.g. `js/product-card.js` → `GS.productCard`).
- Project styling travels with the item: `GS.look(projectId)` returns `look-<id>` and loads `css/projects/<id>/look.css` (the project's colours, type, buttons and tiles). Inside a project's own pages the same rules apply through `.skin-<id>`. A project with `skin: true` ships both `look.css` (portable) and `skin.css` (page effects).
- Links between modules are shared helpers in `js/util.js` (`GS.shopItemPath`, `GS.projectPath`) and the same addresses in the generator (`projectPath` in `scripts/lib/data.js`, `shopItemPath` in `scripts/lib/pages.js`).

## Drop-in now

| Module | Element | Options |
| --- | --- | --- |
| Store browser (`js/shop.js` + `js/product-card.js`) | `[data-shop]` | `data-project`, `data-featured`, `data-limit`, `data-filters="project type"`, `data-level`, `data-url` (state in the address: `/shop?project=&type=&item=`) |
| Buy buttons, live prices, status (`js/store.js`) | `[data-buy]`, `[data-price]`, `[data-status]` | the product id |
| Projects rack (`js/projects.js`) | `[data-project-list]` | `data-creator` (only that creator's projects, on its profile) |
| New releases feed (`js/release-feed.js`) | `[data-release-feed]` | `data-limit`, `data-personal` (dashboard only: followed projects first, owned items marked) |
| Account links and menu (`js/account-nav.js`) | `[data-auth="in"\|"out"]`, `[data-account-menu]`, `[data-signout]` | |
| Polls (`js/polls.js`) | `[data-polls-for]` | the project id |
| Frames (`js/layout.js`, `js/project-frame.js`) | `#site-header`, `#site-footer` | the page's `data-project` |

Store items wear their project's look in the store, the new releases feed (home page, dashboard) and on their product page; clicking one opens the store filtered to its project with it selected at the top.

## Still bound to one page (to convert)

Each of these looks up fixed ids and should become `[data-<feature>]` with attributes (tracked in #52): news (`#news-list`, `#latest-news`), shows (`#show-list`), releases (`#release-list`, `#artist-profiles`), listen player (`#listen-player`, `#listen-platforms`), newsletter (`#newsletter-form`, `#newsletter-msg`), press (`#press-contact`, `#press-profiles`), Your Stacc (`#library-app`), and the single-use app pages: cart (`#cart-app`), checkout (`#checkout-app`), login (`#auth-app`), settings (`#settings-app`), the creators' product page (`#product-app`), Studio (`#studio-app`), the dashboard (`[data-dashboard-*]`, page-specific) and admin. The store pages' `#*-app` roots are single-use by nature (one cart per page), but their parts (order list, cart lines) can still become modules when another page needs them.
