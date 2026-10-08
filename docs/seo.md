---
title: SEO
summary: How search visibility works on autostacc.com: generated metadata, item pages, sitemap, structured data, tests, and what still needs the owner.
updated: 2026-10-08
---

# SEO: how the site tells search engines who it is

Since 2026-10-08 autostacc.com is AutoStacc, the platform (WebSite and Organization), and each project has its own home under `/projects/<id>` that is that project's official page: when someone searches "Glitches & Stitches", search engines have every honest signal that https://autostacc.com/projects/glitches-and-stitches is the artist's official page (decision in [decisions](decisions.md)). Nothing here guarantees a ranking; it removes every technical reason not to rank and makes the identity unambiguous. The owner's steps (Search Console, profile links) are in [search-console](search-console.md).

## One source, one generator

- **Identity:** AutoStacc's is `data/site.js` (name, address, hub title and description, preview image, logo). Each project's is its entry in `data/projects.js`: name, alternate spelling (only for search engines), home title and description, bio, genres, image, logo, official profiles (`socials`). The project's footer row, press page, music page and structured data (`sameAs`) all read the same list. Empty `url` = not set; placeholders are not allowed.
- **Content** lives in `data/music.js` (releases), `data/products.js`, `data/news.js`, `data/shows.js`. `draft: true` marks placeholders: kept out of search, and draft news, shows and releases aren't shown at all (they would state invented facts).
- **`node scripts/build.js`** generates, from that data:
  - the block between `<!-- seo:start -->` and `<!-- seo:end -->` in every page's head: canonical, robots, Open Graph, Twitter card, JSON-LD. Hand-written pages keep their own `<title>` and description above the block; the hub's come from `data/site.js` and each project home's (`projects/<id>.html`) from `data/projects.js`. Hand-written pages are every `*.html` at the root and under `projects/`.
  - one static page per product (`shop/<id>.html` → `/shop/<id>`), and per project release (`projects/<project>/music/<id>.html`) and news post (`projects/<project>/news/<id>.html`), in the project's skin, with breadcrumbs, artwork, related links and structured data. Templates: `scripts/lib/pages.js`; head and JSON-LD: `scripts/lib/head.js`.
  - a plain link per published project inside `<!-- projects:start -->`/`<!-- projects:end -->` on the hub and `/projects` (so project pages are linked in the HTML itself; `js/projects.js` upgrades them to cards),
  - `sitemap.xml` with every indexable page, and `scripts/public-urls.txt`, the record of every URL ever published.
  - `--check` writes nothing and fails if anything is out of date. Output is committed, so the repo is exactly what goes live; the deploy refuses to publish if it is out of date.
- Pages stay static HTML on Cloudflare Pages: no server rendering, no framework. Only the store API (`/api/*`) runs code ([store](store.md)); live price and ownership are added to product pages by script, on top of the static price. Lists (shop grid, news, release cards) are still rendered in the browser from `data/`; the head, item pages and sitemap are static so every crawler and link preview sees them.

## Addresses

- The hub is `index.html`, served and canonical at `https://autostacc.com/`. `/home` and `/home.html` 301 there (`_redirects`).
- Platform pages: `/shop` and `/shop/<id>`, `/about`, `/projects`. Project pages: `/projects/<id>` and its own pages (Glitches & Stitches: `/music`, `/news`, `/press` under it, plus `/projects/<id>/music/<release>` and `/projects/<id>/news/<post>`). The pre-2026-10-08 addresses (`/music`, `/music/*`, `/news`, `/news/*`, `/press`) 301 to their new ones; `seo-test.js` checks every recorded URL still lands on a page, and `deploy-check.js` checks one redirect live. Cloudflare Pages 308s `/x.html` and `/x/` to `/x`; query strings are covered by the canonical tag.
- All internal links are root-relative clean addresses, so no internal link goes through a redirect.
- `_headers` sends `X-Robots-Tag: noindex` on `*.pages.dev` (the project address and every preview deployment), so only autostacc.com gets indexed. The owner's Bulk Redirect also sends `autostacc.pages.dev` to autostacc.com.
- `robots.txt` allows everything public (including CSS/JS/data, which pages need to render) and blocks the store's private pages and API: `/account`, `/login`, `/library`, `/admin`, `/checkout`, `/cart`, `/api/`, `/private/`. Those pages are also `noindex` with no canonical and stay out of the sitemap (both test suites check this). It names the sitemap.
- The 404 page is `noindex` and returns a real 404 status.

## Structured data (schema.org JSON-LD)

| Page | Types |
| --- | --- |
| Hub (`/`) | `WebSite` and `Organization` (AutoStacc: logo, image), `WebPage` |
| About | `AboutPage` about the Organization |
| Project home | `WebPage` about the project, plus its full entity (`entity` in data/projects.js; Glitches & Stitches: `MusicGroup` with bio, genres, image, logo, `sameAs`), `BreadcrumbList` |
| Shop, Projects, a project's Music and News | `CollectionPage` with an `ItemList` of the public products, projects, or that project's releases or posts, `BreadcrumbList` |
| Press (project) | `AboutPage` about the project, plus its full entity |
| Release | `MusicAlbum` (release type, date, artwork, `MusicRecording` tracks with ISRC and duration, store links), `BreadcrumbList` |
| Product (not draft) | `ItemPage`, `Product` with the project as `Brand` and an `Offer` sold by AutoStacc (price, currency, `InStock`) |
| News post | `BlogPosting` by the project, published by AutoStacc, `BreadcrumbList` |
| Shows | `MusicEvent`, added in the browser by `js/shows.js` only for upcoming shows with a ticket link |

No ratings or reviews are ever generated. Draft products publish no `Product` data.

## Tests that protect it

- `node scripts/seo-test.js` (static, no browser): build up to date; every page has one title naming its owner (AutoStacc on platform pages, the project on `/projects/<id>...`), a description, viewport, lang; canonical equals the page's clean address; unique titles and descriptions; Open Graph complete with on-site images; `noindex` only on the 404 and draft products; one `h1`, no skipped headings, image alt and size; internal links resolve without redirects; JSON-LD parses, has required fields, absolute https URLs and no reviews; sitemap is valid XML with only canonical public URLs; robots.txt allows public pages and blocks private ones; every URL in `scripts/public-urls.txt` is still live or redirected; no placeholder profiles or email; brand spelling across everything published.
- `verify-site` (browser): the same head checks after scripts run, the 404 status, and a crawl from `/` that fails on broken links or sitemap URLs nothing links to (orphans).
- Both run in CI (`.github/workflows/seo.yml`) on every pull request; the deploy runs the build and `seo-test.js` and stops if it fails.
- Removing or renaming a published page: add a 301 from the old address in `_redirects` (or delete its line from `scripts/public-urls.txt` if it should drop out of search).

## Images

Release artwork is the real cover from the distributor, stored as JPEG and WebP at 500 and 1000px and served with `srcset`, explicit size and descriptive alt text. Product covers are generated from the title until real artwork exists (`image` field; issue #9). `img/og.png` (1200x630) is AutoStacc's link preview (placeholder mark and wordmark); a project's pages use its own `image` (Glitches & Stitches: `img/projects/glitches-and-stitches/og.png`, whose glow bands if shrunk further, so it stays as is).
