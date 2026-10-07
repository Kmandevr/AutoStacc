#!/bin/bash
# One entry point to Graphify. Installs it and refreshes the graph only when needed,
# so sessions that never ask a graph question pay nothing.
#   graph.sh                      print the one-page overview (GRAPH_REPORT.md)
#   graph.sh query "<question>"   any graphify command and arguments
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

command -v graphify >/dev/null 2>&1 || uv tool install graphifyy >&2

g=graphify-out/graph.json
if [ ! -f "$g" ] || [ -n "$(find . \( -path ./graphify-out -o -path ./.git -o -path ./.claude \) -prune -o -type f -newer "$g" -print -quit)" ]; then
  graphify update . >&2
fi

if [ $# -eq 0 ]; then cat graphify-out/GRAPH_REPORT.md; else exec graphify "$@"; fi
