# Handoff
Commit: 3a732fe
Branch: claude/autostacc-ux-redesign-7w071s (restarted from main after PR #95 merged)

## Goal
Store discovery: structured metadata, server-side filters/search/sort/pages, personalized recommendations without
invasive tracking, wishlists, Studio metadata editing; real data only (no fake reviews, sales, specs).

## Done and verified
- server/discovery/ (vocabulary, filters, search SQL, signals, weights, rank, recommend, present, routes), server/wishlist/,
  migration 0012_discovery.sql, catalog sync of facets, Studio store details, store page rebuilt (js/store-*.js,
  js/wishlist.js, js/similar.js, css/store.css), product pages, privacy, docs/discovery.md.
- `npm run test:store`: 214/214. `npm test`: 81/81. verify-site: 0 fail, 0 warn. seo-test: 0 fail. docs-test: pass.

## Open
- No reviews/ratings data: issue #96. FTS5 search when the catalog grows: issue #97.
- No PR opened (not asked).

## Next
Watch real usage; tune server/discovery/weights.js only with measured engagement.

## Read first
`docs/discovery.md`, `server/discovery/rank.js`, `server/discovery/search.js`, `js/store-browse.js`
