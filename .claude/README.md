# .claude/ tooling

Everything here is split into pieces that load only when needed. `tools/`, `hooks/` and `workflows/` don't mention this project, so they copy to another repo as-is. `skills/`, `rules/` and `.serena/` are specific to AutoStacc and are the parts to rewrite.

| Piece | Loads | Purpose |
| --- | --- | --- |
| `hooks/session-start.sh` | every session | Prints the compact repo map into context (small however big the repo gets) and installs Serena so the MCP server starts fast. |
| `tools/tree.sh` | on call | Repo map built from each file's own purpose line. `<dir>` expands one directory. A directory's purpose is the first line of its `.purpose` file. |
| `tools/serena.sh`, `.mcp.json` | when Serena's tools are used | Starts the [Serena](https://github.com/oraios/serena) MCP server for this project. Config is `.serena/project.yml`: JavaScript, HTML and CSS; its file, shell and memory tools are off, so it adds 12 tools, not 29. |
| `tools/serena-hook.sh` | on Read/Grep, session end | Runs Serena's `remind` hook (a one-time nudge toward symbol tools after repeated Grep/Read) and `cleanup`. Does nothing if Serena isn't installed. |
| `tools/graph.sh` | on call | Single entry to [Graphify](https://github.com/Graphify-Labs/graphify). Installs it and refreshes the graph only if files changed, so sessions that never need it pay nothing. |
| `skills/*/SKILL.md` | description every session, body when invoked | Repeatable workflows: `verify-site` (runs `check.js`), `add-product`, `add-news`, `accessibility-review`, `release-check` (runs `check.sh`). Skills point at repo files and don't restate the architecture. |
| `skills/tasks` | with the others | How to find, claim, work and finish tasks through GitHub Issues and labels. The only task system; see `.github/` for issue forms, the PR template and the `clear-status-on-close` workflow. |
| `agents/*.md` | description every session, body in the subagent's own context | Independent specialists that return findings only: `architect` (placement and boundaries), `frontend-reviewer` (UI, brand, responsive), `browser-tester` (real-browser checks), `code-reviewer` (defects). Read-only. |
| `rules/*.md` | when matching files are touched | Conventions scoped by `paths:` globs (scripts, styles, notes), so they stay out of context otherwise. |
| `workflows/change.js` | on call | Multi-agent plan, parallel build, verify, docs. Takes `args: { task, agents? }`. Reads project rules and checks from `CLAUDE.md`, never commits. |
| `settings.json` | every session | Allow rules for the tools above, hook registration, `MCP_TIMEOUT`. |

## Where instructions live

One home per kind of instruction; the others point to it.

| Kind | Home |
| --- | --- |
| Project identity, global rules, how to work | `CLAUDE.md` |
| Conventions for certain files | `rules/` (`html`, `js`, `css`, `data`, `docs`, `claude`), loaded when matching files are touched |
| Repeatable procedures | `skills/` |
| Independent review and testing, in their own context | `agents/` |
| Project-wide map and relationships | Graphify through `tools/graph.sh` |
| Symbols and references | Serena |

## Graphify and Serena

They answer different questions. Don't use both for the same one.

| | Graphify | Serena |
| --- | --- | --- |
| Level | Project and file | Symbol |
| Use for | "What is in this repo, what depends on what, what breaks if I change this module?" | "Where is `productCard` defined, who calls it, show me just that function, rename it everywhere" |
| Tools | `.claude/tools/graph.sh` (`query`, `explain`, `affected`, no args for the overview) | `get_symbols_overview`, `find_symbol`, `find_referencing_symbols`, `rename_symbol`, `replace_symbol_body`, `insert_before_symbol`, `insert_after_symbol`, `safe_delete_symbol`, `get_diagnostics_for_file` |
| Not for | Reading or editing code | Orientation, searching docs, plain text edits, shell commands, notes (use the map, Grep, Edit and `docs/`) |

Notes on Serena here:
- Covers JavaScript, HTML and CSS: CSS selectors are symbols (`find_symbol ".card"` returns just that rule), HTML gives a structure outline with ids and classes. Markdown and data notes are not indexed.
- Scripts are wrapped in an IIFE, so symbols appear as `<function>/productCard`. Searching by the bare name (`productCard`) works.
- Graphify's graph is code-only (no API key): JS functions and Markdown headings. HTML and CSS are Serena's job. Use keywords in `graph.sh query`, not sentences.
- The project's memory stays in `docs/`; Serena's own memory and onboarding tools are disabled to avoid a second source of truth.
- `.mcp.json` is a project-scoped MCP server. Claude Code asks for approval the first time unless `enabledMcpjsonServers` in `settings.json` already covers it (it does).

## Reusing in another project

1. Copy `.claude/` and add a one-line `.purpose` file to each top-level directory.
2. Start each source file with a one-line purpose comment (the map reads it).
3. Put that project's rules in `CLAUDE.md` (including a "Checking changes" section, which the workflow runs) and its conventions in `rules/`.
4. Graphify and Serena install through [uv](https://docs.astral.sh/uv/). For Serena, run `serena project create --ls <language>` and adjust `.serena/project.yml`.
