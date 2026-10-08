---
title: Brand
summary: Glitches & Stitches' skin: how its pages apply the identity (colours, fonts, glitch motifs, motion, sound, tone) inside the AutoStacc frame.
updated: 2026-10-08
---

# Brand: the Glitches & Stitches skin

Since 2026-10-08 the site is AutoStacc ([autostacc](autostacc.md) for its look) and this is Glitches & Stitches' own skin, used only on its pages (`/projects/glitches-and-stitches/...`): `css/projects/glitches-and-stitches/skin.css`, scoped to `<main class="skin-glitches-and-stitches">`, under a thin AutoStacc strip. Its pages have their own header and footer again, in the skin: the `GLITCHES&STITCHES` wordmark with a purple ampersand, lowercase nav with a `> ` marker on the current page, the `[SND:OFF]` flag, and the `[≡]` menu with big uppercase rows on phones. Its UI sounds and easter eggs load only on its pages. The notes below on store pages and "the vault" describe the site before the split; the store pages now use the AutoStacc look.

How its pages apply the owner's [identity](identity.md): broken, then deliberately rebuilt. Fragmentation, corruption, stitching, reconstruction, shown through a technical interface. Playful and clever, never generic dark cyberpunk.

## Visual style (as built in `css/projects/glitches-and-stitches/` with the shared feature sheets)

Old-school terminal (owner's choice, 2026-10-07): a glowing CRT screen in three colours.

- Black background (`#000`, panels `#0b0812`). White `#f2f2f2` for reading text (light grey `#b8b8c0` for secondary text), phosphor green `#33ff66` for headings, prices and the logo (dim `#24b350` for nav, footer and dates), neon purple `#bf5fff` for links, buttons, tags and show dates
- Soft glow on green and purple text, scanlines and darkened screen edges over the page, square corners
- Terminal touches: `$ ` before section titles, `> ` on buttons and the current nav link, a blinking block cursor after the hero tagline
- Stitching is a feel, not a decoration: no sewing lines, dashes or stitch marks. Instead things look pieced together from fragments: alternate panels (`.alt`) have small steps in their top and bottom edges like fitted pieces, cards and news items sit slightly off a purple copy of themselves and snap into place on hover, the About monogram is torn in half and rejoined misaligned, and "The loop" reads like a terminal log (`[01] TEAR` ... `[05] REPEAT ↻ 01`), using the chant from [identity](identity.md): Tear. Stitch. Glitch. Cinch. Repeat.
- Thin solid 1px lines for structure
- Glitching is constant but small: page titles twitch in bursts, and every 6 to 14 seconds one visible title (section heading, cover, loop step or logo) "zaps" briefly (`js/motion.js`). Glitch and cursor stop for reduced-motion users
- Nothing stops moving between pages: changing page is a view transition where the header stays put, the old page slices out and the new one skews in (`@view-transition` in `css/base.css`, Chrome/Edge/Safari; others just load). The rolling refresh band runs on wall-clock time so it carries on across pages, and the shop filter cross-fades its cards
- Motion is quick and snappy (`--snap` easing, 0.1 to 0.5s): the home title powers on like a CRT, the hero tagline types itself out, sections flicker on and cards, news and shows rise in as you scroll (`js/motion.js`), the glitch title twitches in short bursts every few seconds, and a faint refresh band rolls down the screen. Hover: cards lift and glow with scrolling scanlines and a one-off title twitch, links wipe in an underline, buttons press in. All of it is off for reduced-motion users.
- Sound is opt-in: a `[SND:OFF]` switch in the top bar on this project's pages (remembered per browser). Sounds are made in the browser (`js/sound.js`) and are musical: every note is from A minor pentatonic so overlaps harmonise, but it stays gritty (the owner wants grit): tape-style saturation on the whole mix, hard bit-crush on most sounds, a quiet buzzing square under each triangle note, a crackle on every attack, and stutter chops on the glitchier sounds, with a dark echo and a limiter. Each sound follows its animation's frames (page-out's 3 slices, the zap's 3 jitters, the section flicker, the 6-frame Konami tear, the monogram's break and snap back) and is placed left or right where it happens. Switching sound on plays the chant as a five-note motif (Tear. Stitch. Glitch. Cinch. Repeat., with "Repeat" stuttering), which the typed tagline also plays word by word when sound is running. Never background music or autoplay (WCAG 1.4.2). Other scripts request sounds with a `gs:sound` event. Later these can be swapped for fragments of HAIL and future tracks.
- Easter eggs (hidden, on-identity, never in the way): `~` opens a terminal (`js/terminal.js`: help, ls, open, play hail, loop, whoami, sound, remix, each step of the chant as its own command, and jokes like `sudo`), typing "hail" makes it hail, the Konami code tears the page and swaps green and purple ("remix²", for the visit), five clicks on the About monogram shatter it, the tab title becomes "[signal lost]" when you leave, a console hello, rotating 404 jokes (`js/eggs.js`, `css/eggs.css`). Reduced motion keeps the messages but skips the animation.
- Product covers glow green or purple depending on the product's `hue`
- Store (cart, login, account, library, checkout, admin): terminal panels with `$ ` headings and a purple offset layer, inputs as green prompts, messages tagged `[ok]`, `[err]`, `[..]`. Owned products get a slightly crooked green `OWNED` stamp; adding to the cart snaps the button into place ("stitched") with the `stitch` sound; a confirmed payment reads `CINCHED.` with the `cinch` sound (the chant's Cinch note locking in). The library is "the vault". Copy stays short and on-identity: "Nothing stitched in here yet.", "Signal lost before checkout opened. Nothing was charged; try again."

- Phones (≤600px, header ≤720px): nothing may be wider than the screen (a 5px overflow made the whole page look squished and shifted right). Up to 900px the header is just the logo and a roomy `[≡]`/`[×]` menu button; the menu fills the screen below the header with big terminal-style rows and the sound switch at the bottom (the page behind doesn't scroll, Esc closes it). The sound switch lives at the end of the nav on every screen size. tighter section spacing, full-width stacked hero buttons, streaming links and ticket buttons in even grids, shop filters as one swipeable row, a smaller offset layer, and the chant sized to stay on one line. Checked at 320, 360, 390 and 430px.
- Fonts: VT323 (pixel terminal font) for the logo, headings and covers; JetBrains Mono for everything else

## Tone

- Clever, experimental, playful, slightly chaotic, weird in a memorable way, technically minded, self-aware (from [identity](identity.md))
- Short, punchy lines. Puns on glitching and stitching are on-brand, but don't overdo them
- Lean on the specific idea (broken pieces, stitched, glitched, reused) rather than generic futuristic or "dark" imagery
- No invented facts: see [artist](artist.md) for what is confirmed
