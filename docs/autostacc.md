---
title: AutoStacc
summary: The platform's identity and vocabulary: what Auto and Stacc mean, Projects, Stacclets, Pacs, Your Stacc, and when to use plain words instead.
updated: 2026-10-07
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

"Auto" is a product promise: AutoStacc does the repetitive work. Purchases land in Your Stacc; eligible free content can be added automatically for followers; products expose what's inside; content is filed by project, Stacclet, Pac, kind and format. Philosophy: **Stacc it once. Auto handles the rest.** Use the line where it explains something (the platform intro, Auto-Stacc settings), not on every button.

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

`/` is the AutoStacc hub (a dashboard: Your Stacc at a glance, new releases, projects rack, how it works). Platform pages: `/shop`, `/library`, `/about`, `/projects`. Each project lives under `/projects/<id>` with its own pages (`/projects/glitches-and-stitches/music/hail`). Navigation is a sidebar in two groups, **AutoStacc** (Store, Your Stacc, About) and **Projects** (each project, expandable to its pages): open on desktop, a drawer on phones. Account, cart and the theme switch sit top right.

## Visual identity (placeholder logo)

Stacked and modular, like a DAW (think REAPER) but prettier: neutral panels on a grid, channel-strip cards, meters and track colours, with playful motion (blocks stacking, meters moving) that stops for reduced motion. More professional than the project pages; no UI sounds on platform pages (sound belongs to projects).

- **Themes:** light and dark, following the device until the visitor picks one (remembered). Dark: graphite panels; light: off-white panels.
- **Colour:** neutral greys for structure; teal is the accent (actions, focus, the logo); track colours tag content: amber MIDI, coral samples, lime loops, violet presets (`css/platform.css` tokens). Text stays high-contrast in both themes.
- **Type:** a clean sans for text and headings (Inter), a mono for labels, counts and meters (JetBrains Mono).
- **Logo:** a stacked-blocks wordmark drawn in SVG, a placeholder until the owner supplies one.
- **Projects keep their own skin** (Glitches & Stitches: the glitch terminal in [brand](brand.md)) on their pages.

## Voice

The platform's own copy is clear and practical; each project brings its own voice on its own content. Glitches & Stitches' terminal look is the current site skin and stays, but platform copy shouldn't borrow its loop vocabulary (tear, stitch, glitch) for platform features.
