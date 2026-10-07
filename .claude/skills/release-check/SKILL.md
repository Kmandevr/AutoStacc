---
name: release-check
description: Final pre-merge check for AutoStacc. Use before calling a change ready to merge or release, or before opening a pull request. Runs site verification and repo hygiene checks and reports PASS/WARN/FAIL.
---

# Release check

1. **Site:** run the `verify-site` skill and `node scripts/seo-test.js` (which includes `scripts/build.js --check`). Any FAIL blocks the release; the deploy runs the same SEO tests and stops on failure.
2. **Repo hygiene:** run `.claude/skills/release-check/check.sh`. It reports blank repo-map purposes, notes missing `summary:` frontmatter, wikilinks in `docs/`, generated folders that would be committed, and uncommitted changes.
3. **Content is real:** placeholder content is expected today (tracked in GitHub issues) and marked `draft: true`, which keeps it out of search. WARN, don't FAIL, but list what is still placeholder: drafts, empty `checkoutUrl`s, no booking email, empty `newsletterAction`. A made-up email or a bare-domain profile link is a FAIL (`seo-test.js`).
4. **Docs:** if behaviour or a decision changed, `docs/log.md` and `docs/decisions.md` are updated, and the issue is linked in the PR (`Closes #N`) (see `.claude/rules/docs.md`).
5. **Diff scope:** `git diff origin/main --stat`. Flag files that don't belong to the stated change. Unrelated modules should be untouched.

Report `PASS|WARN|FAIL <check> - <detail> (<file>)` lines and one verdict line: READY, READY WITH WARNINGS or NOT READY. Don't merge or open a PR yourself unless asked.
