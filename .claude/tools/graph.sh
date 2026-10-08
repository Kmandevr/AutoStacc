#!/bin/bash
# One entry point to Graphify. Installs it and refreshes the graph only when needed,
# so sessions that never ask a graph question pay nothing.
#   graph.sh                      print the one-page overview (GRAPH_REPORT.md)
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
# --force lets the graph shrink after deletions; Graphify skips writing an unchanged graph, so touch it.
if stale; then graphify update --force . >&2 && touch "$g" && files > "$list"; fi

if [ $# -eq 0 ]; then cat graphify-out/GRAPH_REPORT.md; else exec graphify "$@"; fi
