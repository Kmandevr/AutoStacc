---
title: Your Stacc
summary: The customer library ("Your Stacc"): content-level views by project, Stacclet, Pac, content type and format, selected downloads, personal collections, tags and saved searches, follows and Auto-Stacc.
covers: [library.html, js/library.js, js/library-view.js, js/library-personal.js, js/library-bundle.js, server/collections/, db/migrations/0019_collections.sql, js/stacc-model.js, js/stacc-client.js, js/stacc-worker.js, css/stacc.css, server/entitlements/, server/projects/, js/stacc-glance.js, data/content-types.js]
updated: 2026-10-27
---

# Your Stacc

`/library` is Your Stacc: the content a customer can use, not a receipt list. Ownership and downloads are the store's ([store](store.md#entitlements)); this note is about organizing them. Model: [architecture](architecture.md).

## Where the data comes from

1. `GET /api/library` (server, from `entitlements`; it runs the Auto-Stacc grant first for a signed-in account): owned products, each with its `projectId`, `pacs`, `sources` and deliverable files, and each file's `pacId`, `kind`, size and name, plus the names and projects of the owned Pacs and their Stacclets (`stacclets`, `pacs`, from D1; data/stacclets.js and data/pacs.js were retired, #176). Unchanged rules: only active entitlements, only active, published files ([store](store.md)), storage keys never sent. Free claims (`POST /api/library/free`) and the Auto-Stacc grant refuse or skip a creator space whose selling is paused by copyright strikes ([copyright](copyright.md)); what's already in Your Stacc stays.
2. `data/projects.js` (static) and `data/content-types.js` (generated from the vocabulary's `KINDS`, with `CONTENT_TYPE_ALIASES` for old kind names): names and structure.
3. `js/stacc-model.js` joins them into one list of **assets**, one object per file, each knowing its project, Stacclet, Pac, product, kind and format. A file's kind is what the admin chose at upload (an old name such as `samples` counts as its new kind, `one-shots`; old `?kind=samples` links still work), else guessed from its extension (`content-types.js` `formats`).

While Your Stacc loads (2026-10-21) it shows placeholder rows (`GS.skeleton`, [modules](modules.md#shared-helpers-every-feature-uses)), then placeholders in the files box while follows and discovery load; the dashboard's "Your Stacc at a glance" boxes do the same, and collection actions show a spinner on their button. `server/projects/` also holds the public creators directory (`GET /api/creators`, [browse](browse.md)), which reads nothing from Your Stacc.

## Views (same assets, no copies)

- **By project:** Project → Stacclet → Pac → content type → files; files uploaded without a Pac sit under their product.
- **By content type:** MIDI, One-shots, Loops, Presets, … each with a count, across every project, each file showing where it came from.
- **Filters:** project, content type and format apply to both views.

Search narrows files as you type (every word in the file's name, file name or product title); on `/library` the view, search and filters live in the address (`?q=&project=&kind=&format=&view=kinds`) ([browse](browse.md)).

Owned products with no deliverable file yet are listed under **On the way**. Projects not in `data/projects.js` (Studio projects) take their name from the store (`projectName` on each `/api/library` item), and every item links to its product page (`path`: `/shop/<id>` for every product, #175). Markup is `js/library-view.js` (`GS.libraryView`); `js/library.js` also redeems a guest receipt key (`/library#key=...`).

Both views are built from the same asset objects (`GS.stacc.tree`, `GS.stacc.byKind`); unit tests (`test/unit/stacc-model.test.js`) check that the same object is reached through both.

The model runs on a background thread: `js/stacc-client.js` sends `{ type: "build" }` once with the owned items and catalog, then `{ type: "view", view, filter }` for each view or filter change, to a Web Worker (`js/stacc-worker.js`) that loads the same `js/stacc-model.js` and answers with `GS.stacc.answer`. The newest request wins, so a slow answer never draws over a newer view. Where Worker is missing or fails to load (file:// previews, old browsers), the same `answer` runs on the page instead. The account pages' CSP needs no `worker-src`: it falls back to `script-src 'self'`.

## Downloads

Every file has its own Download button (a fresh 5-minute signed link per click, as before). Checkboxes, with "select all" per Pac and per content type, feed **Download selected**: the page asks for each file's link in turn and saves them one after another.

A Pac published from the Pack Builder keeps its creator's folders: inside it, Your Stacc shows them as a nested tree (folders inside folders, each a foldable `<details>` with its own files; top-level files at the Pac's root) instead of content types, and search matches folder names (`folderPath` from `/api/library`; `foldersOf` in `js/stacc-model.js` builds `{ name, path, assets, folders, count }`, `js/library-view.js` draws it). Each folder has **Select all** and **Download folder (ZIP)**, and the Pac's root **Download all (ZIP)**, each covering the files in it and below (`js/library-bundle.js`, `POST /api/downloads/bundle`): one ZIP of the original bytes, for files the API marks `bundleable`, offered for 2 to 2,000 files (the store's limit).

Each Pac (or a Studio product's files) starts with what its creator sent along: up to three public preview clips (`previews` from `/api/library`, `<audio controls preload="none">` each with its title; only `/media/` addresses are played) and its read me (`readme`: the text of the Pac's top-level "Read me….txt", folded under **Read me**, shown as escaped plain text). Clips belong to their Pac; the read me is its product's (`extrasFrom` in the model, kept with the assets in the worker). A file a newer version replaced or removed (`retiredAt`) stays listed and downloadable for people who had it before, for 30 days ([packs](packs.md)): its row says "removed in an update" with the last day (`availableUntil`), and its Pac or product shows **Updated**. Files a revision kept (unchanged or moved) keep their id, so selections and download history stay valid.

## Collections, tags and saved searches

A signed-in person can organize Your Stacc their own way (feature switch `library.collections`; `server/collections/`, `js/library-personal.js`, `db/migrations/0019_collections.sql`). It never changes what creators said about their files, and nobody else sees it.

- **Collections**: tick files, then **Add to** an existing collection or a new one (up to 100 collections, 2,000 files each; names unique per person). The Collection menu filters by one; inside it, the selected files can be taken out, and the collection renamed or deleted (its files stay in Your Stacc).
- **Tags**: tick files and **Tag** them (up to 20 tags per file and 5,000 in all, capped inside each write; lowercase words of up to 30 letters or numbers). Tags show on each file, with ✕ to remove one; the Tag menu filters by one, and search finds them.
- **Saved searches**: with any filter or search on, **Save search** keeps the address (`/library?…`, only Your Stacc's own filter names; up to 50); each is a link back to it.
- **Items survive revisions**: collections and tags point at a file's asset (the same across a Pac's versions, so a moved or unchanged file stays in them) or, for a file with no asset, its file id. A file that stops being the person's (removed in an update and its 30 days passed, a refund) is counted, never listed: "N no longer in Your Stacc" with **Clear them**.
- **Only their own files**: every add goes through what the person's account can download right now (`server/entitlements/owned.js`; a guest receipt's key in the same browser doesn't count); another person's file id, collection or saved search is 404, the same as one that doesn't exist. Writes are rate-limited and refused during a support impersonation.
- **Their data**: included in the data download (`collections`, `tags`, `savedSearches`) and deleted with the account; on [/privacy](../data/legal.js).

## Follows and Auto-Stacc

On Discover's Projects tab (or any project card: home page, dashboard, product pages' Made by) a signed-in customer can follow a project and switch Auto-Stacc on. Your Stacc then lists the followed projects' published products they don't own yet ("New from projects you follow"). With Auto-Stacc on, free products of that project are granted automatically (on follow, and every time the library opens), so they appear as owned with the source "auto" (shown as "added by Auto-Stacc"). Auto-Stacc is off until switched on, per project; the follow control, Help and the Your Stacc intro say that following never unlocks paid products. Paid products are never granted by following. Unfollowing keeps what was already added.

API: `GET /api/projects` (published projects, plus your follows when signed in), `PUT /api/follows/:projectId {autoStacc}`, `DELETE /api/follows/:projectId`. Tests: `test/api/platform.suite.js`.
