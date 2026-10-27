---
name: code-nav
description: Find your way around AutoStacc's code with Graphify (files, dependencies, blast radius) and Serena (symbols, references, symbol edits) instead of reading whole files. Use before changing code you haven't seen this session, and run its self-test when either tool seems broken.
---

# Navigate code with Graphify and Serena

These are layers 3 and 4 of "Read in layers" in `CLAUDE.md`. What each tool covers and how they're installed: the "Graphify and Serena" section of `.claude/README.md`.

## Procedure

1. **Orient (Graphify, file level).** Before touching an area, ask the graph, with keywords, not sentences:
   - `.claude/tools/graph.sh query "cart checkout"`: the nodes and files in an area.
   - `.claude/tools/graph.sh explain "grantStmt()"`: one node and its neighbours. Functions are labelled with `()`, files by name. When a name exists in several files, prefix the path: `"server/checkout/routes.js::checkout()"`.
   - `.claude/tools/graph.sh affected "grantStmt()"`: what may break if it changes. Run it before editing a shared function.
   - `.claude/tools/graph.sh path "server/checkout/routes.js::checkout()" "grantStmt()"`: how two pieces connect.
   - `.claude/tools/graph.sh` alone prints the overview report.
   The graph refreshes itself when files are added, edited or deleted, so never rebuild by hand.
2. **Zoom in (Serena, symbol level).** Once you know the file. Serena is one tool, `serena_repl` (session id from `initial_instructions`, once per session); the methods below are `s.lsp.<name>(...)`, the edits in step 3 `s.edit.<name>(...)`:
   - `get_symbols_overview` (`depth=2` for browser scripts in `js/`, which are wrapped in an IIFE).
   - `find_symbol` with `include_body=True` to read just one function or CSS rule.
   - `find_referencing_symbols` for every caller. For a `GS` helper, use `GS/<function>/<name>[1]` in `js/util.js`.
3. **Edit.** Whole-function changes: `replace_symbol_body`, `insert_before_symbol` / `insert_after_symbol`. Renames: `rename_symbol`. A few lines inside a function: plain Edit. Data, docs and Markdown: plain Edit.
4. **Check.** `affected` again if you changed a shared signature, then the usual checks from `CLAUDE.md`.

## Known gaps

- Graphify only makes nodes for `function` declarations, methods and files. Helpers written as `const x = () =>` (most of `js/util.js`) and HTML/CSS aren't in the graph: use Serena's `find_symbol` for them.
- `explain` and `affected` need an exact label. If they say "No node matching", run `query` with the bare name first and copy the label; "Ambiguous" lists the paths to prefix.
- Serena's tools come from the MCP server in `.mcp.json`. If they're missing from the session, run the self-test, then restart the session.

## Self-test

```sh
.claude/skills/code-nav/check.sh
```

Prints PASS/FAIL per check: both tools installed, the graph builds and answers a query, it picks up a new file and drops a deleted one, Serena's project config is valid and its MCP server starts. Exit code 1 means a FAIL.
