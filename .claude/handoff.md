# Handoff
Branch: ccr-5bddfabf-4r2cg1 (pushed after every step)

## Goal
Owner's UX overhaul #204: work through batches #205 to #210 in order without asking unless blocked. Owner asked:
token efficiency and quality over speed, don't run tests unless needed (node_modules/wrangler are not installed here,
so API/browser suites can't run locally; CI runs them), commit and push often. Plan page:
https://claude.ai/artifact/7XKCsCFBi35Lm3zcuJbHUJ. Decisions: docs/decisions.md 2026-10-22.

## Done
- #205 (community), all pushed: browser feature switches follow production FEATURES_ON (build.js reads wrangler.toml);
  Post as team (migration 0064, as_team), clearer name step, new-take form filters channels/kinds (spaceMine mayUpdate,
  name); G&S community feature + admin team in first-party spaces + project nav link + breadcrumb; search ?q= and
  "only this space"; Saved empty state; profile cards show staff/creator teams; Team desk in the Studio
  (/studio?desk=<id>, js/community-desk.js tabs, js/studio-desk.js, slim link on space page); slow mode desk control.
  New API tests added (community-posting, community-projects suites) but NOT run locally.
- Not done in #205 (moved): waiting count + top-bar bell -> #209.

## Next
#206 smooth and alive, then #207, #208, #209, #210. Open a PR only if the owner asks (CLAUDE.md).
