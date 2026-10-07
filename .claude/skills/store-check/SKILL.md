---
name: store-check
description: Run the store's three test suites (unit, API security, browser chaos) and report. Use after any change to server/, functions/, db/, store pages or scripts (cart, login, account, library, checkout, admin, store.js), and before calling store work done.
---

# Store check

How the suites work and what they attack: [docs/development.md](../../../docs/development.md#tests). Don't restate it; run them.

1. `npm ci` if `node_modules` is missing (Wrangler, Better Auth, Stripe).
2. `node scripts/build.js` (the catalog and pages must be current; tests start from the build).
3. `npm test`: unit, seconds. Any FAIL: fix before going on.
4. `npm run test:api`: about 2 minutes, starts two local stores (ports 8801, 8802, fake Stripe on 8812). Make sure no old `wrangler pages dev` holds those ports.
5. `npm run test:browser`: about a minute, Chromium (needs global Playwright; preinstalled in cloud sessions).

Report each suite's `ℹ pass/fail` line and every failing test name with its assertion line, then one verdict: PASS or FAIL. A test that fails twice is a failure, never a flake.

## Fixing

- Reproduce first: re-run the one failing file (`node --test test/api/run.test.js` runs all API suites; narrow with `--test-name-pattern "<name>"`).
- Fix the code, not the test. Change a test only when its expectation was wrong, and say why in the commit.
- A bug the suites missed gets a new test in the suite for its area (`.claude/rules/tests.md`) before the fix.
- For an independent pass, ask the `commerce-tester` agent (runs and probes) and the `security-reviewer` agent (reads the diff as an attacker).
