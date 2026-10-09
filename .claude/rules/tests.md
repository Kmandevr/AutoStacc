---
paths:
  - "test/**"
---

# Store tests

- Three layers, one folder each: `test/unit/` (pure modules, no servers, seconds), `test/api/` (HTTP against local stores started by `support/servers.js`: mock payments, and Stripe mode with `support/fake-stripe.js`), `test/browser/` (Chromium via Playwright against a local store). Shared helpers live in `test/support/` (the API group runner is `test/api/group.js`).
- Attack, don't just confirm: for every rule a feature relies on, add the request that would break it (tampered field, other person's id, replay, race, expired thing, wrong method or origin) and assert it fails closed. Happy paths are one test each.
- One suite file per area (`test/api/<area>.suite.js`), registered in one of the parallel groups `test/api/accounts.test.js` (mock store only: `auth`, `downloads`, `guests`, `hygiene`, `admin`, `platform`, `pages`, `stats`, `creators`, `account`) or `test/api/payments.test.js` (mock and Stripe-mode stores: `commerce`, `webhooks`, `impersonation`, `promotions`, `selling`, `refunds`, `payouts`); browser tests live in the groups `test/browser/flows.test.js`, `layout.test.js` and `features.test.js`, with shared helpers in `test/support/browser.js`. Each test makes its own users with `unique()` emails and its own `Client` (both in `test/support/client.js`) (own cookies and client IP, so rate limits don't collide).
- Webhooks are signed with the real Stripe library (`sendWebhook`); never bypass verification in a test.
- Assert on status codes, error codes and database facts (`sql()`), not on English messages, except where the message is the feature.
- A bug fix starts with a failing test in the suite for its area. Never skip, weaken or delete a test to get green.
- Run: `npm test`, `npm run test:api`, `npm run test:browser`, or `npm run test:store` for both store suites at once (the `store-check` skill runs it). Groups run in parallel with their own stores and ports, so a test never relies on another group; within a group, tests run in order.
