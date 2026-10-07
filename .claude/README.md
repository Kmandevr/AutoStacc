# .claude/ tooling

Everything here is split into pieces that load only when needed. Nothing in `tools/`, `hooks/` or `workflows/` mentions this project, so the folder can be copied to another repo as-is.

| Piece | Loads | Purpose |
| --- | --- | --- |
| `hooks/session-start.sh` | every session | Prints the compact repo map into context. Output stays small however big the repo gets. |
| `tools/tree.sh` | on call | Repo map built from each file's own purpose line. `<dir>` expands one directory. A directory's purpose is the first line of its `.area` file. |
| `tools/graph.sh` | on call | Single entry to [Graphify](https://github.com/Graphify-Labs/graphify). Installs it and refreshes the graph only if files changed, so sessions that never need it pay nothing. |
| `rules/*.md` | when matching files are touched | Conventions scoped by `paths:` globs (scripts, styles, notes), so they stay out of context otherwise. |
| `workflows/change.js` | on call | Multi-agent plan, parallel build, verify, docs. Takes `args: { task }`. Reads project rules and checks from `CLAUDE.md`, never commits. |
| `settings.json` | every session | Allow rules for the tools above and the hook registration. |

## Reusing in another project

1. Copy `.claude/` and add a one-line `.area` file to each top-level directory.
2. Start each source file with a one-line purpose comment (the map reads it).
3. Put that project's rules in `CLAUDE.md` (including a "Checking changes" section, which the workflow runs) and its conventions in `rules/`.
4. Rebuilding the graph needs [uv](https://docs.astral.sh/uv/).
