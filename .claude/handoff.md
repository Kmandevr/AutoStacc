# Handoff
Commit: 408361d
Branch: claude/autostacc-ux-redesign-7w071s

## Goal
UX redesign of the Admin Panel (Control Center, /admin), Creator Space (Studio, /studio) and Store (/shop, /shop/<id>,
cart, checkout), presentation only: keep APIs, payments, entitlements and server checks as they are; no invented
products, reviews or figures; accessible, responsive, reduced-motion aware. Balance all three areas.

## Done and verified
- Round 1 (Store, Control Center, Studio redesign) and round 2 (owner's request: personal picks from on-device history
  in `js/taste.js`, sort menu, labels for formats, genre and download size, Cart → Payment → In Your Stacc steps).
  Details in `docs/log.md` and `docs/decisions.md` (2026-10-09).
- `npm run test:store`: 186/186. `npm test`: 64/64. verify-site: 0 fail, 0 warn. seo-test: 0 fail. docs-test: pass.

## Open
- `js/shop.js` is ~200 lines (rule: split past ~150); the picks row could move to its own file.
- Library (Your Stacc) not reviewed visually. Admin Customers/Orders tables have no sort/search yet.
- Products have no real artwork, previews or genre of their own; labels show only what data holds.
- No PR opened (not asked).

## Next
Review Your Stacc (library.html, js/library-view.js) at phone and desktop sizes, then admin table search/sort.

## Read first
`docs/log.md`, `js/shop.js`, `js/taste.js`, `js/admin.js`, `js/studio-editor.js`
