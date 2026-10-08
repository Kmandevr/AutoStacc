---
paths:
  - "js/**/*.js"
---

# Scripts

- One file per feature, wrapped in an IIFE, plain `<script>` (no modules, no build step, so pages work from `file://`). Split a file when it grows past one feature or roughly 150 lines.
- `js/theme.js` is the one script in `<head>` (sets the theme before paint, then draws its switch; it also handles aborted page-change animations, which must be caught before the first paint). Project paths come from `GS.projectPath(id, ...)` and the open project from `GS.currentProject()`; never hard-code a project's address (`/<creator>/<project>/...`) or read artist fields from `SITE` (that's AutoStacc).
- The only global a script adds is `GS` (`js/util.js`, also set as `window.GS`; other scripts read `window.GS`). `js/jsconfig.json` and `js/globals.d.ts` are editor-only so Serena resolves `window.GS` across files; pages never load them. Read data as `window.NAME || []`. Keep state inside the IIFE.
- A pure model or template module that exactly one feature needs may set one namespace on `GS` and must load before that feature: `js/stacc-model.js` (`GS.stacc`, no DOM, also `require`-able by Node unit tests) and `js/library-view.js` (`GS.libraryView`), both for `js/library.js`.
- Dependencies point one way: feature script to `util.js`. Features never call each other, so there are no cycles. A helper moves to `util.js` only when a second feature needs it, and check `util.js` first before writing a new one.
- Guard on the page: look up the feature's container first and return early if it's missing, so the script is harmless on other pages.
- New features are drop-in modules ([docs/modules.md](../../docs/modules.md)): mount on every `[data-<feature>]` element, options as `data-*` attributes, no page ids, no project hard-coded. Anything a project made wears its look (`GS.look(projectId)`).
- Store scripts talk to the API only through `GS.api` (never throws; status 0 = offline, 503 = store offline), keep the cart in `GS.cart` and count events with `GS.track`. They never compute prices or ownership: they show what the API says, and keep a static fallback that works when it says nothing. Features signal each other with DOM events (`gs:cart`, `gs:cards`, `gs:admin` on window; `gs:sound` on document).
- Every button that sends a request disables itself until the answer comes back (double clicks, slow networks).
- Escape every data value you put into HTML with `GS.escapeHTML`. The one exception is `news.body`, which is trusted HTML by design.
- Start with a one-line `//` comment saying what the file is for and what it needs (the repo map reads it).
