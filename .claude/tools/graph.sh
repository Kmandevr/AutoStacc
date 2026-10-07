#!/bin/bash
# One entry point to Graphify. Installs it and refreshes the graph only when needed,
# so sessions that never ask a graph question pay nothing.
#   graph.sh                      print the one-page overview (GRAPH_REPORT.md)
#   graph.sh query "<question>"   any graphify command and arguments
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

command -v graphify >/dev/null 2>&1 || uv tool install graphifyy >&2

g=graphify-out/graph.json
# Rebuild only when a tracked or new, non-ignored file is newer than the graph.
if [ ! -f "$g" ] || [ -n "$(git ls-files -co --exclude-standard | xargs -r -d '\n' find -newer "$g" -print -quit)" ]; then
  graphify update . >&2
fi

if [ $# -eq 0 ]; then cat graphify-out/GRAPH_REPORT.md; else exec graphify "$@"; fi
