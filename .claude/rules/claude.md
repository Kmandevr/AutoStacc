---
paths:
  - ".claude/**"
---

# Claude configuration

- Keep each piece small and single-purpose; the table in `.claude/README.md` says where each kind of instruction lives. Don't restate `CLAUDE.md`, another rule or another skill. Link or name it instead.
- Use the lightest mechanism: a path rule for file-scoped conventions, a skill for a repeatable procedure, a subagent for independent review or testing, a tool script for deterministic work. Add to `CLAUDE.md` only what applies to every session.
- Skill and agent descriptions are always in context, so keep them to one or two sentences about when to use them.
- `tools/`, `hooks/` and `workflows/` stay project-agnostic. Project specifics go in `rules/`, `skills/` and `CLAUDE.md`.
- When adding, renaming or removing a piece, update the table in `.claude/README.md`.
