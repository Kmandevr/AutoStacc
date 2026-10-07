---
paths:
  - "js/**"
  - "*.html"
---

# Scripts and pages

- Plain `<script>` tags, no modules, no build step, so pages work from `file://`. Helpers are shared on `window.GS` (`js/util.js`).
- One file per feature. Each page loads only the scripts it uses; when a page starts using a new feature, add that script (and its `data/` file) to that page only.
- Every script starts with a one-line `//` comment saying what it is for and what it needs. The repo map is built from it.
- Content is data in `data/*.js`, never hard-coded in HTML or scripts.
