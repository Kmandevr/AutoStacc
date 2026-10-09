---
name: release-check
description: Final pre-merge check for AutoStacc. Use before calling a change ready to merge or release, or before opening a pull request. Runs site verification and repo hygiene checks and reports PASS/WARN/FAIL.
---

# Release check

Steps 1, 2 and 5 are independent shell checks: start them together in one Bash call, each with its own output and exit code. Start the store suites (1b) and the reviewer agents the diff calls for (none for a small or single-area change; at most one per area touched) in the same message, and do the reading in steps 3 and 4 while they run. These checks only read the repo, so none waits for another (the store suites keep their own order inside `store-check`).

```sh
L=$(mktemp -d)
NODE_PATH=$(npm root -g) node .claude/skills/verify-site/check.js > $L/verify-site.txt 2>&1 & p1=$!
node scripts/seo-test.js > $L/seo-test.txt 2>&1 & p2=$!
.claude/skills/release-check/check.sh > $L/hygiene.txt 2>&1 & p3=$!
git diff origin/main --stat > $L/diff-scope.txt 2>&1 & p4=$!
node scripts/docs-test.js > $L/docs-test.txt 2>&1 & p5=$!
wait $p1; e1=$?; wait $p2; e2=$?; wait $p3; e3=$?; wait $p4; e4=$?; wait $p5; e5=$?
for n in "verify-site $e1" "seo-test $e2" "hygiene $e3" "diff-scope $e4" "docs-test $e5"; do set -- $n; echo "== $1 (exit $2)"; cat $L/$1.txt; done
```

1. **Site:** `verify-site` and `node scripts/seo-test.js` (which includes `scripts/build.js --check`). Any FAIL blocks the release; the deploy runs the same SEO tests and stops on failure.
1b. **Store:** if the diff touches `server/`, `functions/`, `db/`, `wrangler.toml`, `_headers` or store pages and scripts, run the `store-check` skill (CI runs the same in `store.yml`); start it with `run_in_background` alongside the block above. Any FAIL blocks the release. For security-relevant changes also ask the `security-reviewer` agent; it only reads, so launch it in the same message that starts the checks, and when several reviewers are wanted (`security-reviewer`, `code-reviewer`, `seo-reviewer`, `frontend-reviewer`, `backend-reviewer`), launch them all in that one message. Brief each with the diff range (`origin/main...HEAD` plus uncommitted), the changed files and any check results already in hand, so it starts from them.
2. **Repo hygiene:** `.claude/skills/release-check/check.sh`. It runs the context check (`.claude/skills/handoff/check.sh`: requirements in `must-keep.txt` still present, CLAUDE.md within budget, handoff sound) and reports blank repo-map purposes, notes missing `summary:` frontmatter, wikilinks in `docs/`, generated folders that would be committed, and uncommitted changes.
3. **Content is real:** placeholder content is expected today (tracked in GitHub issues) and marked `draft: true`, which keeps it out of search. WARN, don't FAIL, but list what is still placeholder: drafts (not buyable), no booking email, empty `newsletterAction`, store not switched on (`docs/store-setup.md`). A made-up email or a bare-domain profile link is a FAIL (`seo-test.js`).
4. **Docs:** `node scripts/docs-test.js` (CI runs it too). A FAIL blocks; each `WARN stale` names a note whose covered code changed: read its part about those files and update it, or confirm it still holds. If behaviour or a decision changed, `docs/log.md` and `docs/decisions.md` are updated, and the issue is linked in the PR (`Closes #N`) (see `.claude/rules/docs.md`).
5. **Diff scope:** `git diff origin/main --stat`. Flag files that don't belong to the stated change. Unrelated modules should be untouched.

Report `PASS|WARN|FAIL <check> - <detail> (<file>)` lines and one verdict line: READY, READY WITH WARNINGS or NOT READY. Don't merge or open a PR yourself unless asked.
