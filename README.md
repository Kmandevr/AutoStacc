# AutoStacc

**AutoStacc** is a platform for sample packs, presets, stems, music and visuals sold straight by the creators who make them: a storefront, accounts, checkout, the customer's library ("Your Stacc"), delivery and project discovery. **Creators** own **projects**, which live at `/<creator>/<project>`. AutoStacc itself is the first creator and the EDM artist **Glitches & Stitches** its first project, at `/autostacc/glitches-and-stitches` in its own skin. Anyone can become a creator in the Studio (`/studio`) and build free, block-based pages; no creator code runs on the site. Model: [docs/architecture.md](docs/architecture.md); creators: [docs/creators.md](docs/creators.md).

It is a static site (HTML, CSS and JavaScript, no framework), hosted on Cloudflare Pages at https://autostacc.com, plus a small store API beside it (see [The store](#the-store)). One Node script, `scripts/build.js`, generates the search metadata, the product, release and news pages, creator profile pages, the sitemap, `llms.txt` and the store's catalog from `data/`; its output is committed, so the pages are still just static files.

## Pages

| File | What it shows |
| --- | --- |
| `index.html` (`/`) | Public home page: the artists, picks from the store, how it works, and following projects for their free releases |
| `shop.html` (`/shop`) | All products, filterable by category |
| `projects.html` (`/projects`) | Every project: follow it, switch on Auto-Stacc for its free releases |
| `about.html` (`/about`) | How buying, downloads and Auto-Stacc work |
| `autostacc.html` (`/autostacc`) | AutoStacc's creator profile (generated from `data/creators.js`) |
| `autostacc/glitches-and-stitches.html` and `autostacc/glitches-and-stitches/` | Glitches & Stitches' home, music, news and press pages, in its own skin |
| `dashboard.html`, `library.html`, `settings.html`, `studio.html` | The signed-in app: dashboard, Your Stacc, Settings (one page for `/settings/profile`, `/security`, `/orders`, `/email`, `/privacy`), the Studio (kept out of search) |
| `cart.html`, `login.html`, `checkout.html`, `admin.html` | Cart, sign-in, checkout status and the owner's Control Center (kept out of search) |
| `404.html` | Shown for any address that doesn't exist |
| `shop/`, `<creator>/<project>/music/`, `<creator>/<project>/news/` | Generated: one page per product (`/shop/<id>`), release and news post. Don't edit; change `data/` and rebuild |

Studio creators' pages aren't files: they are stored in the database and rendered by `functions/[[path]].js`. Old addresses (`/music`, `/news`, `/press`) redirect to the project's (`_redirects`).

Also published: `img/` (icons, link-preview image, release artwork), `robots.txt`, `sitemap.xml` and `llms.txt` (generated), `_redirects` and `_headers`.

## Code layout

One file per feature in `css/` and `js/`; each page loads only the ones it uses. Every file starts with a one-line purpose comment and every top-level folder has a `.purpose` file; `.claude/tools/tree.sh [dir]` prints the map from them. Setup for Claude Code is described in `.claude/README.md`; project notes are in `docs/` ([docs/index.md](docs/index.md)).

## Updating content

All content lives in `data/`. Edit these files, then run `node scripts/build.js` and commit what it changed; you don't need to touch the HTML.

- `data/site.js`: AutoStacc itself (name, address, home page title and description, contact, logo).
- `data/creators.js` and `data/projects.js`: first-party creators and their projects. A project's identity (name, bio, booking email, press kit, official profiles, newsletter, skin) is its entry in `data/projects.js` ([docs/projects.md](docs/projects.md)). Leave a profile's `url` empty until the real profile exists.
- `data/music.js`: releases (each gets a page at `/<creator>/<project>/music/<id>`), with artwork, tracks, streaming links and the embedded player.
- `data/products.js`: items for sale (each gets a page at `/shop/<id>`); kinds of product in `data/product-types.js`.
- `data/stacclets.js`, `data/pacs.js`, `data/content-types.js`: how a project's content is organised in Your Stacc ([docs/architecture.md](docs/architecture.md)).
- `data/news.js`: news posts (each gets a page at `/<creator>/<project>/news/<id>`; the newest is shown first automatically).
- `data/shows.js`: tour dates (past dates are hidden automatically). Shows with a ticket link are also announced to Google.
- `data/polls.js`, `data/relationships.js`: community votes, and which tracks were built from which.

Entries marked `draft: true` are placeholders: they stay out of search (and draft news, shows and releases aren't shown). How search visibility works: `docs/seo.md`. Google Search Console setup for the owner: `docs/search-console.md`.

## The store

The site sells its own downloads: accounts, a cart, guest checkout through Stripe, a library of everything you own, private download links that expire, receipts by email (Brevo), sales and promo codes, and the owner's Control Center ([docs/admin.md](docs/admin.md)). Pages stay static; the store is an API at `/api/*` (Cloudflare Pages Functions in `functions/`, code in `server/`) with a D1 database (`db/`) and private R2 storage. Card details never touch this site, and paid files are never public.

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

The live site is deployed by `.github/workflows/deploy.yml` on every push to `main`. It first checks that the generated files match `data/` and runs the SEO and store unit tests; any failure stops the deploy. Pull requests run the same SEO checks (`seo.yml`) and all three store test suites (`store.yml`). With the store enabled it also provisions and migrates the database ([docs/store-setup.md](docs/store-setup.md)), and afterwards checks the live site answers. One-time setup:

1. In Cloudflare, create an API token (**My Profile → API Tokens → Create Token**, custom token with **Account → Cloudflare Pages → Edit**) and copy your **Account ID** from the dashboard.
2. In this repository, open **Settings → Secrets and variables → Actions** and add them as `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Run the workflow (**Actions → Deploy to Cloudflare Pages → Run workflow**) or push to `main`.
4. In Cloudflare, open **Workers & Pages → autostacc → Custom domains** and add the domain. Cloudflare provides the HTTPS certificate automatically; no certificate or key goes in this repository.
