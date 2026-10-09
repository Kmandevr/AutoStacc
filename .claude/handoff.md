# Handoff
Commit: 0dc598e
Branch: claude/autostacc-ux-redesign-7w071s

## Goal
Projects browser separate from the store (nothing bought there), Studio projects listed and marked unverified, follow and
Auto-Stacc for all; the same discovery treatment on home, a new /explore (releases, news, shows), dashboard sections and
Your Stacc search. Owner's answers: docs/decisions.md 2026-10-09. One PR.

## Done and verified
- server/projects/browse.js + GET /api/projects/browse, migration 0013, catalog sync of genres/activity, VISIBLE rule for
  Studio projects (follows, Auto-Stacc), js/follow.js, js/project-card.js, js/projects-browse.js, /explore
  (js/explore-items.js, js/explore-browse.js), home hub (js/project-picks.js, js/latest.js, store sections reused),
  dashboard sections, Your Stacc search; privacy page; docs/browse.md and the notes it touches.
- Independent code, security and frontend reviews; their findings fixed (two hardening items included).
- npm test 84/84; npm run test:store 218/218 (with the preview server stopped: on 4 CPUs a parallel run can time out);
  verify-site 0 fail (2 warns: inline text links); seo-test 0 fail; docs-test pass.

## Open
- Not done from review (polish): shared drawer/chips/pager helper for store, projects and explore browsers.
- Studio projects' events blocks aren't in /explore (they live in site documents).

## Read first
docs/browse.md, server/projects/browse.js, js/projects-browse.js, js/explore-browse.js
