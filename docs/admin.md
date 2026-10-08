---
title: Control Center
summary: The owner's admin (/admin): statistics and where each number comes from, customer preview, support impersonation, test purchases and the audit log, with their safety rules.
updated: 2026-10-08
---

# Control Center

`/admin`, for verified admin accounts (see [store](store.md#admin)). Everything here works on the store's real data; nothing is a mock-up. Tabs: Overview (statistics), Products, Orders, Customers, Entitlements, Test purchases, Audit log. A **LIVE** or **TEST** badge at the top says whether this store takes real payments.

## Statistics (Overview)

`GET /api/admin/stats?days=&mode=live|test`, built from sections in `server/stats/` (sales, customers, products, downloads, activity). Each number is labelled with its source, and the page shows that label next to it:

| Label | Source | Trust |
| --- | --- | --- |
| Payment records | orders the payment provider confirmed | authoritative for money |
| Store records | accounts, entitlements, the download log | exact |
| Approximate · browser counts | the anonymous daily counters (`POST /api/events`) | ad blockers, bots and repeat views skew them |
| Estimate | calculated from the others (average order value, view → buy) | never a measurement; rates appear only from 50 views |

- Money is paid orders, before provider fees, per currency; refunds are counted apart. **Live** figures read only live-mode orders, so test orders can never show up as revenue; **Test** reads only test orders.
- Activity counters (page, project, product, release and news views; cart and checkout steps) store an event, an id and a day, nothing about the visitor. Event pages aren't counted because events have no page of their own.
- An admin browsing as a customer (impersonation) is never counted as a visitor, and their downloads are counted apart from customers'.
- No statistic names a customer: sections return counts and product titles only.
- Adding a metric: add it to a section's `metrics()` (or a new section file in `SECTIONS`), returning one of the shapes in `server/stats/metric.js`; the page draws it without changes. Put its SQL in the section's `queries` so the plan test checks it.
- Cost: every range query searches an index (`db/migrations/0004_admin_ops.sql`); only the all-time totals (accounts, accounts without purchases, people who own something) read a whole index, a covering one. `test/api/stats.suite.js` fails if a query starts scanning a growing table.

## Customer preview

Customers → **preview**. Read-only: their account, what their library shows (the same entitlement lookup Your Stacc uses), orders, entitlements, recent downloads, follows and past impersonations. Opening it is recorded in the audit log. It changes nothing and doesn't sign you in as them.

## Impersonate customer (support)

From a customer's preview. Opens the store as that customer so you can reproduce what they see ("why can't they see their product?").

- **Server-side, every request:** the browser holds only a random token (httpOnly cookie, its hash stored in `impersonations`). It counts only while the row is open, under 2 hours old, used in the last 30 minutes, and presented with the same admin account *and the same sign-in session* that started it. The admin must still be an admin, and the customer must exist and not be one. Anything else ends it.
- **They stay a customer:** every route sees the customer, with role forced to customer; admin routes answer 404; the admin's own guest orders are hidden.
- **Read-mostly:** reading anything they can read is allowed. Writes are refused unless a route opts in (`{ impersonation: "allow" }`): pricing the cart, asking a download link (to check access), reconciling an order. Changing their account, claiming free items, following, voting, guest keys and every Better Auth endpoint (password, profile, sign-out) are refused. Payments are refused whenever the store is live.
- **Idle means idle:** the banner's own once-a-minute check doesn't count as activity, so an open but unused tab still times out after 30 minutes.
- **Never silent:** a hazard-striped banner on every page names the customer and you, with time left and **Exit impersonation**. If it ends anywhere else (time limit, idle, signed out, cookie copied), every request fails with `impersonation_ended` and the banner turns into an "ended" warning until you exit; the browser never quietly falls back to your own session.
- **Attributed:** each allowed write is logged before it runs as "admin → as customer → `METHOD /route`" (route patterns, never tokens), plus start, end and why it ended. Orders and downloads made inside carry `impersonation_id`, so they are never mistaken for the customer's own.

Code: `server/impersonation/` (`sessions.js` rules, `policy.js` gate, `routes.js` start/exit), `js/impersonation.js` + `css/impersonation.css` (banner, loaded by `js/account-nav.js` only while impersonating).

## Test purchases

Only in a **TEST** store (mock payments, or Stripe with a test key: local `npm run dev` or a preview deployment). A live store refuses them, and the store's config already refuses test keys in production, so a test can't become revenue.

1. Customers → preview a customer → choose a product → **Start test purchase**. This opens an impersonation (purpose "test-purchase") and takes you to the product.
2. Buy it the normal way: cart, checkout, the payment page (Stripe test card `4242 4242 4242 4242`).
3. Open Your Stacc, download a file, then **Exit impersonation**.
4. **Test purchases** tab → **verify**: test order, paid, entitlement created, in their library, download authorized (same checks the store uses), downloaded during the test, receipt email.

A test purchase is a real purchase in that test store: the customer's order history and library show it (that is what you are checking), with "placed by an admin" in their preview, and the receipt goes to their address through the store's email setup. Use a test customer account if that matters. Live statistics never include it (test orders are livemode 0).

It is the production checkout, not a copy: the order is created by `POST /api/checkout` and fulfilled by the payment pipeline. The only differences are that the order is stamped with the impersonation, and that it never reuses (or is reused as) the customer's own pending order.

## Audit log

`admin_audit`, append-only (database triggers refuse updates and deletes), read in the Audit log tab (`GET /api/admin/audit`, admin only). Recorded:

- admin signed in; impersonation started, ended (with reason) and every write inside it; test purchase started; customer previewed
- product sales paused or resumed, file added, replaced (new version) or deactivated, preview uploaded; receipt resent; entitlement granted or revoked
- by the database itself, as "catalog sync": product created, price changed, published, unpublished, removed; project created, published, unpublished

Not recorded here: news and events, which are edited in `data/` and published by deploy. Their history is git's. No passwords, tokens, keys, card data or customer emails are stored in entries; customers are identified by account id and shown by email only when an admin reads the log.
