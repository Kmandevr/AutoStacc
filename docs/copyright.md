---
title: Copyright notices and strikes
summary: Built steps 1 and 2 of 4 (#137): the public notice form, copyright notices recorded and decided in the Control Center, strikes for the uploader (whole) and the creator space (half, whole for the owner's own upload), levels computed when asked, and what level 2 stops (publishing and pricing for an account; sales, free claims and Auto-Stacc for a space).
covers: [server/copyright/, db/migrations/0037_copyright.sql, db/migrations/0038_copyright_form.sql, copyright-notice.html, js/copyright-notice.js, js/admin-copyright.js, test/api/copyright.suite.js, test/unit/copyright-standing.test.js]
updated: 2026-10-20
---

# Copyright notices and strikes

The policy is in [community safety](community-safety.md#copyright-tiered-strikes) and the public page `/copyright` (`data/legal.js`); the owner's choices and the four-step plan are in [decisions](decisions.md#2026-10-20-copyright-strikes-the-details-owner-and-the-build-plan). This note is what's built.

## Built (step 1)

- **Its own area, `server/copyright/`**, outside the community, since strikes cover every kind of upload. Other modules never read its tables: they ask `standing.js`.
- **Notices** (`notices.js`, `copyright_notices`): an admin records one that came to the support address (claimant, the work, where it is, the statements), then accepts it naming the creator space and, when known, the uploading account (any account, even one that has left the team since; "the owner uploaded it" means the space's founder or its owner now), rejects it with a note, or later withdraws an accepted one (its strikes end; who withdrew it is kept). Decisions are compare-and-set and audited (`copyright.notice_recorded`, `_accepted`, `_rejected`, `_withdrawn`, `copyright.hold_set`, `_lifted`), never with an email. Control Center: Daily › Copyright (`js/admin-copyright.js`).
- **Strikes** (`strikes.js`, `copyright_strikes`): the uploader gets a whole strike (2 units); the space gets half (1 unit), or whole when its owner uploaded it or no uploader is named. 12 months, or until countered or withdrawn.
- **Levels** (`standing.js`): whole strikes rounded down, up to 3; an admin's hold (`copyright_holds`) is 3. Computed when asked, so expiry needs no sweep. `accountLevel`, `creatorLevel`, `creatorsSellingPaused`, `mayPublish`.
- **What level 2 stops:**
  - An account can't create, price or publish products, or start a sale, in any creator space (`server/studio/products.js`, `pricing.js`: `copyright_paused`).
  - A creator space's products are held in the cart (`held: "copyright"`, `server/cart/pricing.js`), checkout refuses them (`seller_paused`), free claims refuse (`server/entitlements/routes.js`) and Auto-Stacc skips them (`server/entitlements/autostacc.js`), all through `pausedByCopyright` in `server/payments/creator-sales.js`.
  - An account at two strikes also can't resume a paused product's sales, add files to a product (`server/studio/product-files.js`) or publish a Pac version (`server/packs/routes.js`; an admin still can), so no new content goes on sale through a product already selling.
  - The cart's reason is the generic `seller_paused`, so nobody learns from a cart that a space has strikes.
  - Carts and checkouts skip the strike lookups entirely while no creator space has an active strike or hold (`anyCreatorStanding`).
  - It never writes `products.sales_paused` (the creator's own switch). Payments, fulfilment, entitlements and downloads are untouched: what people already have stays theirs.

## Built (step 2): the public form

`/copyright-notice` (`copyright-notice.html`, `js/copyright-notice.js`, linked from `/copyright`) sends `POST /api/copyright/notices` (`server/copyright/filing.js`, no sign-in): name, email, postal address, owner or agent (migration 0038), the work, up to 20 places on AutoStacc, both statements and a typed signature that must match the name. It lands as `received` with `source` `form` in Daily › Copyright, and the admins get at most one email an hour. The answer is the same `202` whatever the notice names, and a filled-in hidden field is quietly dropped. Limits: 5 an hour per address (refused tries count), 10 a day per claimant email, 200 a day in all. Turnstile once its keys exist.

## Next steps

3. Removing and restoring each kind of target through its owning module (`targets.js`), a core `legalRestore` for the community, counter-notices and the sweep that restores countered items. A file removed by a valid notice can't be downloaded by anyone (owner, 2026-10-20; buyers can get a refund).
4. Level 3: a gate on Studio writes in `server/app.js` (payouts keep working) and the community's check on links in posts.
