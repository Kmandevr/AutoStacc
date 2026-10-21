#!/bin/bash
# Repo hygiene checks for release-check. Prints PASS/WARN/FAIL lines. Exit 1 on any FAIL.
cd "$(git rev-parse --show-toplevel)"
fail=0
report() { echo "$1 $2 - $3"; [ "$1" = FAIL ] && fail=1; return 0; }

blank=$(.claude/tools/tree.sh --all | awk 'NF==1' | tr '\n' ' ')
[ -n "$blank" ] && report FAIL repo-map "no purpose line for: $blank" || report PASS repo-map "every file has a purpose line"

for f in docs/*.md; do
  grep -q '^summary:' "$f" || report FAIL notes-frontmatter "missing summary: ($f)"
  grep -q '^updated:' "$f" || report FAIL notes-frontmatter "missing updated: ($f)"
done
# Wikilinks, links and named paths: scripts/docs-test.js (its own step in release-check).

for d in graphify-out .serena/cache .serena/logs .serena/memories; do
  git ls-files --error-unmatch "$d" >/dev/null 2>&1 && report FAIL generated-tracked "$d is tracked"
done
[ -z "$(git status --porcelain)" ] && report PASS git-clean "working tree clean" || report WARN uncommitted "$(git status --porcelain | wc -l) uncommitted change(s)"

git ls-files --error-unmatch .dev.vars >/dev/null 2>&1 && report FAIL secrets-tracked ".dev.vars is tracked"
git grep -nE '(sk|rk)_live_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{20,}|xkeysib-[a-f0-9]{20,}' -- ':!*.md' >/dev/null 2>&1 && report FAIL secrets "a live-looking key is committed (git grep for sk_live_/whsec_/xkeysib-)" || report PASS secrets "no keys committed"
# Facts not set yet are empty strings, never placeholders (#173): warn so the owner fills them in.
grep -q 'email: ""' data/projects.js && report WARN unset "a project has no booking email (data/projects.js)"
grep -q 'newsletterAction: ""' data/projects.js && report WARN unset "a project has an empty newsletterAction (data/projects.js)"
# The code-based catalog is retired (#176): products, Stacclets, Pacs, releases and events are Studio content.
for f in data/products.js data/pacs.js data/stacclets.js data/news.js data/shows.js data/music.js; do
  [ -e "$f" ] && report FAIL retired-data "$f is back; that content is made in the Studio"
done
# Context hygiene: no requirement lost from CLAUDE.md or the rules, CLAUDE.md within budget, handoff sound.
ctx=$(.claude/skills/handoff/check.sh) || fail=1
echo "$ctx" | grep -v '^PASS context$' || true
exit $fail
