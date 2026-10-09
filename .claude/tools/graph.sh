#!/bin/bash
# One entry point to Graphify. Refreshes the graph only when files changed; the session-start hook runs
# `graph.sh refresh` in the background (when Graphify is installed) so the first question doesn't wait.
#   graph.sh                      print the one-page overview (GRAPH_REPORT.md)
#   graph.sh refresh              bring the graph up to date, print nothing
#   graph.sh query "<question>"   any graphify command and arguments
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

command -v graphify >/dev/null 2>&1 || uv tool install graphifyy >&2

g=graphify-out/graph.json
list=graphify-out/files.txt
files() { git ls-files -co --exclude-standard | while IFS= read -r f; do [ -f "$f" ] && echo "$f"; done | sort -u; }
# Stale when the set of files changed (added, deleted, renamed) or any file is newer than the graph.
stale() {
  [ -f "$g" ] && [ -f "$list" ] && [ "$(files)" = "$(cat "$list")" ] || return 0
  local f
  while IFS= read -r f; do [ "$f" -nt "$g" ] && return 0; done < "$list"
  return 1
}
# --force lets the graph shrink after deletions; Graphify skips writing an unchanged graph, so touch it. One rebuild at a
# time (the session-start hook starts one in the background): a second caller waits for it, then finds the graph fresh.
mkdir -p graphify-out
exec 9>graphify-out/.lock
command -v flock >/dev/null 2>&1 && flock 9
if stale; then graphify update --force . >&2 && touch "$g" && files > "$list"; fi
exec 9>&-
[ "${1:-}" = refresh ] && exit 0

if [ $# -eq 0 ]; then cat graphify-out/GRAPH_REPORT.md; else exec graphify "$@"; fi
