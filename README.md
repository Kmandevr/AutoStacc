# AutoStacc

Website for the EDM artist **Glitches & Stitches**: sells digital items (sample packs, presets, stems, music, visuals) and posts news, tour dates and updates.

It is a static site (HTML, CSS and JavaScript, no framework), hosted on Cloudflare Pages at https://autostacc.com, plus a small store API beside it (see [The store](#the-store)). One Node script, `scripts/build.js`, generates the search metadata, the release/product/news pages, the sitemap and the store's catalog from `data/`; its output is committed, so the pages are still just static files.

## Pages

| File | What it shows |
| --- | --- |
| `index.html` (`/`) | Hero, music player and streaming links, latest news, featured products, upcoming shows, about, the loop, newsletter signup |
| `music.html` (`/music`) | Every release, and the official profiles |
| `shop.html` (`/shop`) | All products, filterable by category |
| `news.html` (`/news`) | Every update in full |
| `press.html` (`/press`) | Short and long bio (with copy buttons), booking and press contact, press kit, fact sheet, official profiles |
| `cart.html`, `login.html`, `account.html`, `library.html`, `checkout.html`, `admin.html` | The store's private pages (kept out of search) |
| `404.html` | Shown for any address that doesn't exist |
| `music/`, `shop/`, `news/` | Generated: one page per release (`/music/hail`), product and news post. Don't edit; change `data/` and rebuild |

Also published: `img/` (icons, link-preview image, release artwork), `robots.txt`, `sitemap.xml` (generated), `_redirects` and `_headers`.

## Code layout

One file per feature in `css/` and `js/`; each page loads only the ones it uses. Setup for Claude Code is described in `.claude/README.md`.

## Updating content

All content lives in `data/`. Edit these files, then run `node scripts/build.js` and commit what it changed; you don't need to touch the HTML.

- `data/site.js`: artist name, site address, home page title and description, booking email, press kit link, official profiles, newsletter endpoint. Leave a profile's `url` empty until the real profile exists.
- `data/music.js`: releases (each gets a page at `/music/<id>`), with artwork, tracks, streaming links and the embedded player. HAIL plays from YouTube (full track, every play counts as a view) and falls back to Deezer's player if YouTube can't play for a visitor.
- `data/products.js`: items for sale (each gets a page at `/shop/<id>`); kinds of product in `data/product-types.js`
- `data/news.js`: news posts (each gets a page at `/news/<id>`; the newest is shown first automatically)
- `data/shows.js`: tour dates (past dates are hidden automatically). Shows with a ticket link are also announced to Google.

Entries marked `draft: true` are placeholders: they stay out of search (and draft news, shows and releases aren't shown). How search visibility works: `docs/seo.md`. Google Search Console setup for the owner: `docs/search-console.md`.

## The store

The site sells its own downloads: accounts, a cart, guest checkout through Stripe, a library of everything you own, private download links that expire, receipts by email (Brevo) and an admin for the owner. Pages stay static; the store is an API at `/api/*` (Cloudflare Pages Functions in `functions/`, code in `server/`) with a D1 database (`db/`) and private R2 storage. Card details never touch this site, and paid files are never public.

- How it works: [docs/store.md](docs/store.md)
- Switching it on (Cloudflare, Stripe, Brevo, secrets): [docs/store-setup.md](docs/store-setup.md)
- Local development and tests: [docs/development.md](docs/development.md)

Until the store is switched on (repository variable `STORE_ENABLED`), the deploy publishes the static site only and the store pages say it's offline.

## Running locally

Serve the folder the way Cloudflare Pages does (clean addresses like `/shop`, redirects, real 404s):

```sh
node scripts/serve.js        # static pages only, store offline: http://localhost:8000/
npm install && npm run dev   # whole site with the store in test mode: http://localhost:8788/
node scripts/build.js        # after changing data/: regenerate heads, item pages, sitemap and catalog
node scripts/seo-test.js     # search-visibility tests (also run in CI and before every deploy)
npm test                     # store unit tests; npm run test:api and npm run test:browser for the attack suites
```

## Deploying to Cloudflare Pages

The live site is deployed by `.github/workflows/deploy.yml` on every push to `main`. It first checks that the generated files match `data/` and runs the SEO and store unit tests; any failure stops the deploy. With the store enabled it also provisions and migrates the database ([docs/store-setup.md](docs/store-setup.md)), and afterwards checks the live site answers. One-time setup:

1. In Cloudflare, create an API token (**My Profile → API Tokens → Create Token**, custom token with **Account → Cloudflare Pages → Edit**) and copy your **Account ID** from the dashboard.
2. In this repository, open **Settings → Secrets and variables → Actions** and add them as `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Run the workflow (**Actions → Deploy to Cloudflare Pages → Run workflow**) or push to `main`.
4. In Cloudflare, open **Workers & Pages → autostacc → Custom domains** and add the domain. Cloudflare provides the HTTPS certificate automatically; no certificate or key goes in this repository.
