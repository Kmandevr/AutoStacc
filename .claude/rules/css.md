---
paths:
  - "css/**"
---

# Styles

- One stylesheet per feature, loaded only by the pages that use it. `css/base.css` (tokens, buttons, sections, glitch title) and `css/layout.css` (header, footer) load on every page.
- Every stylesheet starts with a one-line `/* */` comment saying what it is for and where it is used.
- Put a rule in the stylesheet of the feature it styles. Touch `base.css` only for something every page shares. Brand rules: [docs/brand.md](../../docs/brand.md).
