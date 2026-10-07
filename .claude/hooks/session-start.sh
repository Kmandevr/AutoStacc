#!/bin/bash
# Session start. Stdout is added to the session's context, so it carries only the
# top-level repo map. Cloud sessions also install Graphify and refresh its graph.
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}"
HERE="$(dirname "$0")"

echo "Repo map (layer 0). One line per file. Stop here if it answers the task; go deeper only when it doesn't (see CLAUDE.md, \"Read in layers\")."
"$HERE/tree.sh"

if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  {
    command -v graphify >/dev/null 2>&1 || uv tool install graphifyy
    # Code-only AST pass: local, no LLM or API key needed.
    graphify update . || echo "graphify update failed; continuing without a graph"
  } >&2
fi
