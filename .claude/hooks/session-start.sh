#!/bin/bash
# Session start. Stdout goes into the session's context, so it is kept to the compact top-level map.
# Serena is installed here (output to stderr) so the MCP server starts fast and the install is cached.
set -euo pipefail
command -v serena >/dev/null 2>&1 || uv tool install -p 3.13 serena-agent >&2 || true

echo 'Repo map, top level (layer 0). Stop here if it answers the task. Details: .claude/tools/tree.sh <dir>; questions: .claude/tools/graph.sh query "<keywords>".'
"$(dirname "$0")/../tools/tree.sh"
