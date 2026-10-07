---
paths:
  - "js/**/*.js"
---

# Scripts

- One file per feature, wrapped in an IIFE, plain `<script>` (no modules, no build step, so pages work from `file://`). Split a file when it grows past one feature or roughly 150 lines.
- The only global a script adds is `GS` (`js/util.js`, also set as `window.GS`; other scripts read `window.GS`). `js/jsconfig.json` and `js/globals.d.ts` are editor-only so Serena resolves `window.GS` across files; pages never load them. Read data as `window.NAME || []`. Keep state inside the IIFE.
- Dependencies point one way: feature script to `util.js`. Features never call each other, so there are no cycles. A helper moves to `util.js` only when a second feature needs it, and check `util.js` first before writing a new one.
- Guard on the page: look up the feature's container first and return early if it's missing, so the script is harmless on other pages.
- Escape every data value you put into HTML with `GS.escapeHTML`. The one exception is `news.body`, which is trusted HTML by design.
- Start with a one-line `//` comment saying what the file is for and what it needs (the repo map reads it).
