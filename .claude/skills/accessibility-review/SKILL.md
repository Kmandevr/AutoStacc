---
name: accessibility-review
description: Review AutoStacc for accessibility (WCAG 2.2 AA basics). Use only when the user asks for an accessibility review or audit, not after every change.
---

# Accessibility review

Start `verify-site` (alt text, `lang`, tap targets, overflow) with `run_in_background` and review the table below while it runs; it needs nothing from the review, and the review covers only what it can't see. Find the code with the repo map and Serena; don't read every file. The pages are the root `*.html` files, each project's pages (`<creator>/<project>.html` and `<creator>/<project>/*.html`) and the generated release, product, post, creator and trust pages (templates in `scripts/lib/`, styles in `css/detail.css` and `css/prose.css`). Markup for the header, footer and nav is in `js/layout.js` (platform pages) and `js/project-frame.js` (a project's pages), cards in `js/shop.js`, news in `js/news.js`, shows in `js/shows.js`, release cards in `js/releases.js`. Heading order and alt text are already checked by `verify-site`.

| Area | Look for |
| --- | --- |
| Structure | One `h1` per page, no skipped heading levels, landmarks (`header`, `nav`, `main`, `footer`), a skip link |
| Names | Links and buttons with clear text (not "click here"); `aria-label` on icon-only controls; disabled "Coming soon" buttons use `aria-disabled` and aren't focus traps |
| Nav toggle | `aria-expanded` kept in sync, usable by keyboard, closes on Escape |
| Forms | Visible or `aria-label`led label on the newsletter input; the status message in `[data-newsletter] .form-msg` announced (`aria-live`) |
| Keyboard | Everything reachable by Tab in a sensible order, visible focus (check `css/core.css` and `css/layout.css` for `outline: none` overrides) |
| Colour | Contrast of text and accents in both AutoStacc themes (tokens in `css/platform.css`) and in each project skin (`css/projects/<id>/skin.css`) (4.5:1 body text, 3:1 large text and UI). Don't judge by eye; compute the ratio |
| Motion | The glitch title and animations stop under `prefers-reduced-motion` (in `css/core.css`, `css/platform.css`, `css/layout.css` and the project skins; confirm it still covers new animation) |
| Dynamic content | Filter buttons expose their pressed state (`aria-pressed`); results change is announced or at least not confusing |

## Reporting

One line per finding: `FAIL|WARN <area> - <what is wrong> (<file>:<line>)`, then the smallest fix. Group nothing else. Don't change code unless asked; this skill reviews. If asked to fix, keep each fix in the file that owns the markup or style.
