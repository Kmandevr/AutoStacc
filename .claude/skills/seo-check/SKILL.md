---
name: seo-check
description: Check search visibility for AutoStacc: metadata, canonicals, structured data, sitemap, robots, redirects, placeholder identity and brand spelling. Use after adding or changing a page, data in data/, _redirects or robots.txt, and when asked for an SEO review.
---

# SEO check

How the system works is in [docs/seo.md](../../../docs/seo.md). Don't restate it; run the checks.

1. **Regenerate:** `node scripts/build.js`. It rewrites each page's head block, the release/product/news pages and `sitemap.xml` from `data/`, and adds new URLs to `scripts/public-urls.txt`. A build error names the file and the fix (missing `<title>`, description or seo markers, bad id).
2. **Static tests:** `node scripts/seo-test.js`. Titles, descriptions, canonicals, Open Graph, headings, image alt/size, JSON-LD (valid, required fields, no ratings or reviews, absolute https URLs), sitemap (valid XML, only canonical public URLs), robots.txt, redirects, URLs that disappeared, placeholder profiles or email, brand spelling.
3. **Rendered pages:** run the `verify-site` skill. It checks each page's head after scripts run, the 404 status, and crawls from `/` so every sitemap URL is linked from somewhere (no orphans).
4. **Review what tests can't judge** (only for pages the change touched): is each title and description specific to that page and true; does the page name the artist and link to related content (release ↔ products ↔ news); does any new copy follow [docs/identity.md](../../../docs/identity.md) without invented facts or keyword stuffing.

## Fixing

- A FAIL in a generated file: change `data/` or the page's own title/description, then rebuild. Never edit inside `<!-- seo:start ... seo:end -->` or a file under `music/`, `shop/`, `news/`.
- `url-disappeared`: a public page was removed or renamed. Add a `301` from the old path in `_redirects`, or, if the removal is deliberate and the page should drop out of search, delete its line from `scripts/public-urls.txt`.
- `placeholder-profile`: set the real profile URL or `""`. Never a site's home page.

Report the scripts' lines as they are, then one verdict line. For an independent read-only review, the `seo-reviewer` agent exists.
