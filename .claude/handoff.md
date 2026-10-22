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

- #206 (feel), all pushed: frame space kept before paint + main fills screen + [data-browse] min-height (CLS 0.000 at
  390px, <=0.017 at 1440px, scratchpad/browser/cls.js); drawer scrim fades (.open); press states; 44px targets; theme
  switch = [data-theme-cycle] in account menu + footer (js/theme.js); "/" prefetched eagerly (unit test updated, passes);
  G&S hero shorter on phones; html.fx-lite adaptive effects (theme.js heuristics + motion.js frame check); account
  menu exit fade.

- #207 (blocks), all pushed: project-card personality (migration 0065, server/projects/personality.js, studio UI),
  .card-type label, poster (compact) card; server/spotlight/ (0066) + admin tab; GS.shelves (js/browse-shelves.js,
  css/shelves.css: rotate/picks/spotlight/row/tabs); creator bio (0067). Avatar/banner -> #211.

## Next
#208 pages (Discover /discover, New & upcoming, store creator spots, home cuts, signed-in /, nav), then #209, #210. Open a PR only if the owner asks (CLAUDE.md).
