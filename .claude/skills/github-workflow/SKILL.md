---
name: github-workflow
description: How to find, claim, work, report and finish tasks in AutoStacc using GitHub Issues and labels. Use at session start, when picking or being given a task, when you find a bug, and when finishing work. Not needed for pure questions.
---

# GitHub workflow

**GitHub is the task list.** Issue = one piece of work or bug. PR = its implementation (`Closes #N`). `docs/` = permanent knowledge only. Never keep a second task list in `CLAUDE.md`, `docs/`, code comments or local files.

Repo `Kmandevr/AutoStacc`. Use the GitHub MCP tools (`search_issues`, `list_issues`, `issue_read`, `issue_write`, `add_issue_comment`, `search_pull_requests`) with `minimal_output` where offered. Fetch only what a step needs; never list every issue.

## Labels (the whole state model)

| Kind | Labels | Notes |
| --- | --- | --- |
| Status | `status: ready` `status: in progress` `status: review` `status: blocked` | No status label = backlog. Closed = done |
| Priority | `P0` `P1` `P2` `P3` | No priority label = P2 |
| Type | `bug` `feature` `improvement` `refactor` `documentation` `chore` | |
| Area | `area: ui` `shop` `news` `data` `infra`, `accessibility` | Only where useful |

## Session start (3 small queries, only when the task isn't already given)

```
repo:Kmandevr/AutoStacc is:issue is:open label:"status: in progress"      # who is working on what
repo:Kmandevr/AutoStacc is:pr is:open                                        # waiting for review
repo:Kmandevr/AutoStacc is:issue is:open label:"status: ready"              # candidates
```

Also run `git status` and `git log -3 --oneline`. Add `label:bug label:P0,P1` for urgent bugs and `label:"status: blocked"` only when asked about blockers. Recently changed: `is:issue is:closed sort:updated-desc` limited to 5.

## Choosing work

If the user names a task, use it. If you may choose, take the first that applies among `status: ready` issues: P0 bug, P1 bug, core functionality that unblocks other issues, P1 feature, P2, improvements and refactors, P3 polish. Then sanity-check: dependencies met (`Blocked by`), nothing already `in progress` on the same files, small enough for this session. Don't pick purely by label.

## Before starting

1. Search for duplicates or related work: open issues, open PRs, and the last few closed issues (`search_issues` with a keyword). Reuse and comment on an existing issue instead of opening another.
2. **Claim** (also how sessions avoid colliding): add `status: in progress` and remove `status: ready`, then comment `Claimed: branch <branch-name>`. Re-read the comments: the **earliest** `Claimed:` comment wins. If it isn't yours, back off and pick another issue. An `in progress` issue with no open PR and no branch activity for over a day is abandoned: comment, then reclaim.
3. Confirm scope from the issue's acceptance criteria. Find files with the repo map, then Serena or Graphify (see `CLAUDE.md`). Use the matching skill (`add-product`, `add-news`, ...).

## While working

- Stay inside the issue. Related-but-separate problems become their own issue (below), not extra changes.
- If a discovery changes the plan, add one short comment on the issue.
- Commit messages mention `#N`. Work on the session's branch.

## Found a bug or idea outside the current issue

1. Search existing issues. If one exists, add what you learned as a comment and stop.
2. Otherwise open a narrow issue. Bug: use the sections of `.github/ISSUE_TEMPLATE/bug.yml` as `### Heading` blocks (Summary, Reproduction, Expected, Actual, Acceptance criteria are required; Environment, Evidence, Suspected area only if you know them). Task: `task.yml`.
3. Labels: `bug` (or a type), a priority, an area if it's clear. Add `status: ready` only if it's fully scoped; otherwise leave it in backlog. Mention `#<current issue>` if related.
4. Continue the original task. Stop only if the bug blocks it (then mark the current issue `status: blocked` and say why) or it is P0.

## Finishing

1. Run `verify-site`; run `release-check` before review. Check each acceptance criterion.
2. Open a PR using `.github/pull_request_template.md`. Put `Closes #N` in the body so merging closes the issue. One issue per PR where possible.
3. Swap `status: in progress` for `status: review`. Post one concise comment on the issue with the PR link and the verification result.
4. Merging closes the issue and `issue-hygiene` removes its status labels. Don't close it yourself before verification passes. If a fix couldn't be verified, say so and leave it in review.

Don't open a PR unless asked (see `CLAUDE.md`).

## Limits

GitHub Projects boards can't be read or changed from Claude sessions (GraphQL is blocked). The board is a human view built on these labels; labels are the source of state. Setup: `.github/project-setup.md`.
