---
title: SEO
summary: How search visibility works on autostacc.com: generated metadata, item pages, sitemap, structured data, tests, and what still needs the owner.
covers: [scripts/build.js, scripts/lib/, scripts/seo-test.js, scripts/public-urls.txt, scripts/deploy-check.js, robots.txt, _redirects, _headers, sitemap.xml, llms.txt, .github/workflows/seo.yml, .github/workflows/deploy.yml, .claude/skills/verify-site/, data/site.js, data/projects.js, data/creators.js]
updated: 2026-10-20
---

# SEO: how the site tells search engines who it is

Since 2026-10-08 autostacc.com is AutoStacc, the platform (WebSite and Organization), and each project has its own home under `/<creator>/<id>` that is that project's official page: when someone searches "Glitches & Stitches", search engines have every honest signal that https://autostacc.com/autostacc/glitches-and-stitches is the artist's official page (decision in [decisions](decisions.md)). Nothing here guarantees a ranking; it removes every technical reason not to rank and makes the identity unambiguous. The owner's steps (Search Console, profile links) are in [search-console](search-console.md).

## One source, one generator

- **Identity:** AutoStacc's is `data/site.js` (name, address, home page title and description, preview image, logo). Each project's is its entry in `data/projects.js`: name, alternate spelling (only for search engines), home title and description, bio, genres, image, logo, official profiles (`socials`). The project's footer row, press page, music page and structured data (`sameAs`) all read the same list. Empty `url` = not set; placeholders are not allowed.
- **Content** lives in `data/music.js` (releases), `data/products.js`, `data/news.js`, `data/shows.js`. `draft: true` marks placeholders: kept out of search, and draft news, shows and releases aren't shown at all (they would state invented facts).
- **`node scripts/build.js`** generates, from that data:
  - the block between `<!-- seo:start -->` and `<!-- seo:end -->` in every page's head: canonical, robots, Open Graph, Twitter card, JSON-LD. Hand-written pages keep their own `<title>` and description above the block (a page opts out of search with its own `<meta name="robots" content="noindex">`); the home page's come from `data/site.js` and each project home's (`<creator>/<id>.html`) from `data/projects.js`. Hand-written pages are every non-generated `*.html` at the root and in each creator's folder (`<creator>/`).
  - one static page per product (`shop/<id>.html` → `/shop/<id>`), and per project release (`<creator>/<project>/music/<id>.html`) and news post (`<creator>/<project>/news/<id>.html`), in the project's skin, with breadcrumbs, artwork, related links and structured data. Product pages list every structured detail the data states (contents, formats, genre, compatibility, BPM, specs; [discovery](discovery.md)) and load "You might also like" by script. Draft products still get a page (`noindex`, "Coming soon"); draft releases and news get none. Templates: `scripts/lib/pages.js`; head and JSON-LD: `scripts/lib/head.js`. (`scripts/lib/synth.js` is engine test material, not part of the build: [engine](engine.md).)
  - each first-party creator's profile page (`<creator>.html` → `/<creator>`, from `data/creators.js`; `scripts/lib/creator-page.js`), and the trust pages `/privacy`, `/terms`, `/refunds`, `/security`, `/contact`, `/copyright`, `/community-rules` (`data/legal.js`), `/help` (`data/help.js`) and `/license` (`data/licenses.js`) (`scripts/lib/trust-pages.js`), the community's opening-soon page `/community` (`scripts/lib/community-page.js`, which also loads the community's styles and scripts for the live pages, the moderation and reports scripts among them; once the community is on, its Function serves the live pages and their own `/community/sitemap.xml`, [community](community.md)), and the guides `/guide` and `/guide/<id>` (`data/guides.js`, `scripts/lib/guide-pages.js`; [guides](guides.md)).
  - a plain link per published project inside `<!-- projects:start -->`/`<!-- projects:end -->` on the home page and `/projects` (so project pages are linked in the HTML itself; `js/projects.js` upgrades them to cards),
  - `sitemap.xml` with every indexable page, `llms.txt` (below), `scripts/public-urls.txt` (the record of every URL ever published) and `db/catalog.sql` (the store database's copy of the catalog, [store](store.md); it rewrites only the catalog's own facet rows, never those worked out from published files, [discovery](discovery.md)). Generated pages whose data entry is gone (or became a draft) are deleted.
  - the browser's copies of lists the store owns (`data/vocabulary.js`, `data/content-types.js`, `data/features.js`) and the processing engine's test vocabulary (`engine/conformance/vocabulary.json`), so they can't drift from the server's.
  - `--check` writes nothing and fails if anything is out of date. Output is committed, so the repo is exactly what goes live; the deploy refuses to publish if it is out of date.
- Pages stay static HTML on Cloudflare Pages: no server rendering, no framework. Only the store API (`/api/*`) runs code ([store](store.md)); live price, ownership and download size are added to product pages by script, on top of the static price (in the purchase panel above the details). Lists (shop grid, news, release cards) are still rendered in the browser from `data/`; the head, item pages and sitemap are static so every crawler and link preview sees them.

## Addresses

- The home page is `index.html` (the public cover), served and canonical at `https://autostacc.com/`. `/home` and `/home.html` 301 there (`_redirects`).
- Platform pages: `/shop` and `/shop/<id>`, `/about`, `/projects`, `/explore` (releases, news and shows from every project, [browse](browse.md)). Project pages: `/<creator>/<id>` and its own pages (Glitches & Stitches: `/music`, `/news`, `/press` under it, plus `/<creator>/<id>/music/<release>` and `/<creator>/<id>/news/<post>`). The pre-2026-10-08 addresses (`/music`, `/music/*`, `/news`, `/news/*`, `/press`) 301 to their new ones; `seo-test.js` checks every recorded URL still lands on a page, and `deploy-check.js` checks one redirect live. Cloudflare Pages 308s `/x.html` and `/x/` to `/x`; query strings are covered by the canonical tag.
- All internal links are root-relative clean addresses, so no internal link goes through a redirect.
- Studio creators' pages (profiles at `/<creator>` and project sites, made in the visual builder: [builder](builder.md)) are rendered by the store, not the build: they carry their own title (ending "· AutoStacc"), description and canonical, stay `noindex` until AutoStacc marks the creator trusted, and aren't in `sitemap.xml` yet.
- `_headers` sends `X-Robots-Tag: noindex` on `*.pages.dev` (the project address and every preview deployment), so only autostacc.com gets indexed. The owner's Bulk Redirect also sends `autostacc.pages.dev` to autostacc.com.
- `robots.txt` allows everything public (including CSS/JS/data, which pages need to render) and blocks the signed-in app, the store's private pages and the API: `/dashboard`, `/account`, `/settings`, `/studio`, `/login`, `/library`, `/admin`, `/checkout`, `/cart`, `/product` (the unpublished product template page), `/api/`, `/private/`. Those pages are also `noindex` with no canonical and stay out of the sitemap (both test suites check this). It names the sitemap. AI crawlers (GPTBot, ClaudeBot, PerplexityBot and others) are allowed on public pages like any crawler. `llms.txt` (generated by `scripts/lib/llms.js` from `data/`) summarizes the platform, its vocabulary, each project, its pages, releases and products in plain text for AI assistants that don't run JavaScript (drafts excluded).
- The 404 page is `noindex` and returns a real 404 status.

## Structured data (schema.org JSON-LD)

| Page | Types |
| --- | --- |
| Home (`/`) | `WebSite` and `Organization` (AutoStacc: logo, image), `WebPage` |
| About | `AboutPage` about the Organization, plus the `Organization` |
| Project home | `WebPage` about the project, plus its full entity (`entity` in data/projects.js; Glitches & Stitches: `MusicGroup` with bio, genres, image, logo, `sameAs`) |
| Shop, Projects, Explore, a project's Music and News | `CollectionPage`, with an `ItemList` of the public products, projects, or that project's releases or posts (Explore has none: its lists are drawn in the browser) |
| Press (project) | `AboutPage` about the project, plus its full entity |
| Release | `WebPage` whose main entity is a `MusicAlbum` (release type, date, artwork, `MusicRecording` tracks with ISRC and duration, store links) |
| Product (not draft) | `ItemPage`, `Product` with the project as `Brand` and an `Offer` sold by AutoStacc (price, currency, `InStock`) |
| News post | `WebPage` whose main entity is a `BlogPosting` by the project, published by AutoStacc |
| Creator profile (`/<creator>`) | `ProfilePage` with an `ItemList` of its published projects |
| Trust pages (privacy, terms, refunds, security, contact, help, licence) | `WebPage` |
| Shows | `MusicEvent`, added in the browser by `js/shows.js` only for upcoming shows with a ticket link |

Every indexable page below home also has a `BreadcrumbList` (`seo-test.js` checks it). No ratings or reviews are ever generated. Draft products publish no `Product` data.

## Tests that protect it

- `node scripts/seo-test.js` (static, no browser): build up to date; every page has one title ending "· AutoStacc" (the home page's starts with it), and pages under `/<creator>/<id>` also name the project ("HAIL (single) · Glitches & Stitches · AutoStacc"), a description, viewport, lang; canonical equals the page's clean address; unique titles and descriptions; Open Graph complete with on-site images; `noindex` only on the 404, draft products and private pages (dashboard, account, settings, Studio, login, Your Stacc, cart, checkout, admin, the `/product` template); one `h1`, no skipped headings, image alt and size; internal links resolve without redirects; JSON-LD parses, has required fields, absolute https URLs and no reviews; sitemap is valid XML with only canonical public URLs; robots.txt allows public pages (and never blocks `/`, `/shop`, `/about`, `/projects` or a project page) and blocks private ones; `_headers` keeps `*.pages.dev` out of search; every URL in `scripts/public-urls.txt` is still live or redirected; no placeholder profiles or email; brand spelling across everything published.
- `verify-site` (browser; CI installs a pinned Playwright, 1.56.1): the same head checks after scripts run, the 404 status, and a crawl from `/` that fails on broken links or sitemap URLs nothing links to (orphans).
- Both run in CI (`.github/workflows/seo.yml`) on pull requests only: one job runs `node scripts/build.js --check`, `seo-test.js` and `scripts/docs-test.js` (broken facts in the notes fail, and so does a note whose covered code changed without it, except in Dependabot's pull requests); a second runs `verify-site` and is skipped when it already passed on exactly these files (a marker in the Actions cache). Nothing runs again when a pull request merges: the deploy (`.github/workflows/deploy.yml`) runs `build.js --check`, `seo-test.js` and the store unit tests and stops if any fails, then `deploy-check.js` against the live site.
- Removing or renaming a published page: add a 301 from the old address in `_redirects` (or delete its line from `scripts/public-urls.txt` if it should drop out of search).

## Images

Release artwork is the real cover from the distributor, stored as JPEG and WebP at 500 and 1000px and served with `srcset`, explicit size and descriptive alt text. Product covers are generated from the title until real artwork exists (`image` field; issue #9). `img/og.png` (1200x630) is AutoStacc's link preview (placeholder mark and wordmark); a project's pages use its own `image` (Glitches & Stitches: `img/projects/glitches-and-stitches/og.png`, whose glow bands if shrunk further, so it stays as is).
