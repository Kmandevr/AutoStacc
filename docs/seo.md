---
title: SEO
summary: How search visibility works on autostacc.com: generated metadata, item pages, sitemap, structured data, tests, and what still needs the owner.
updated: 2026-10-07
---

# SEO: how the site tells search engines it's the official home

Goal: when someone searches "Glitches & Stitches", search engines have every honest signal that https://autostacc.com is the artist's official site. Nothing here guarantees a ranking; it removes every technical reason not to rank and makes the identity unambiguous. The owner's steps (Search Console, profile links) are in [search-console](search-console.md).

## One source, one generator

- **Identity** lives in `data/site.js`: name, alternate spelling (only for search engines), address, home title and description, bio, genres, preview image, logo, official profiles (`socials`). The footer, press page, music page and structured data (`sameAs`) all read the same list. Empty `url` = not set; placeholders are not allowed.
- **Content** lives in `data/music.js` (releases), `data/products.js`, `data/news.js`, `data/shows.js`. `draft: true` marks placeholders: kept out of search, and draft news, shows and releases aren't shown at all (they would state invented facts).
- **`node scripts/build.js`** generates, from that data:
  - the block between `<!-- seo:start -->` and `<!-- seo:end -->` in every page's head: canonical, robots, Open Graph, Twitter card, JSON-LD. Hand-written pages keep their own `<title>` and description above the block; the home page's come from `data/site.js`.
  - one static page per release (`music/<id>.html` → `/music/<id>`), product (`shop/<id>.html`) and news post (`news/<id>.html`), with breadcrumbs, artwork, related links and structured data. Templates: `scripts/lib/pages.js`; head and JSON-LD: `scripts/lib/head.js`.
  - `sitemap.xml` with every indexable page, and `scripts/public-urls.txt`, the record of every URL ever published.
  - `--check` writes nothing and fails if anything is out of date. Output is committed, so the repo is exactly what goes live; the deploy refuses to publish if it is out of date.
- Pages stay static HTML on Cloudflare Pages: no server rendering, no Worker, no framework. Lists (shop grid, news, release cards) are still rendered in the browser from `data/`; the head, item pages and sitemap are static so every crawler and link preview sees them.

## Addresses

- Home is `index.html`, served and canonical at `https://autostacc.com/`. `/home` and `/home.html` 301 there (`_redirects`).
- Pages are `/music`, `/shop`, `/news`, `/press`, plus `/music/<id>`, `/shop/<id>`, `/news/<id>`. Cloudflare Pages 308s `/x.html` and `/x/` to `/x`; query strings are covered by the canonical tag.
- All internal links are root-relative clean addresses, so no internal link goes through a redirect.
- `_headers` sends `X-Robots-Tag: noindex` on `*.pages.dev` (the project address and every preview deployment), so only autostacc.com gets indexed. The owner's Bulk Redirect also sends `autostacc.pages.dev` to autostacc.com.
- `robots.txt` allows everything public (including CSS/JS/data, which pages need to render) and blocks `/account`, `/login`, `/admin`, `/checkout`, `/cart`, `/api/`, `/private/` in case they're ever added. It names the sitemap.
- The 404 page is `noindex` and returns a real 404 status.

## Structured data (schema.org JSON-LD)

| Page | Types |
| --- | --- |
| Home | `WebSite` (name, alternate name), `MusicGroup` (the artist: bio, genres, image, logo, `sameAs` profiles), `WebPage` |
| Music, Shop, News | `CollectionPage` with an `ItemList` of the releases, public products or posts, `BreadcrumbList` |
| Press | `AboutPage` about the artist, plus the full `MusicGroup` |
| Release | `MusicAlbum` (release type, date, artwork, `MusicRecording` tracks with ISRC and duration, store links), `BreadcrumbList` |
| Product (not draft) | `ItemPage`, `Product` with `Brand` and an `Offer` (price, currency; `InStock` with a checkout link, otherwise `OutOfStock`) |
| News post | `BlogPosting`, `BreadcrumbList` |
| Shows | `MusicEvent`, added in the browser by `js/shows.js` only for upcoming shows with a ticket link |

No ratings or reviews are ever generated. Draft products publish no `Product` data.

## Tests that protect it

- `node scripts/seo-test.js` (static, no browser): build up to date; every page has one title naming the artist, a description, viewport, lang; canonical equals the page's clean address; unique titles and descriptions; Open Graph complete with on-site images; `noindex` only on the 404 and draft products; one `h1`, no skipped headings, image alt and size; internal links resolve without redirects; JSON-LD parses, has required fields, absolute https URLs and no reviews; sitemap is valid XML with only canonical public URLs; robots.txt allows public pages and blocks private ones; every URL in `scripts/public-urls.txt` is still live or redirected; no placeholder profiles or email; brand spelling across everything published.
- `verify-site` (browser): the same head checks after scripts run, the 404 status, and a crawl from `/` that fails on broken links or sitemap URLs nothing links to (orphans).
- Both run in CI (`.github/workflows/seo.yml`) on every pull request; the deploy runs the build and `seo-test.js` and stops if it fails.
- Removing or renaming a published page: add a 301 from the old address in `_redirects` (or delete its line from `scripts/public-urls.txt` if it should drop out of search).

## Images

Release artwork is the real cover from the distributor, stored as JPEG and WebP at 500 and 1000px and served with `srcset`, explicit size and descriptive alt text. Product covers are generated from the title until real artwork exists (`image` field; issue #9). `img/og.png` (1200x630) is the fallback link preview; it's only fetched by link-preview crawlers, and shrinking it further visibly banded its glow, so it stays as is.
