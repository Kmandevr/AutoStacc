---
paths:
  - "css/**/*.css"
---

# Styles

- One stylesheet per feature, loaded only by the pages that use it. Every page loads `core.css` (reset, buttons, sections, shared pieces, written only against tokens), `platform.css` (AutoStacc's tokens for light and dark, and touches scoped to `main.platform`) and `layout.css` (sidebar, top bar, footer). A project's pages add its skin, `css/projects/<id>/skin.css`, scoped to `.skin-<id>` on their `<main>`, and project-only sheets live in `css/projects/<id>/`. Put a rule in the sheet of the feature it styles; touch `core.css` only for what every page shares. Don't grow a catch-all sheet.
- Use role tokens (`--text`, `--muted`, `--panel`, `--line`, `--accent`, `--accent-2`, `--link`, `--heading`, `--btn-bg`, `--stack`, `--radius`, `--font`, `--mono`, `--display`, `--prompt`, ...) instead of literal colours, fonts or radii, so the same feature sheet works in both AutoStacc themes and inside a project skin. Track colours (`--teal`, `--amber`, `--coral`, `--lime`, `--violet`, and `--track` under `[data-track]`) are AutoStacc's. A new token goes in `platform.css` (and each skin) only if it is reused.
- Scope selectors to the feature's own classes so they can't leak to other pages. No `!important`, no styling bare element selectors outside `core.css`.
- Responsive on purpose: write the 390px layout deliberately, keep media queries beside the rules they change, and avoid fixed widths that cause overflow.
- Animate `transform` and `opacity`, and respect `prefers-reduced-motion`.
- Start with a one-line `/* */` comment saying what the sheet is for and where it is used. Look and tone: AutoStacc [docs/autostacc.md](../../docs/autostacc.md); Glitches & Stitches' skin [docs/brand.md](../../docs/brand.md).
