---
name: store-check
description: Run the store's three test suites (unit, API security, browser chaos) and report. Use after any change to server/, functions/, db/, store pages or scripts (cart, login, account, library, checkout, admin, store.js), and before calling store work done.
---

# Store check

How the suites work and what they attack: [docs/development.md](../../../docs/development.md#tests). Don't restate it; run them.

**While iterating** on a change, run only what it affects: `npm test` for pure modules, or the one group file for the area (see Fixing). The full steps below are required before calling store work done, opening a pull request or merging (owner's decision, 2026-10-27).

1. `npm ci` if `node_modules` is missing (Wrangler, Better Auth, Stripe). Everything below needs it.
2. **Build and unit tests together** (unit tests don't read the build). One Bash call:

   ```sh
   L=$(mktemp -d)
   node scripts/build.js > $L/build.txt 2>&1 & p1=$!
   npm test > $L/unit.txt 2>&1 & p2=$!
   wait $p1; e1=$?; wait $p2; e2=$?
   echo "== build (exit $e1)"; cat $L/build.txt; echo "== unit (exit $e2)"; grep -E '^(not ok|# (pass|fail) |ℹ (pass|fail) )' $L/unit.txt
   ```

   The platform sync (`db/catalog.sql`: creators, projects, polls) and pages must be current (tests start from the build; test products are fixtures in `test/support/catalog-fixtures.js`, never data). A build error or any unit FAIL: fix before going on.
3. `npm run test:store`: the API and browser suites together, about 2.5 minutes on 4 cores. It builds `dist/` once, then runs every group in parallel, each with its own store: API `accounts` (port 8801) and `payments` (8804, Stripe mode on 8802, fake Stripe on 8812), browser `flows` (8803), `layout` (8805) and `features` (8806); each store's devtools port is its port + 1000. Chromium needs global Playwright (preinstalled in cloud sessions). Make sure no old store holds those ports: `pgrep -x workerd | xargs -r kill` (never `pkill -f` with a pattern your own command line contains: it kills the shell).

Never run `npm run test:api` and `npm run test:browser` at the same time: each rebuilds `dist/` first, under the other's running stores. `test:store` is the parallel way.

Report each suite's `ℹ pass/fail` line and every failing test name with its assertion line, then one verdict: PASS or FAIL. A test that fails twice is a failure, never a flake.

## Fixing

- Reproduce first: re-run the one failing group file (`node --test test/api/payments.test.js`, `test/browser/features.test.js`, ...; narrow with `--test-name-pattern "<name>"`). A group file serves `dist/` as built: run `npm run site` first after changing pages or scripts.
- Fix the code, not the test. Change a test only when its expectation was wrong, and say why in the commit.
- A bug the suites missed gets a new test in the suite for its area (`.claude/rules/tests.md`) before the fix.
- Only when the change touches auth, payments, downloads, entitlements or admin (or before a release), ask for an independent pass; for other store changes the suites are enough. Ask the `commerce-tester` agent (runs and probes) and the `security-reviewer` agent (reads the diff as an attacker). They don't depend on each other: launch both in one message (two Agent calls at once), not one after the other, once step 3 has finished (the `commerce-tester` starts its own stores, which would race the suites over `dist/`). Brief both with the changed files, the diff range and each suite's pass/fail line from steps 2 and 3, so neither re-runs them.
