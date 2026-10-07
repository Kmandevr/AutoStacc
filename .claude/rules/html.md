---
paths:
  - "*.html"
---

# Pages

- Header and footer are empty `<header id="site-header">` / `<footer id="site-footer">` elements that `js/layout.js` fills. Never hand-write them. `<body data-page="...">` drives the active nav link.
- Load only what the page uses, in this order: `data/*.js`, `js/util.js`, `js/layout.js`, then feature scripts. Stylesheets: `base`, `layout`, then feature sheets. Add a feature's script, data file and stylesheet to the pages that use it, and no others.
- Paths are root-relative and links use clean addresses as served in production: `/css/base.css`, `/shop`, `/music/hail`, `/` for home. Never `shop.html` (that's a redirect hop). Preview locally with `node scripts/serve.js`.
- The home page is `index.html` (served at `/`); its title and description come from `data/site.js`.
- A new page is a copy of `shop.html` or `news.html` with its own `<title>` (ending `· Glitches &amp; Stitches`), meta description, `data-page`, the two empty seo markers and one `<h1 class="glitch">`. Then run `node scripts/build.js`: it fills canonical, Open Graph, Twitter and JSON-LD and adds the page to `sitemap.xml`. Link it from the nav (`js/layout.js`) or from related pages so it isn't an orphan. To keep a page out of search, put `<meta name="robots" content="noindex">` above the markers.
- Never edit inside `<!-- seo:start ... seo:end -->` or the generated pages in `music/`, `shop/`, `news/`; change `data/` or `scripts/lib/pages.js` and rebuild.
- `<main id="main">` is the skip-link target.
- Content comes from `data/` through scripts. Page markup holds structure and static copy only, and shouldn't gain inline `<style>`, `<script>` or `style=` (one old `style=` in `home.html`'s newsletter heading belongs in `css/home.css`).
- Basics: `lang`, viewport meta, one `h1`, no skipped heading levels, landmarks (`header`, `main`, `footer`), `alt` describing the image (not keywords; `alt=""` if decorative), `width`/`height` on images, descriptive link text.
