---
title: Modules
summary: Drop-in features: how a feature is placed on any page by attributes, project looks, and which features still need converting.
updated: 2026-10-08
---

# Modules

The owner's rule: every feature is modular, so it can be used anywhere on the site, for any project. A feature is a **drop-in module** when a page uses it by placing an element with `data-*` attributes and loading the script, with no page-specific ids and no project hard-coded.

## The pattern

- One script finds every `[data-<feature>]` element and mounts on each (several per page are fine). Its options are attributes on that element; its header comment lists them.
- Templates that a module renders live in their own file and set one namespace on `GS` (e.g. `js/product-card.js` → `GS.productCard`).
- Project styling travels with the item: `GS.look(projectId)` returns `look-<id>` and loads `css/projects/<id>/look.css` (the project's colours, type, buttons and tiles). Inside a project's own pages the same rules apply through `.skin-<id>`. A project with `skin: true` ships both `look.css` (portable) and `skin.css` (page effects).
- Links between modules are shared helpers in `js/util.js` (`GS.shopItemPath`, `GS.projectPath`) and the same address in the generator (`scripts/lib/pages.js`).

## Drop-in now

| Module | Element | Options |
| --- | --- | --- |
| Store browser (`js/shop.js` + `js/product-card.js`) | `[data-shop]` | `data-project`, `data-featured`, `data-limit`, `data-filters="project type"`, `data-level`, `data-url` (state in the address: `/shop?project=&type=&item=`) |
| Buy buttons, live prices, status (`js/store.js`) | `[data-buy]`, `[data-price]`, `[data-status]` | the product id |
| Projects rack (`js/projects.js`) | `[data-project-list]` | |
| Polls (`js/polls.js`) | `[data-polls-for]` | the project id |
| Frames (`js/layout.js`, `js/project-frame.js`) | `#site-header`, `#site-footer` | the page's `data-project` |

Store items wear their project's look in the store, the hub feed and on their product page; clicking one opens the store filtered to its project with it selected at the top.

## Still bound to one page (to convert)

Each of these looks up fixed ids and should become `[data-<feature>]` with attributes (tracked in GitHub Issues): hub panels (`#hub-stacc`, `#hub-releases`), news (`#news-list`, `#latest-news`), shows (`#show-list`), releases (`#release-list`, `#artist-profiles`), listen player (`#listen-player`, `#listen-platforms`), newsletter (`#newsletter-form`), press (`#press-contact`, `#press-profiles`), Your Stacc (`#library-app`), cart, checkout, account, login (`#*-app`) and admin. The store pages' `#*-app` roots are single-use by nature (one cart per page), but their parts (order list, cart lines) can still become modules when another page needs them.
