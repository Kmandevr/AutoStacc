---
name: seo-check
description: Check search visibility for AutoStacc: metadata, canonicals, structured data, sitemap, robots, redirects, placeholder identity and brand spelling. Use after adding or changing a page, data in data/, _redirects or robots.txt, and when asked for an SEO review.
---

# SEO check

How the system works is in [docs/seo.md](../../../docs/seo.md). Don't restate it; run the checks.

1. **Regenerate:** `node scripts/build.js`. It rewrites each page's head block, creator profile pages, trust pages (`/privacy`, `/terms`, ...), `sitemap.xml`, `llms.txt` and `db/catalog.sql` (creators, projects, polls) from `data/`, and adds new URLs to `scripts/public-urls.txt`. A build error names the file and the fix (missing `<title>`, description or seo markers, bad id).
2. **Static tests and rendered pages, at the same time** (both only read the build, so they run together once step 1 has finished). One Bash call; each check keeps its own output and exit code:

   ```sh
   L=$(mktemp -d)
   node scripts/seo-test.js > $L/seo-test.txt 2>&1 & p1=$!
   NODE_PATH=$(npm root -g) node .claude/skills/verify-site/check.js > $L/verify-site.txt 2>&1 & p2=$!
   wait $p1; e1=$?; wait $p2; e2=$?
   echo "== seo-test (exit $e1)"; cat $L/seo-test.txt; echo "== verify-site (exit $e2)"; cat $L/verify-site.txt
   ```

   - `seo-test.js`: titles, descriptions, canonicals, Open Graph, headings, image alt/size, JSON-LD (valid, required fields, no ratings or reviews, absolute https URLs), sitemap (valid XML, only canonical public URLs), robots.txt (public `/shop/<id>` and `/events`, the server sitemaps named), redirects (old `/product?p=` and retired news addresses), URLs that disappeared, placeholder profiles or email, brand spelling.
   - `verify-site` (see that skill): each page's head after scripts run, the 404 status, and a crawl from `/` so every sitemap URL is linked from somewhere (no orphans).
3. Any non-zero exit is a FAIL; report each group's lines as printed.
4. **Review what tests can't judge** (only for pages the change touched; it needs no test output, so do it while step 2 runs with `run_in_background`): is each title and description specific to that page and true; does the page name the artist and link to related content (release ↔ products ↔ events); does any new copy follow [docs/identity.md](../../../docs/identity.md) without invented facts or keyword stuffing.

## Fixing

- A FAIL in a generated file: change `data/` or the page's own title/description, then rebuild. Never edit inside `<!-- seo:start ... seo:end -->` or any generated page (`<creator>.html`, the trust pages). Product, release and event pages are rendered by the server (`server/shop/`, `server/content/`) and tested in `test/api/` (the `store-check` skill), not here.
- `url-disappeared`: a public page was removed or renamed. Add a `301` from the old path in `_redirects`, or, if the removal is deliberate and the page should drop out of search, delete its line from `scripts/public-urls.txt`.
- `placeholder-profile`: set the real profile URL or `""`. Never a site's home page.

Report the scripts' lines as they are, then one verdict line. For an independent read-only review, the `seo-reviewer` agent exists; brief it with the changed pages and data and the step 2 results, so it skips the scripts.
