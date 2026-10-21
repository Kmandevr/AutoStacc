---
title: Copyright notices and strikes
summary: Built (#137): level 3 (Studio closed, no links in posts), takedowns, counter-notices and restoring, the public notice form, takedowns, counter-notices and restoring, the public notice form, copyright notices recorded and decided in the Control Center, strikes for the uploader (whole) and the creator space (half, whole for the owner's own upload), levels computed when asked, and what level 2 stops (publishing and pricing for an account; sales, free claims and Auto-Stacc for a space).
covers: [server/copyright/, server/community/features/textonly/, db/migrations/0037_copyright.sql, db/migrations/0038_copyright_form.sql, db/migrations/0039_copyright_takedowns.sql, copyright-notice.html, js/copyright-notice.js, js/copyright-counter.js, js/admin-copyright.js, test/api/copyright.suite.js, test/unit/copyright-standing.test.js, test/unit/copyright-filing.test.js, test/unit/copyright-business-days.test.js]
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

`/copyright-notice` (`copyright-notice.html`, `js/copyright-notice.js`, linked from `/copyright`) sends `POST /api/copyright/notices` (`server/copyright/filing.js`, no sign-in): name, email, postal address, owner or agent (migration 0038), the work, up to 20 places on AutoStacc, both statements and a typed signature that must match the name. It lands as `received` with `source` `form` in Daily › Copyright, and the admins get at most one email an hour. The answer is the same `202` whatever the notice names, and a filled-in hidden field is quietly dropped. Limits (security review, 2026-10-20): 5 an hour per network (an IPv4 address, or an IPv6 /64 however it's written), 10 complete notices a day per claimant email (junk can't use a claimant's allowance), and past 200 a day notices are still kept but the admins' email waits; refusals point to the email address on `/copyright`. Every waiting notice is listed in the Control Center, oldest first, so junk can't push a real one out of view. Signatures match names in any alphabet. Turnstile once its keys exist; admin alert emails can rarely double when two notices land in the same instant. The page loads `js/skeleton.js`, so its send button shows a spinner while the notice is sent (2026-10-21).

## Built (step 3): takedowns, counter-notices, restoring

- **What a notice takes down** (`targets.js`, `takedown.js`, `copyright_notice_targets`): when accepting, the admin names up to 20 things as `kind:id`: `product_file` (held through `server/files/files.js` `holdFile`: `held_at` is part of the one deliverable rule, so the file reaches nobody, past buyers included, but stays active so its bytes and stored original are kept; a Studio product left with nothing to download goes back to draft, and doesn't republish by itself when the file comes back), `thread` and `post` (the community core's `legalRemove`, and `legalRestore` to undo it). `targets.js` is the only file that calls the owning modules.
- **The uploader is told** (`mail.js`, email `copyright-takedown`; the creator space's owners when no uploader was named): the work and where, never the claimant's details, with a link to `/copyright-notice?counter=<notice>`.
- **Counter-notices** (`counter.js`, `copyright_counter_notices`, `js/copyright-counter.js`): signed in, the uploader (or the space's owner when no uploader was named) answers once with name, email, postal address, both statements and a matching signature. The claimant gets it by email (`copyright-counter-notice`, as the law requires) and the admins are alerted. The content comes back after 11 US business days (`business-days.js`: weekends and federal holidays don't count, so never before the 10 the law asks) unless an admin notes the claimant went to court ("Claimant went to court" in Daily › Copyright), and only once the claimant was actually emailed the counter-notice (`claimant_told_at`; otherwise the admins are told).
- **Only what's up can be taken down** (security review, 2026-10-20): a file already held or unpublished, a post already removed or hidden, or a file of another creator space than the one named, is refused when accepting, and a takedown is recorded only when it changed something, so a counter-notice or withdrawal brings back exactly what that notice took down and never another notice's hold or another kind of removal. Holding or releasing a file also refreshes the product's listed contents.
- **Restoring** (`sweep.js` in the daily sweep): due counter-notices restore every target and end the notice's strikes as countered, once. Takedowns and restores that failed are retried by the next sweep. Withdrawing a notice also brings back what it took down and closes a waiting counter-notice.

Known gaps: a hold is per product file, so the same bytes published as another product's file, a product's preview clip, site images and library pieces aren't takedown targets yet; a catalog (non-Studio) product whose files are all held stays listed.

## Built (step 4): level 3, text only

- **The Studio** (`server/copyright/policy.js`, one gate in `server/app.js` beside the impersonation policy): every `POST`, `PUT` or `PATCH` under `/api/studio/` from an account at three strikes is refused (`copyright_text_only`): no products, uploads, Pacs, sites, images, library pieces or invitations. Deleting stays open (people can always take their own work down), and so do getting paid (payouts, the payout account), paying storage statements and looking at an invitation (routes marked `{ copyright: "allow" }`). Reading the Studio stays open, so earnings and history are still there.
- **The community** (feature `textonly`, switch `community.textOnly`): a take, reply or edit with a link from such an account is refused, using the formatter's own rule (`hasLink` in `server/community/core/format.js`), so the check and what readers see can't disagree. Links already in older posts still show.
- **No way round it** (security review, 2026-10-20): a site publish scheduled before the third strike is dropped instead of published (`server/sites/schedule.js`), and an invitation sent by such an account can't be accepted (`server/creators/team.js`). The gate skips its reads while no account has strikes. The storage plan stays changeable, so existing storage can stay paid for.
- **Open question for the owner:** whether a creator space that itself reaches three strikes (from members' half strikes or the owner's whole ones) closes its Studio to the whole team, not only to the accounts that are at three.

## Later

- Stripping links from an account's older posts as pages are drawn, takedown targets for preview clips, site images and library pieces, holding the same bytes wherever they're published, unlisting a catalog product whose files are all held, and Turnstile on the notice form.
