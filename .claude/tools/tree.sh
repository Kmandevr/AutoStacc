#!/bin/bash
# Repo map in layers, built from each file's own purpose line (so it can't go stale).
#   tree.sh          compact top level: root files, then one line per directory
#   tree.sh <dir>    every file in that directory with its purpose
#   tree.sh --all    every file in the repo
# A directory's purpose is the first line of its `.purpose` file.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

SKIP='(^|/)\.|^(CLAUDE|README)\.md$|package-lock\.json$'

purpose() {
  case "$1" in
    *package.json) sed -n 's|^ *"description": *"\(.*\)",*$|\1|p' "$1" | head -1 ;;
    *.js|*.cjs|*.mjs|*.ts|*.json) sed -n '1s|^// *||p' "$1" ;;
    *.sql)  sed -n '1s|^-- *||p' "$1" ;;
    *.toml|*.yml|*.sh) sed -n '1{/^#!/d;}; s|^# *||p' "$1" | head -1 ;;
    *.css)  sed -n '1s|^/\* *||; 1s| *\*/$||p' "$1" ;;
    *.html) { sed -n 's|.*<meta name="description" content="\([^"]*\)".*|\1|p' "$1"; sed -n 's|^<!-- *||p' "$1"; } | head -1 ;;
    *.md)   sed -n 's|^summary: *||p' "$1" | head -1 ;;
    _redirects|_headers|*.txt) sed -n '1s|^# *||p' "$1" ;;
    *.xml)  sed -n 's|^<!-- *\(.*\) *-->$|\1|p' "$1" | head -1 ;;
    *.png|*.jpg|*.jpeg|*.webp|*.svg|*.ico) echo "Image. See $(dirname "$1")/.purpose" ;;
  esac
}

# grep exits 1 on a dotfile-only directory; under pipefail that would end the map early.
files() { git ls-files "$@" | { grep -Ev "$SKIP" || true; } | sort; }
show()  { while read -r f; do printf '%-22s %s\n' "$f" "$(purpose "$f")"; done; }

case "${1:-}" in
  --all) files | show ;;
  "")
    files | grep -v / | show
    for d in $(git ls-files | grep / | cut -d/ -f1 | sort -u | grep -v '^\.'); do
      n=$(files "$d" | wc -l)
      [ "$n" -gt 0 ] || continue
      printf '%-22s %s\n' "$d/ ($n files)" "$(head -1 "$d/.purpose" 2>/dev/null)"
    done
    echo "Expand a directory: .claude/tools/tree.sh <dir>"
    ;;
  *) files "${1%/}" | show ;;
esac
