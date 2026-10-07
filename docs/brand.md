---
title: Brand
summary: Visual style (colours, borders, glitch effect) and tone of voice.
updated: 2026-10-07
---

# Brand

The name suggests broken-then-repaired: glitch art meets stitched fabric. The site's look follows from that.

## Visual style (as built in `css/base.css` and the other files in `css/`)

Old-school terminal (owner's choice, 2026-10-07): a glowing CRT screen in three colours.

- Black background (`#000`, panels `#0b0812`). White `#f2f2f2` for reading text (light grey `#b8b8c0` for secondary text), phosphor green `#33ff66` for headings, prices and the logo (dim `#24b350` for nav, footer and dates), neon purple `#bf5fff` for links, buttons, tags and show dates
- Soft glow on green and purple text, scanlines and darkened screen edges over the page, square corners
- Terminal touches: `$ ` before section titles, `> ` on buttons and the current nav link, a blinking block cursor after the hero tagline
- Dashed borders as "stitching"
- Glitch effect on page titles (purple and green offset layers); glitch and cursor stop for reduced-motion users
- Motion is quick and snappy (`--snap` easing, 0.1 to 0.5s) and plays mostly once: titles power on like a CRT, the hero tagline types itself out, sections flicker on and cards, news and shows rise in as you scroll (`js/motion.js`), the glitch title twitches in short bursts every few seconds, and a faint refresh band rolls down the screen. Hover: cards lift and glow with scrolling scanlines and a one-off title twitch, links wipe in an underline, buttons press in. All of it is off for reduced-motion users.
- Product covers glow green or purple depending on the product's `hue`
- Fonts: VT323 (pixel terminal font) for the logo, headings and covers; JetBrains Mono for everything else

## Tone (draft, confirm with the owner)

- Short, punchy lines; slightly techy and playful
- Puns on glitching and stitching are on-brand, but don't overdo them

This is a first draft of the identity, chosen from the artist's name alone. Update it if the artist has existing branding. See [artist](artist.md).
