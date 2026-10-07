---
name: verify-site
description: Check that the AutoStacc site still works after a change. Runs static checks plus headless-browser checks and reports PASS/WARN/FAIL with file and location. Use after editing HTML, CSS, JS or data files, and before saying a change is done.
---

# Verify the site

Run from the repo root:

```sh
NODE_PATH=$(npm root -g) node .claude/skills/verify-site/check.js            # all pages
NODE_PATH=$(npm root -g) node .claude/skills/verify-site/check.js shop.html  # one page
```

The script starts its own static server, so nothing needs cleaning up. Exit code 1 means at least one FAIL.

## What it checks

- **Static:** JS syntax (`node --check`), balanced CSS braces, local `src`/`href` targets that exist, each script's `window.SITE|PRODUCTS|NEWS|SHOWS` use matched by a loaded `data/*.js`, `js/util.js` loaded where `window.GS` is used, duplicate ids, `lang`, viewport, `<title>`, `img` alt.
- **Browser, at 1280px and 390px:** page errors and console errors, HTTP errors, horizontal overflow, header/footer rendering, empty data containers, tap targets under 24px, the mobile menu toggle, the shop filter (choose a category, then All), and the newsletter form.

## Reporting

Report the script's lines as they are: `PASS|WARN|FAIL <check>@<width> - <detail> (<file>)`, then the one-line summary. Don't paraphrase or add background. For each FAIL, fix it (or say why it can't be fixed) and re-run only the affected page.

## Limits, say so if they matter

- External requests (Google Fonts) fail in the offline sandbox and show as WARN, not FAIL.
- It is not a full HTML validator. For a stricter pass, `npx html-validate <page>` can be tried when the network allows.
- It can't judge visual quality. For layout concerns, take a screenshot at 390px and look.
