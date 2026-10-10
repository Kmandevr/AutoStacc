---
title: Your Stacc
summary: The customer library ("Your Stacc"): content-level views by project, Stacclet, Pac, content type and format, selected downloads, follows and Auto-Stacc.
covers: [library.html, js/library.js, js/library-view.js, js/stacc-model.js, js/stacc-client.js, js/stacc-worker.js, css/stacc.css, server/entitlements/, server/projects/, data/stacclets.js, data/pacs.js, data/content-types.js]
updated: 2026-10-10
---

# Your Stacc

`/library` is Your Stacc: the content a customer can use, not a receipt list. Ownership and downloads are the store's ([store](store.md#entitlements)); this note is about organizing them. Model: [architecture](architecture.md).

## Where the data comes from

1. `GET /api/library` (server, from `entitlements`; it runs the Auto-Stacc grant first for a signed-in account): owned products, each with its `projectId`, `pacs`, `sources` and deliverable files, and each file's `pacId`, `kind`, size and name. Unchanged rules: only active entitlements, only active, published files ([store](store.md)), storage keys never sent.
2. `data/projects.js`, `data/stacclets.js`, `data/pacs.js` (static) and `data/content-types.js` (generated from the vocabulary's `KINDS`, with `CONTENT_TYPE_ALIASES` for old kind names): names and structure.
3. `js/stacc-model.js` joins them into one list of **assets**, one object per file, each knowing its project, Stacclet, Pac, product, kind and format. A file's kind is what the admin chose at upload (an old name such as `samples` counts as its new kind, `one-shots`; old `?kind=samples` links still work), else guessed from its extension (`content-types.js` `formats`).

## Views (same assets, no copies)

- **By project:** Project → Stacclet → Pac → content type → files; files uploaded without a Pac sit under their product.
- **By content type:** MIDI, One-shots, Loops, Presets, … each with a count, across every project, each file showing where it came from.
- **Filters:** project, content type and format apply to both views.

Search narrows files as you type (every word in the file's name, file name or product title); on `/library` the view, search and filters live in the address (`?q=&project=&kind=&format=&view=kinds`) ([browse](browse.md)).

Owned products with no deliverable file yet are listed under **On the way**. Projects not in `data/projects.js` (Studio projects) take their name from the store (`projectName` on each `/api/library` item), and every item links to its product page (`path`: `/shop/<id>`, or `/product?p=<id>` for a Studio product). Markup is `js/library-view.js` (`GS.libraryView`); `js/library.js` also redeems a guest receipt key (`/library#key=...`).

Both views are built from the same asset objects (`GS.stacc.tree`, `GS.stacc.byKind`); unit tests (`test/unit/stacc-model.test.js`) check that the same object is reached through both.

The model runs on a background thread: `js/stacc-client.js` sends `{ type: "build" }` once with the owned items and catalog, then `{ type: "view", view, filter }` for each view or filter change, to a Web Worker (`js/stacc-worker.js`) that loads the same `js/stacc-model.js` and answers with `GS.stacc.answer`. The newest request wins, so a slow answer never draws over a newer view. Where Worker is missing or fails to load (file:// previews, old browsers), the same `answer` runs on the page instead. The account pages' CSP needs no `worker-src`: it falls back to `script-src 'self'`.

## Downloads

Every file has its own Download button (a fresh 5-minute signed link per click, as before). Checkboxes, with "select all" per Pac and per content type, feed **Download selected**: the page asks for each file's link in turn and saves them one after another. No ZIP yet (see [architecture](architecture.md#not-built-yet-on-purpose)).

## Follows and Auto-Stacc

On `/projects` (or any project card: home page, dashboard) a signed-in customer can follow a project and switch Auto-Stacc on. Your Stacc then lists the followed projects' published products they don't own yet ("New from projects you follow"). With Auto-Stacc on, free products of that project are granted automatically (on follow, and every time the library opens), so they appear as owned with the source "auto". Paid products are never granted by following. Unfollowing keeps what was already added.

API: `GET /api/projects` (published projects, plus your follows when signed in), `PUT /api/follows/:projectId {autoStacc}`, `DELETE /api/follows/:projectId`. Tests: `test/api/platform.suite.js`.
