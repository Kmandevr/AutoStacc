# GitHub Project setup (one time, in the GitHub web UI)

Claude sessions can't create or edit Projects, so do this once by hand. The board is only a view: the labels on issues are the state, so no custom fields are needed. Delete this file when done.

1. GitHub profile → **Projects** → **New project** → **Table**. Name it `AutoStacc`. Link it to the repository (project **Settings** → **Manage access**, or the repo's Projects tab).
2. **Workflows** (project menu `...`) → turn on **Auto-add to project**: repository `Kmandevr/AutoStacc`, filter `is:issue,pr is:open`. Leave the others at their defaults.
3. Make four views. In each, use the filter box, show the columns Title, Labels, Assignees, Linked pull requests, and set the layout to Table:

| View | Filter |
| --- | --- |
| Active Work | `is:open label:"status: in progress","status: review"` |
| Ready Queue | `is:open label:"status: ready"` |
| Bugs | `is:open label:bug` |
| Backlog | `is:open -label:"status: ready" -label:"status: in progress" -label:"status: review"` |

Priority can't be a sort key because it's a label, so the Labels column shows `P0` to `P3` and Claude orders the Ready Queue itself.

Optional: Status single-select field (Backlog, Ready, In Progress, Review, Done) only if you want Kanban columns by hand. Claude will not read or set it.
