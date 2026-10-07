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
grep -l '\[\[' docs/*.md 2>/dev/null | while read -r f; do report WARN wikilink "[[wikilink]] found ($f)"; done

for d in graphify-out .serena/cache .serena/logs .serena/memories; do
  git ls-files --error-unmatch "$d" >/dev/null 2>&1 && report FAIL generated-tracked "$d is tracked"
done
[ -z "$(git status --porcelain)" ] && report PASS git-clean "working tree clean" || report WARN uncommitted "$(git status --porcelain | wc -l) uncommitted change(s)"

grep -q 'checkoutUrl: ""' data/products.js && report WARN placeholder "products with empty checkoutUrl (data/products.js)"
grep -q 'email: ""' data/site.js && report WARN placeholder "no booking email (data/site.js)"
grep -q "draft: true" data/*.js && report WARN placeholder "draft (placeholder) entries kept out of search (data/)"
grep -q 'newsletterAction: ""' data/site.js && report WARN placeholder "empty newsletterAction (data/site.js)"
exit $fail
