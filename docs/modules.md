---
title: Modules
summary: Drop-in features: how a feature is placed on any page by attributes, each module's options, project looks, and the single-use app roots.
covers: [js/shop.js, js/product-card.js, js/store.js, js/projects.js, js/polls.js, js/release-feed.js, js/account-nav.js, js/layout.js, js/project-frame.js, js/util.js, js/project-events.js, js/events-calendar.js, js/releases.js, js/music.js, js/newsletter.js, js/press.js, js/profiles.js, js/stacc-glance.js, js/library.js, js/dashboard.js, js/project-content.js, js/skeleton.js, css/skeleton.css, js/prefetch.js, js/creators-browse.js, js/card.js, css/projects/, scripts/lib/data.js, scripts/lib/pages.js]
updated: 2026-10-27
---

# Modules

The owner's rule: every feature is modular, so it can be used anywhere on the site, for any project. A feature is a **drop-in module** when a page uses it by placing an element with `data-*` attributes and loading the script, with no page-specific ids and no project hard-coded.

## The pattern

- One script finds every `[data-<feature>]` element and mounts on each (several per page are fine). Its options are attributes on that element; its header comment lists them.
- Templates that a module renders live in their own file and set one namespace on `GS` (e.g. `js/product-card.js` → `GS.productCard`).
- **One card** (owner, 2026-10-27, #230): every card is drawn through `js/card.js` (`GS.card` in the browser, `module.exports` for the server and build scripts; load it after `js/util.js`). It gives the shell (`.ui-card`: art or a generated tile, the "what it is" line, title, short line, then the area's own body and footer) and `card.tag(label, tone)`, the status chip that sits in the card's top-right corner (Official, Unofficial, Unverified, Pinned, New, % off, Coming soon...; styles in `css/core.css`). Each area keeps its class and `data-*` attributes (`cls`, `attrs`, `titleCls`, `bodyCls`) so its sheet and tests stay. Used by the community's space cards, Discover, creators, project cards, the three event cards and the product card (its corner tags; its own cover and buy layout stay). The skinned release list and the guide links are not cards.
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
| Projects to follow (`js/project-picks.js`) | `[data-project-picks]` | `data-limit`, `data-picks="following"` (the projects you follow instead), `data-compact` (poster cards, the home page) |
| Latest releases, news and shows (`js/latest.js`) | `[data-latest]` | `data-limit` (per list) |
| Projects browser, creators browser, explore (`js/projects-browse.js`, `js/creators-browse.js`, `js/explore-browse.js`) | `[data-projects-browse]`, `[data-creators-browse]`, `[data-explore]` | none: one per page, state in the address ([browse](browse.md)) |
| DAW backdrop (`js/daw-stage.js`, `css/daw-stage.css`) | `[data-daw-stage]` | `[data-daw-hero]` on the element it sits behind (it stops moving when that is out of view) |
| New releases feed (`js/release-feed.js`) | `[data-release-feed]` | `data-limit`, `data-personal` (dashboard only: followed projects first, owned items marked) |
| Account links and menu (`js/account-nav.js`) | `[data-auth="in"\|"out"]`, `[data-account-menu]`, `[data-signout]` | signed in, it loads the bell (`js/account-bell.js`): a button before the first account menu listing what waits on you (community notices, Studio items that need you, spaces you run), each with a link |
| Site notice (`js/site-notice.js`) | every page's `<main>` (loaded after `js/account-nav.js`, in `scripts/lib/pages.js` too) | the owner's one-line notice from `GET /api/site-status`, text only; nothing when there's none |
| Polls (`js/polls.js`) | `[data-polls-for]` | the project id |
| Events (`js/project-events.js`, `GS.eventCard`) | `[data-events]` | `data-project`, `data-limit` (the project's upcoming published events from the content API, soonest first, each card linking to the event's page; made in the Studio's Events editor). The site-wide calendar is `/events` (`server/content/calendar.js`, enhanced by `js/events-calendar.js`) |
| Releases (`js/releases.js`) | `[data-releases]` (a list) | `data-project`, `data-limit` |
| Official profiles (`js/profiles.js`) | `[data-profiles]` | `data-project` (music and press pages) |
| Listen player (`js/music.js`) | `[data-listen]` | `data-release` (counts a release view), else the project's `featured` release, else its newest (releases from `GET /api/projects/:id/content`, made in the Studio's Music editor; the release pages themselves are server-rendered by `server/content/render.js` and don't load this module); `data-project`; `data-links` (the release's streaming links under the player) |
| Newsletter sign-up (`js/newsletter.js`) | `[data-newsletter]` holding a `<form>` and a `.form-msg` (an empty element gets the standard form) | `data-project` (the list it joins); reads `?newsletter=<result>` from the confirmation link |
| Press contact (`js/press.js`) | `[data-press-contact]` | `data-project`; also wires `[data-copy="<id>"]` copy buttons |
| Your Stacc at a glance (`js/stacc-glance.js`) | `[data-stacc-glance]` | `data-project`, `data-limit` (latest additions, default 4); signed-out visitors get a log-in link; Auto-Stacc grants say "added by Auto-Stacc" |
| Your Stacc (`js/library.js`) | `[data-stacc]` | `data-project` (starts filtered to it), `data-stacc-view="kinds"` (starts by content type); a receipt's guest key is redeemed once per page. Its inner file area is `[data-stacc-files]`. Signed in, it also shows the person's collections, tags and saved searches (`js/library-personal.js`). |
| Frames (`js/layout.js`, `js/project-frame.js`) | `#site-header`, `#site-footer` (link columns: Explore with Discover, Community and About, Help with Guides, Legal with Copyright and Community rules; the theme switch at the foot) | the page's `data-project` |

Store items wear their project's look in the store, the new releases feed (home page, dashboard) and on their product page; clicking one opens the store filtered to its project with it selected at the top.

## Shared helpers every feature uses

- **Confirmations, `GS.confirm(message, { action, danger })`** and **messages, `GS.toast(text, error)`** (`js/util.js`, styles in `css/core.css`; owner, 2026-10-27, #219): every "are you sure?" is one `<dialog>` with the question, a button named for the action (red for deleting, removing, ending, refunding) and "Not now", answering a promise; Escape and the backdrop say no and focus goes back. Every message about an action with no form of its own is one line at the foot of the screen (above the phones' bar), announced, never blocking. The browser's `confirm()` and `alert()` aren't used any more. Browser tests click `.gs-confirm button[value=yes]`.
- **Loading placeholders, `GS.skeleton`** (`js/skeleton.js`, loaded right after `js/util.js`; styles `css/skeleton.css`; owner, 2026-10-21). One helper for every feature that loads from the API, so none draws its own spinner or "Loading…" text:
  - `html(shape, n)`: n placeholders as an HTML string, hidden from screen readers. Shapes: `card` (cover, two lines, a button), `row` (round avatar, two lines), `line`, `text` (three lines), `button`, `tile`, `panel` (a heading line and a block).
  - `show(el, shape, n)`: fills a region with placeholders plus one spoken "Loading…" and sets `aria-busy`. The region keeps its own classes (its grid or list) and only its children change, so the real content arrives without a layout shift; inside a list or table body the placeholders are list items or rows.
  - `done(el)`: the region is ready (no longer busy); the caller then writes the content.
  - `busy(button, on)`: a request button disabled and `aria-busy` with a small spinner before its unchanged label (login, sign-up, reset and other forms).
  - `pending(el, shape, n)`: `show()` until the code that draws `el` first writes, appends or empties it, then `done()` runs by itself (Studio sections and Control Center tabs, whose drawing modules need no clean-up).
  - The shimmer and the spinner move only without reduced motion. Features guard it (`const sk = window.GS.skeleton;`) and work without it. Store-offline and error states stay each feature's own. Generated pages get both files when they load content (`scripts/lib/pages.js`); server-rendered pages list them in their own CSS and script lists.
- **Preloading, `js/prefetch.js`** (every platform page, last script). Browsers with Speculation Rules read `/speculation-rules.json` (named by the `Speculation-Rules` header, [production](production.md#security)) and the script does nothing. Others get one `<link rel=prefetch>` for a same-origin link after a short hover, or at once on press or keyboard focus, with the rules file's exclusions; skipped when the visitor saves data. A link opts out with `data-no-prefetch`.

## Single-use by nature

The store and app pages keep one root each, because a page has one cart, one checkout and one form: cart (`#cart-app`), checkout (`#checkout-app`), login (`#auth-app`), settings (`#settings-app`), the creators' product page (`#product-app`), Studio (`#studio-app`), admin (`#admin-app`), and the dashboard's greeting (`[data-dashboard-hello]`, `js/dashboard.js`, which also sends an ended session to log in). Their parts (order list, cart lines) can still become modules when another page needs them. Every other feature is a drop-in (#52).

The signed-in home (`dashboard.html`, `js/dashboard.js`) is drop-in parts with no tabs since 2026-10-27 (#223): Your Stacc at a glance, the latest list, the projects you follow, and `js/home-attention.js` for what needs the person ([browse](browse.md)).
