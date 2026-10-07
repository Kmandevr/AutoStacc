---
paths:
  - "test/**"
---

# Store tests

- Three layers, one folder each: `test/unit/` (pure modules, no servers, seconds), `test/api/` (HTTP against local stores started by `support/servers.js`: mock payments, and Stripe mode with `support/fake-stripe.js`), `test/browser/` (Chromium via Playwright against a local store). Shared helpers live in `test/support/` only.
- Attack, don't just confirm: for every rule a feature relies on, add the request that would break it (tampered field, other person's id, replay, race, expired thing, wrong method or origin) and assert it fails closed. Happy paths are one test each.
- One suite file per area (`auth`, `commerce`, `webhooks`, `downloads`, `guests`, `hygiene`, `admin`, `platform`), registered in `test/api/run.test.js`. Each test makes its own users with `unique()` emails and its own `Client` (own cookies and client IP, so rate limits don't collide).
- Webhooks are signed with the real Stripe library (`sendWebhook`); never bypass verification in a test.
- Assert on status codes, error codes and database facts (`sql()`), not on English messages, except where the message is the feature.
- A bug fix starts with a failing test in the suite for its area. Never skip, weaken or delete a test to get green.
- Run: `npm test`, `npm run test:api`, `npm run test:browser` (the `store-check` skill runs all three).
