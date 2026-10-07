#!/bin/bash
# Cloud sessions only: install Graphify and refresh the project knowledge graph.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

if ! command -v graphify >/dev/null 2>&1; then
  uv tool install graphifyy
fi

# Code-only AST pass: local, no LLM or API key needed.
graphify update . || echo "graphify update failed; continuing without a graph" >&2
