# Handoff
Branch: ccr-5bddfabf-4r2cg1 (restarted from main after #212 merged; pushed)

## Goal
Owner's UX overhaul #204 (batches #205 to #210, plus #211). Plan page: https://claude.ai/artifact/7XKCsCFBi35Lm3zcuJbHUJ.
Decisions: docs/decisions.md 2026-10-22.

## Done on this branch (after #212)
- Fixed every CI failure #212 left: seo (stale notes, orphan pages: Discover All keeps a built A-Z list), browser,
  store and store-browser suites (tests updated, bio clear bug, product offline state, cart message, logout helper).
- #210: new About (draft on #210, for the owner's sign-off at merge), Stacc words in the Your Stacc guide, store how-to
  becomes one line, plain words for Auto-Stacc.
- #208: signed-in / is the home (functions/_middleware.js -> guardHome; /dashboard 302 to / with its query);
  spotlight on Store and New & upcoming (js/page-spotlight.js, below the main list); Guides "Start here"; G&S
  About emblem smaller on phones.
- #209: GS.tabs in js/util.js used by desk, stats, shelves; home tabs (Overview, Discover, Community, Account);
  desk link on the space page shows "N waiting".
- #211: creator avatar and banner (migration 0068, js/studio-creator-images.js, ownImage, kept while used).

## Verified locally
npm ci done. API suites 421/421 (then studio 49/49 after #211); browser 68/69 (the one failure is #192, also on
58acad0); unit 228/228; seo-test PASS; docs-test PASS; verify-site 0 fail.

## Open
- Desk items in the top-bar bell (needs a server count across features; not started).
- No PR opened yet (ask the owner).
