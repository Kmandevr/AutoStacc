#!/bin/bash
# Prints a one-line-per-file map of the repo (path, then its purpose line).
# Used as the session's top-level overview. Purposes come from each file's own
# first comment, frontmatter title or meta description, so the map can't go stale.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"

purpose() {
  case "$1" in
    *.js)   sed -n '1s|^// *||p' "$1" ;;
    *.css)  sed -n '1s|^/\* *||; 1s| *\*/$||p' "$1" ;;
    *.html) sed -n 's|.*<meta name="description" content="\([^"]*\)".*|\1|p' "$1" | head -1 ;;
    *.md)   sed -n 's|^summary: *||p' "$1" | head -1 ;;
  esac
}

git ls-files | grep -Ev '^(\.claude/|\.gitignore|\.graphifyignore|docs/\.|CLAUDE\.md|README\.md)' | sort | while read -r f; do
  printf '%-22s %s\n' "$f" "$(purpose "$f")"
done
