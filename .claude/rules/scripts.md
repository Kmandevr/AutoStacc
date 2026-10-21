---
paths:
  - "scripts/**"
---

# Node scripts

- Plain Node (22), CommonJS, no `require` of npm packages: they run in the deploy, in CI and locally as `node scripts/<name>.js`. They are build and test tools; pages never load them, and the deploy doesn't publish them. `dev.js` (local store), `cloudflare.js` (deploy-time provisioning) and the store tests may spawn Wrangler from `node_modules/.bin`; the build and SEO tests must not need it.
- `build.js` is the only writer of generated output: the seo block in each page's head, `shop/` (empty while `data/products.js` is; first-party products are made in the Studio), each creator's profile page `<creator>.html` (`lib/creator-page.js`), the trust pages from `data/legal.js`, `help.js` and `licenses.js` (`lib/trust-pages.js`), `sitemap.xml` (release and news pages are made in the Studio and listed in `/sitemap-content.xml` by `server/content/sitemap.js`, not here), `llms.txt` (`lib/llms.js`), `scripts/public-urls.txt` and `db/catalog.sql` (products from `lib/catalog.js`, projects and polls from `lib/platform-catalog.js`). It must stay deterministic (same data, same bytes) so `--check` works; no dates from the clock, no random values.
- Data comes from `lib/data.js` (runs `data/*.js` like a browser would). Head and JSON-LD come from `lib/head.js`, page templates from `lib/pages.js`. A new generated page type is a template in `lib/pages.js` plus one line in `build.js`.
- Escape every data value put into HTML with `esc`; JSON-LD escapes `<`. Generated pages use root-relative clean links (`/shop/x`), never `*.html`.
- `seo-test.js` reads the output, never the generator's internals, so it can catch generator bugs. Add a test when adding a rule that protects search visibility.
- Start each file with a one-line `//` comment saying what it is for (the repo map reads it).
