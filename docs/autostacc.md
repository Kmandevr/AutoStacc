---
title: AutoStacc
summary: The platform's identity and vocabulary: what Auto and Stacc mean, Projects, Stacclets, Pacs, Your Stacc, and when to use plain words instead.
updated: 2026-10-08
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
| **Project** | a creator on AutoStacc | directory, product credits |
| **Stacclet** | a collection of related Pacs from one project | library navigation, product contents |
| **Pac** | a folder of content (MIDI, samples, presets…) | library navigation, product contents |

Hierarchy: AutoStacc → Project → Stacclet → Pac → content. A Stacclet is not just another word for folder: it groups Pacs. A Pac is the folder.

## Plain words stay plain

Download, Store, Shop, Cart, Account, Settings, Log in, Library (as a subtitle) stay normal words. Good: "Library — Everything you've Stacc'd." Bad: renaming the cart, the download button or the account page into puns.

## Site structure

`/` is AutoStacc's public cover (what it is, Create account / Log in / Browse the store, what it does, featured products, projects and new releases, how it works). Public platform pages: `/shop`, `/about`, `/projects`. The signed-in app: `/dashboard` (Your Stacc at a glance, new releases from followed projects, projects, account shortcuts), `/library` (Your Stacc), `/account` (orders), `/settings` (name, password). Each project lives under `/<creator>/<id>` with its own pages (`/autostacc/glitches-and-stitches/music/hail`). On platform pages navigation is a sidebar, **AutoStacc** (Home, Store, About), **Projects** (one link per project) and, signed in, **You** (Dashboard, Your Stacc, Account, Settings): on a computer an icon rail that expands (the choice is remembered), on phones a compact drawer. Top right: Log in and Create account (or Log out), cart and the theme switch. A project is its own mini-site: its pages have no sidebar, only a thin AutoStacc strip on top (home, Store, Projects; signed in also Your Stacc, Log out and Dashboard; signed out Log in and Create account; theme, cart), then the project's own header in its own theme (its logo and wordmark linking to its home, its pages as nav, its tools such as the sound switch; a menu button on phones) and its own footer with a "Sold and delivered by AutoStacc" line (`js/project-frame.js`, `css/project-frame.css`, restyled by its skin). Its music, shows, news and press are reachable only inside it.

## Visual identity (placeholder logo)

Stacked and modular, like a DAW (think REAPER) but prettier: neutral panels on a grid, channel-strip cards, meters and track colours, with playful motion (blocks stacking, meters moving) that stops for reduced motion. More professional than the project pages; no UI sounds on platform pages (sound belongs to projects).

- **Themes:** light and dark, following the device until the visitor picks one (remembered). Dark: graphite panels; light: off-white panels.
- **Colour:** neutral greys for structure; teal is the accent (actions, focus, the logo); track colours tag content: amber MIDI, coral samples, lime loops, violet presets (`css/platform.css` tokens). Text stays high-contrast in both themes.
- **Type:** a clean sans for text and headings (Inter), a mono for labels, counts and meters (JetBrains Mono).
- **Logo:** a stacked-blocks wordmark drawn in SVG, a placeholder until the owner supplies one.
- **Projects keep their own skin** (Glitches & Stitches: the glitch terminal in [brand](brand.md)) on their pages.

## Voice

The platform's own copy is friendly but professional and to the point: plain sentences, sentence-case headings (no all-caps, no `$` prompts or terminal flourishes), "Your Stacc" for the library, "store" for the shop. Each project brings its own voice on its own pages; Glitches & Stitches' terminal look and loop vocabulary (tear, stitch, glitch, cinch) stay inside its skin and never appear on platform pages, store pages or AutoStacc email.
