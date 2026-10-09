# .claude/ tooling

Everything here is split into pieces that load only when needed. `tools/`, `hooks/` and `workflows/` don't mention this project, so they copy to another repo as-is. `skills/`, `rules/` and `.serena/` are specific to AutoStacc and are the parts to rewrite.

| Piece | Loads | Purpose |
| --- | --- | --- |
| `hooks/session-start.sh` | every session | Prints the compact repo map into context (small however big the repo gets) plus the branch, last 5 commits, uncommitted count and the newest `docs/log.md` lines (gathered in parallel, about 0.2 s, silent when git or the note is missing; the note is `SESSION_LOG_NOTE` if set), installs Serena so the MCP server starts fast, and runs `npm ci` in the background when a lockfile exists without `node_modules`. Also prints `.claude/handoff.md` when one exists (the `handoff` skill), with how many commits ago it was written, and refreshes the Graphify graph in the background when Graphify is installed. Runs again after a compaction. |
| `tools/tree.sh` | on call | Repo map built from each file's own purpose line. `<dir>` expands one directory. A directory's purpose is the first line of its `.purpose` file. |
| `tools/serena.sh`, `.mcp.json` | when Serena's tools are used | Starts the [Serena](https://github.com/oraios/serena) MCP server for this project. Config is `.serena/project.yml`: JavaScript, HTML and CSS; its file, shell and memory tools are off, so it adds 12 tools, not 29. |
| `tools/serena-hook.sh` | on Read/Grep, session end | Runs Serena's `remind` hook (a one-time nudge toward symbol tools after repeated Grep/Read) and `cleanup`. Does nothing if Serena isn't installed. |
| `tools/graph.sh` | on call | Single entry to [Graphify](https://github.com/Graphify-Labs/graphify). Installs it and refreshes the graph only if files were added, edited or deleted (it keeps the file list in `graphify-out/files.txt`), so sessions that never need it pay nothing. |
| `skills/*/SKILL.md` | description every session, body when invoked | Repeatable workflows: `verify-site` (runs `check.js`, with rendered-head SEO checks and an orphan crawl in `seo-browser.js`), `seo-check` (build, SEO tests, review), `add-product`, `add-news`, `add-release`, `accessibility-review`, `store-check` (unit, API security and browser chaos suites for the store), `release-check` (runs `check.sh`). Skills point at repo files and don't restate the architecture. Independent steps in a skill start together (shell checks as background jobs with `wait` and one exit code each, independent subagents in one message); only real dependencies, such as the build before checks that read it, stay in order. |
| `skills/code-nav` | with the others | How to use Graphify and Serena together (orient, zoom in, edit, check blast radius), their known gaps, and `check.sh`, a self-test that proves both tools work. |
| `skills/handoff` | with the others | Context hygiene: writes `.claude/handoff.md` (a 40-line snapshot to resume from) at task boundaries, durable facts to `docs/` first. `check.sh` (run by `release-check`) keeps every requirement in `must-keep.txt` in place, CLAUDE.md within its word budget and the handoff sound. |
| `skills/tasks` | with the others | How to find, claim, work and finish tasks through GitHub Issues and labels. The only task system; see `.github/` for issue forms, the PR template and the `clear-status-on-close` workflow. |
| `agents/*.md` | description every session, body in the subagent's own context | Independent specialists that return findings only: `architect` (placement and boundaries), `frontend-reviewer` (UI, brand, responsive), `browser-tester` (real-browser checks), `code-reviewer` (defects), `seo-reviewer` (search visibility, honest metadata), `backend-reviewer` (store API correctness, boundaries, migrations, test coverage), `security-reviewer` (attacks the store diff on paper), `commerce-tester` (runs the store suites and breaks the purchase flow). Read-only. Each starts from the caller's brief (changed files, diff range, findings, checks already run) instead of re-exploring. |
| `rules/*.md` | when matching files are touched | Conventions scoped by `paths:` globs (scripts, styles, notes), so they stay out of context otherwise. |
| `workflows/change.js` | on call | Multi-agent plan, parallel build (owner-question issues opened alongside it), parallel verify, docs. The planner's findings, changed files and verify results are passed to each later agent. Takes `args: { task, agents? }`. Reads project rules and checks from `CLAUDE.md`, never commits. |
| `settings.json` | every session | Allow rules for the tools above, hook registration, `MCP_TIMEOUT`. |

## Where instructions live

One home per kind of instruction; the others point to it.

| Kind | Home |
| --- | --- |
| Project identity, global rules, how to work | `CLAUDE.md` |
| Conventions for certain files | `rules/` (`html`, `js`, `css`, `data`, `docs`, `scripts`, `server`, `tests`, `claude`), loaded when matching files are touched |
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
- Scripts are wrapped in an IIFE, so symbols appear as `<function>/productCard`. `get_symbols_overview` on a script needs `depth: 2` (the default stops at the wrapper). Searching by the bare name (`productCard`) works.
- Cross-file references work through `js/jsconfig.json` and `js/globals.d.ts` (editor-only). For a shared helper, ask for references to the exported property: `find_referencing_symbols` with `GS/<function>/escapeHTML[1]` in `js/util.js` lists every script that uses it (`[0]` is the local constant).
- Graphify's graph is code-only (no API key): JS functions and Markdown headings. HTML and CSS are Serena's job. Use keywords in `graph.sh query`, not sentences.
- The project's memory stays in `docs/`; Serena's own memory and onboarding tools are disabled to avoid a second source of truth.
- `.mcp.json` is a project-scoped MCP server. Claude Code asks for approval the first time unless `enabledMcpjsonServers` in `settings.json` already covers it (it does).

## Reusing in another project

1. Copy `.claude/` and add a one-line `.purpose` file to each top-level directory.
2. Start each source file with a one-line purpose comment (the map reads it).
3. Put that project's rules in `CLAUDE.md` (including a "Checking changes" section, which the workflow runs) and its conventions in `rules/`.
4. Graphify and Serena install through [uv](https://docs.astral.sh/uv/). For Serena, run `serena project create --ls <language>` and adjust `.serena/project.yml`.
