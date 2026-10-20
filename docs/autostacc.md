---
title: AutoStacc
summary: The platform's identity and vocabulary: what Auto and Stacc mean, Projects, Stacclets, Pacs, Your Stacc, and when to use plain words instead.
covers: [css/platform.css, js/layout.js, js/account-nav.js, js/project-frame.js, css/project-frame.css, img/autostacc-mark.svg, data/site.js]
updated: 2026-10-16
---

# AutoStacc: platform identity

Written from the owner's brief (2026-10-07). [Identity](identity.md) is the identity of the Glitches & Stitches project; this note is the platform's. Structure: [architecture](architecture.md).

AutoStacc is an independent platform and business: storefront, products, checkout, accounts, purchases, the customer's library, downloads, licensing, project discovery and automatic delivery. It should be able to stand on its own even without Glitches & Stitches. Projects create the content; AutoStacc hosts, catalogs, sells, delivers and organizes it.

```
Project creates content → AutoStacc catalogs and sells it → customer acquires it
→ AutoStacc organizes it → customer uses it from Your Stacc
```

Example: *Frayed Signals — Sample Pack*, created by Glitches & Stitches, sold and delivered by AutoStacc. The project owns the creative identity; AutoStacc provides the platform.

## Auto

"Auto" is a product promise: AutoStacc does the repetitive work. Purchases land in Your Stacc; eligible free content can be added automatically for followers; products expose what's inside; content is filed by project, Stacclet, Pac, kind and format. The public pitch is **straight from the artists**: what the projects make, the store, and free releases through Auto-Stacc. Your Stacc (the library) is a feature for signed-in customers, not the selling point on public pages (owner, 2026-10-08). Say what Auto does in plain words ("free releases are added automatically"); don't personify it ("Auto handles…").

## Stacc vocabulary

| Term | Means | Use it for |
| --- | --- | --- |
| **Your Stacc** | the customer's whole collection | the library page title, links to it |
| **Stacc'd** | added to Your Stacc | "Everything you've Stacc'd." |
| **Auto-Stacc** | automatically add eligible new content | the follow setting and its status |
| **Creator** | who owns projects, at `/<creator>`; anyone can become one in the Studio ([creators](creators.md)) | creator profiles, the Studio |
| **Project** | a body of creative work on AutoStacc, owned by a creator | directory, product credits |
| **Stacclet** | a collection of related Pacs from one project | library navigation, product contents |
| **Pac** | a folder of content (MIDI, samples, presets…) | library navigation, product contents |

Hierarchy: AutoStacc → (Creator →) Project → Stacclet → Pac → content. A Stacclet is not just another word for folder: it groups Pacs. A Pac is the folder.

## Plain words stay plain

Download, Store, Shop, Cart, Account, Settings, Log in, Library (as a subtitle) stay normal words. **Stacc'd replaces "owned" and "purchased"** wherever the site speaks about having something (badges, Your Stacc, settings, help, emails; owner, 2026-10-09): "STACC'D", "Nothing Stacc'd yet", "everything you've Stacc'd". Paying stays plain words (order, payment, refund, receipt) and the legal pages (terms, privacy, refunds, licence) keep "purchase" for its legal meaning. Used: Your Stacc's intro ("Everything you've Stacc'd"), the payment-confirmed message and claiming a free product ("Stacc'd!"). Good: "Library — Everything you've Stacc'd." Bad: renaming the cart, the download button or the account page into puns.

## Site structure

`/` is AutoStacc's public cover and discovery hub (a banner over an animated DAW backdrop with what it is, Create account / Log in / Browse the store, a store search and the ways in, store picks, projects to follow, the latest releases, news and shows, how it works, a closing sign-up call; [browse](browse.md)). Public platform pages: `/shop`, `/projects`, `/explore` (releases, news and shows from every project), `/about`. The signed-in app: `/dashboard` (a Your Stacc search, Your Stacc at a glance, new releases, projects you follow, the latest from the projects, projects to try, account shortcuts), `/library` (Your Stacc), `/settings` (one area with a page per section: Profile, Security, Orders, Emails, Privacy and data; [store](store.md#settings)), `/studio` (where creators build their pages and products, [creators](creators.md), [studio](studio.md)). Each creator has a profile at `/<creator>`. Each project lives under `/<creator>/<id>` with its own pages (`/autostacc/glitches-and-stitches/music/hail`). On platform pages navigation is a sidebar, **AutoStacc** (Home, Store, Explore, About), **Projects** (one link per project) and, signed in, **You** (Dashboard, Your Stacc): on a computer an icon rail that expands (the choice is remembered), on phones a drawer plus a bottom tab bar (Store, Projects, Your Stacc or Log in, Menu) (`js/layout.js`). Top right: Log in and Create account, cart, the theme switch and, signed in, the account menu (your initial: Dashboard, Your Stacc, Studio, Settings, the Control Center for an admin, Log out; `js/account-nav.js`). The footer has the mark and link columns (Explore with Community, Help with Guides, Legal with Copyright and Community rules). A project is its own mini-site: its pages have no sidebar, only a thin AutoStacc strip on top (home, Store, Projects; signed in also Your Stacc and the same account menu; signed out Log in and Create account; theme, cart), then the project's own header in its own theme (its logo and wordmark linking to its home, its pages as nav, its tools such as the sound switch; a menu button on phones) and its own footer with a "Sold and delivered by AutoStacc" line (`js/project-frame.js`, `css/project-frame.css`, restyled by its skin). Its music, shows, news and press are reachable only inside it.

## Visual identity (placeholder logo)

Stacked and modular, like a DAW (think REAPER) but prettier: neutral panels on a grid, channel-strip cards, meters and track colours, with playful motion (blocks stacking, meters moving) that stops for reduced motion. More professional than the project pages; no UI sounds on platform pages (sound belongs to projects).

- **Clean glass** (owner, 2026-10-09): soft track-coloured light sits far behind every platform page (fixed, `css/platform.css`), and AutoStacc's surfaces are see-through over it: panels and cards at about 76% opacity, the sidebar, top bar, phone bar, account menu and filter drawer frosted (`--blur`), edges a faint `--glass-edge`. Readable first (owner, 2026-10-16): the chrome is frosted, about 70–82% of the panel colour with a 20px blur (`--blur-bar`), never solid; see-through panels, cards and shaded sections are frosted with a lighter 12px blur (`--blur`); only visitors who ask for reduced transparency get a solid bottom bar; the home backdrop follows the theme, so text stays legible and light mode never looks dark. A project's look keeps its own solid surfaces.
- **Motion is feedback, never decoration for its own sake:** page changes dim the old page and lift the new one into place while the sidebar and bars stay put (`css/core.css`); buttons and chips press in; results a search or filter draws settle in one after another; filter groups fold smoothly; a status line slides in and an error nudges once (`GS.say` replays it); the cart count bumps when something is added; clickable cards sit up off the page with a soft shadow, and hovering one lifts and grows it a little and, with a mouse, tilts it toward the pointer (owner, 2026-10-16; `css/platform.css`, `js/motion.js`). All of it is short (under 0.35 s), uses transform and opacity, and is off for reduced motion.
- **Themes:** light and dark, following the device until the visitor picks one (remembered). Dark: graphite panels; light: off-white panels.
- **Colour:** neutral greys for structure; teal is the accent (actions, focus, the logo); track colours tag content: amber MIDI, coral samples, lime loops, violet presets (`css/platform.css` tokens; each product type picks its colour with `track` in `data/product-types.js`). Text stays high-contrast in both themes.
- **Type:** a clean sans for text and headings (Inter), a mono for labels, counts and meters (JetBrains Mono).
- **Logo:** four stacked colour blocks (`img/autostacc-mark.svg`) beside the AutoStacc wordmark, a placeholder the owner is happy to keep for now (2026-10-09); `img/og.png` is the link preview.
- **Projects keep their own skin** (Glitches & Stitches: the glitch terminal in [brand](brand.md)) on their pages.

## Voice

The platform's own copy is friendly but professional and to the point: plain sentences, sentence-case headings (no all-caps, no `$` prompts or terminal flourishes), "Your Stacc" for the library, "store" for the shop. The community has a small studio vocabulary of its own (takes, Boost, Hot / Fresh / Top, Best answer; owner, 2026-10-20, [community](community.md#look-and-words-owner-2026-10-20)). Each project brings its own voice on its own pages; Glitches & Stitches' terminal look and loop vocabulary (tear, stitch, glitch, cinch) stay inside its skin and never appear on platform pages, store pages or AutoStacc email.
