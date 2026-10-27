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

The script serves the site like Cloudflare Pages (`scripts/serve.js`: clean addresses, `_redirects`, real 404), so nothing needs cleaning up. The store API is offline there (503), so it also proves every page works when the store is down; the store itself is tested by the `store-check` skill. Exit code 1 means at least one FAIL. With no arguments it checks every root `*.html` page, the `discover/` hub folder (New & upcoming) and every first-party creator's folder (`autostacc/`: project homes and their hand-written pages). Product (`/shop/<id>`), release and event pages and the `/events` calendar are served from the store database, so the crawl reports links to them as `content-offline`; pass paths to check only those. The static checks, the page tabs (`VERIFY_CONCURRENCY` at once, default the CPU count between 2 and 6) and the crawl run at the same time. Lines are still printed grouped and in a fixed order (static, then each page at 1280 and 390, then the crawl), so the output reads the same as a one-by-one run. Set `VERIFY_CONCURRENCY=1` if a timing-sensitive check (newsletter) looks flaky on a slow machine. To browse by hand: `node scripts/serve.js` and open http://localhost:8000/.

## What it checks

- **Static:** JS syntax (`node --check`, `js/` and `data/`), balanced CSS braces (top-level `css/` only), local `src`/`href` targets that exist, each script's `window.SITE` use matched by a loaded `data/site.js`, `js/util.js` loaded where `window.GS` is used, duplicate ids, `lang`, viewport, `<title>`, `img` alt.
- **Browser, at 1280px and 390px:** page errors and console errors, HTTP errors, horizontal overflow, header/footer rendering, empty data containers, tap targets under 24px, the mobile menu toggle, the store page with its API offline (it still draws its grid or its empty state, and says search is offline), and the newsletter form.
- **SEO, rendered (`seo-browser.js`):** title, description, robots, canonical, Open Graph and JSON-LD as a crawler sees them after scripts run, one `h1` and no skipped heading levels, image alt, links that hop through redirects, the 404 status. With no arguments it also crawls from `/` and fails on broken links and on sitemap URLs that no page links to.
- Static SEO tests are separate: `node scripts/seo-test.js` (see the `seo-check` skill).

## Reporting

Report the script's lines as they are: `PASS|WARN|FAIL <check>@<width> - <detail> (<file>)`, then the one-line summary. Don't paraphrase or add background. For each FAIL, fix it (or say why it can't be fixed) and re-run only the affected page.

## Limits, say so if they matter

- External requests (Google Fonts) fail in the offline sandbox and show as WARN, not FAIL.
- It is not a full HTML validator. For a stricter pass, `npx html-validate <page>` can be tried when the network allows.
- It can't judge visual quality. For layout concerns, take a screenshot at 390px and look.
