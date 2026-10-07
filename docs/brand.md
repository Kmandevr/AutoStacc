---
title: Brand
summary: How the site applies the identity: colours, fonts, stitch and glitch motifs, motion, tone of voice.
updated: 2026-10-07
---

# Brand

How the site applies the owner's [identity](identity.md): broken, then deliberately rebuilt. Fragmentation, corruption, stitching, reconstruction, shown through a technical interface. Playful and clever, never generic dark cyberpunk.

## Visual style (as built in `css/base.css` and the other files in `css/`)

Old-school terminal (owner's choice, 2026-10-07): a glowing CRT screen in three colours.

- Black background (`#000`, panels `#0b0812`). White `#f2f2f2` for reading text (light grey `#b8b8c0` for secondary text), phosphor green `#33ff66` for headings, prices and the logo (dim `#24b350` for nav, footer and dates), neon purple `#bf5fff` for links, buttons, tags and show dates
- Soft glow on green and purple text, scanlines and darkened screen edges over the page, square corners
- Terminal touches: `$ ` before section titles, `> ` on buttons and the current nav link, a blinking block cursor after the hero tagline
- Stitching is a feel, not a decoration: no sewing lines, dashes or stitch marks. Instead things look pieced together from fragments: alternate panels (`.alt`) have small steps in their top and bottom edges like fitted pieces, cards and news items sit slightly off a purple copy of themselves and snap into place on hover, the About monogram is torn in half and rejoined misaligned, and "The loop" reads like a terminal log (`[01] CREATE` ... `[07] REPEAT ↻ 01`)
- Thin solid 1px lines for structure
- Glitching is constant but small: page titles twitch in bursts, and every 6 to 14 seconds one visible title (section heading, cover, loop step or logo) "zaps" briefly (`js/motion.js`). Glitch and cursor stop for reduced-motion users
- Nothing stops moving between pages: changing page is a view transition where the header stays put, the old page slices out and the new one skews in (`@view-transition` in `css/base.css`, Chrome/Edge/Safari; others just load). The rolling refresh band runs on wall-clock time so it carries on across pages, and the shop filter cross-fades its cards
- Motion is quick and snappy (`--snap` easing, 0.1 to 0.5s): the home title powers on like a CRT, the hero tagline types itself out, sections flicker on and cards, news and shows rise in as you scroll (`js/motion.js`), the glitch title twitches in short bursts every few seconds, and a faint refresh band rolls down the screen. Hover: cards lift and glow with scrolling scanlines and a one-off title twitch, links wipe in an underline, buttons press in. All of it is off for reduced-motion users.
- Product covers glow green or purple depending on the product's `hue`
- Fonts: VT323 (pixel terminal font) for the logo, headings and covers; JetBrains Mono for everything else

## Tone

- Clever, experimental, playful, slightly chaotic, weird in a memorable way, technically minded, self-aware (from [identity](identity.md))
- Short, punchy lines. Puns on glitching and stitching are on-brand, but don't overdo them
- Lean on the specific idea (broken pieces, stitched, glitched, reused) rather than generic futuristic or "dark" imagery
- No invented facts: see [artist](artist.md) for what is confirmed
