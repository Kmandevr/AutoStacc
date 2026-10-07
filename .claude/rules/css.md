---
paths:
  - "css/**/*.css"
---

# Styles

- One stylesheet per feature, loaded only by the pages that use it. `base.css` (tokens, buttons, sections, glitch title) and `layout.css` (header, footer) load everywhere. Put a rule in the sheet of the feature it styles; touch `base.css` only for what every page shares. Don't grow a catch-all sheet.
- Use the tokens in `:root` of `base.css` (`--pink`, `--line`, `--mono`, `--radius`, ...) instead of literal colours, fonts or radii. A new token goes in `:root` only if it is reused.
- Scope selectors to the feature's own classes so they can't leak to other pages. No `!important`, no styling bare element selectors outside `base.css`.
- Responsive on purpose: write the 390px layout deliberately, keep media queries beside the rules they change, and avoid fixed widths that cause overflow.
- Animate `transform` and `opacity`, and respect `prefers-reduced-motion`.
- Start with a one-line `/* */` comment saying what the sheet is for and where it is used. Look and tone: [docs/brand.md](../../docs/brand.md).
