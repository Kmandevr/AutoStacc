---
paths:
  - "*.html"
---

# Pages

- Header and footer are empty `<header id="site-header">` / `<footer id="site-footer">` elements that `js/layout.js` fills. Never hand-write them. `<body data-page="...">` drives the active nav link.
- Load only what the page uses, in this order: `data/*.js`, `js/util.js`, `js/layout.js`, then feature scripts. Stylesheets: `base`, `layout`, then feature sheets. Add a feature's script, data file and stylesheet to the pages that use it, and no others.
- A new page is a copy of `shop.html` or `news.html` with its own title, meta description, canonical and `og:` tags, `data-page` and one `<h1 class="glitch">`. Add it to `sitemap.xml` and, if it belongs in the menu, to the links in `js/layout.js`. `<main id="main">` is the skip-link target.
- `404.html` uses `<base href="/">` because it is served at any address; keep its links relative to the site root.
- Content comes from `data/` through scripts. Page markup holds structure and static copy only, and shouldn't gain inline `<style>`, `<script>` or `style=` (one old `style=` in `home.html`'s newsletter heading belongs in `css/home.css`).
- Basics: `lang`, viewport meta, one `h1`, landmarks (`header`, `main`, `footer`), `alt` on images, descriptive link text.
