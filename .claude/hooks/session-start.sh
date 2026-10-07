#!/bin/bash
# Session start. Stdout goes into the session's context, so it is kept to the compact top-level map.
set -euo pipefail
echo 'Repo map, top level (layer 0). Stop here if it answers the task. Details: .claude/tools/tree.sh <dir>; questions: .claude/tools/graph.sh query "<q>".'
"$(dirname "$0")/../tools/tree.sh"
