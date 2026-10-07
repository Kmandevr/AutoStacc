---
name: accessibility-review
description: Review AutoStacc for accessibility (WCAG 2.2 AA basics). Use only when the user asks for an accessibility review or audit, not after every change.
---

# Accessibility review

Start with `verify-site` (alt text, `lang`, tap targets, overflow). Then review only what it can't see. Find the code with the repo map and Serena; don't read every file. The pages are `index.html`, `shop.html`, `news.html`. Markup for the header, footer and nav is in `js/layout.js`, cards in `js/shop.js`, news in `js/news.js`, shows in `js/shows.js`.

| Area | Look for |
| --- | --- |
| Structure | One `h1` per page, no skipped heading levels, landmarks (`header`, `nav`, `main`, `footer`), a skip link |
| Names | Links and buttons with clear text (not "click here"); `aria-label` on icon-only controls; disabled "Coming soon" buttons use `aria-disabled` and aren't focus traps |
| Nav toggle | `aria-expanded` kept in sync, usable by keyboard, closes on Escape |
| Forms | Visible or `aria-label`led label on the newsletter input; the status message in `#newsletter-msg` announced (`aria-live`) |
| Keyboard | Everything reachable by Tab in a sensible order, visible focus (check `css/base.css` for `outline: none` overrides) |
| Colour | Contrast of text and neon accents against the dark backgrounds, using the tokens in `css/base.css` (4.5:1 body text, 3:1 large text and UI). Don't judge by eye; compute the ratio |
| Motion | The glitch title and animations stop under `prefers-reduced-motion` (already in `css/base.css`; confirm it still covers new animation) |
| Dynamic content | Filter buttons expose their pressed state (`aria-pressed`); results change is announced or at least not confusing |

## Reporting

One line per finding: `FAIL|WARN <area> - <what is wrong> (<file>:<line>)`, then the smallest fix. Group nothing else. Don't change code unless asked; this skill reviews. If asked to fix, keep each fix in the file that owns the markup or style.
