# Handoff
Commit: eabb7bc
Branch: ccr-0cc8daba-j2q8kb

## Goal
Pack Builder and Pac editor (plan: docs/packs.md). Phases 0–9 and the Pac editor are merged (#109, #110, #114, #115):
one drop zone (file, folder or ZIP) that opens in the visual builder and waits for Publish; replace-or-add for a whole
Pac; file cards, drag and drop, previews, read me. Owner's answers: docs/decisions.md (2026-10-15 entries).

## Done and verified
- PR #115 merged with CI green (store, store-browser, browser, test, image, seo, docs).
- After it: limits and warnings (4 GB per file in `server/packs/accept.js`, browser checks in `js/pac-drop.js`,
  preview cutting up to 200 MB in `js/pac-previews.js`, builder note in `js/pac-editor.js`), previews GET makes no Pac
  (`server/packs/previews.js`), repo-map rules in `.claude/tools/tree.sh`, CLAUDE.md at 1,100 words.
- npm test 140/140; packs API group 43/43.

## Open
- Owner decisions and setup: #111. Phase 10 (optional previews, fingerprints): #112. Analysis calibration: #113.
- Not done from review (judged not worth it now): `prompt()`/`confirm()` dialogs in the builder; the part-upload retry
  loop is duplicated in `js/pac-add.js` and `js/packs-upload.js`; GET of an addition merges a finished job (as the
  version poll does). `js/pac-editor.js` is about 195 lines.

## Next
Run the full suites, open a PR for the limits and hygiene work, merge on green. Then pick from #111–#113.

## Read first
docs/packs.md ("Pac editor"), docs/decisions.md (last entries), server/packs/editor-routes.js, js/pac-drop.js
