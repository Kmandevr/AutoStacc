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

- #208 (pages), partly: discover.html + js/discover.js + css/discover.css (tabs as links, removes closed panels),
  /projects and /creators 301 (seo-test allows ?query targets), nav + rename, home cut, Made by + Buy now,
  store project matches / Shop by project. Open items listed in the #208 comment (signed-in /, rows on explore/store,
  community/guides headers, G&S show more).

- #209, partly: switches grouped + single home + paused banner; stats tabs; top-bar bell (js/account-nav.js).
- #210, partly: store dead ends fixed; About draft posted on #210 for the owner's sign-off (not on the site yet).
- Checks run at the end: build clean, seo-test PASS, docs-test PASS, unit tests 228/228. API and browser suites
  not run here (no node_modules/wrangler); CI will run them.

## Next (open items, also listed in the #208, #209 and #210 comments)
- #210: put the approved About wording in about.html (+ css/about.css), cut how-to copy where /guide covers it,
  plain-word pairing for brand terms.
- #208: signed-in / as personal home (+ /dashboard redirect, gate and browser tests), spotlight/rows on explore and
  store, community/guides list-first headers, G&S "show more".
- #209: one shared tabs component; personal home tabs; desk waiting counts in the bell.
- #211: creator avatar and banner.
- No PR opened (owner hasn't asked). Open a PR only if the owner asks (CLAUDE.md).
