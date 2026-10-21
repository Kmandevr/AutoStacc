<!-- covers: [.github/workflows/, package.json, wrangler.toml, scripts/serve.js, scripts/dev.js, workers/engine/wrangler.jsonc] -->
<!-- Kept current by scripts/docs-test.js: it fails when a top-level page, folder, workflow, npm script or data file
     isn't named here, and warns when the files above change without this README. -->
# AutoStacc

**AutoStacc** is a platform for sample packs, presets, stems, music and visuals, sold directly by the creators who make them. It covers the storefront, accounts, checkout, the customer's library ("Your Stacc"), delivery and project discovery. **Creators** own **projects**, which live at `/<creator>/<project>`. AutoStacc itself is the first creator, and the EDM artist **Glitches & Stitches** is its first project, at `/autostacc/glitches-and-stitches` in its own skin. Anyone can become a creator in the Studio (`/studio`): build free, block-based pages, and sell products whose files are organised with the Pack Builder. No creator code runs on the site. Model: [docs/architecture.md](docs/architecture.md); creators: [docs/creators.md](docs/creators.md); all notes: [docs/index.md](docs/index.md).

The site is static HTML, CSS and JavaScript with no framework, hosted on Cloudflare Pages at https://autostacc.com. Beside it are a small store API (see [The store](#the-store)) and a processing engine for creators' files (see [The engine](#the-engine)). One Node script, `scripts/build.js`, generates from `data/`:
- the search metadata;
- the product pages (for `data/products.js`, empty for now) and creator profile pages;
- the sitemap and `llms.txt`;
- the store's catalog.

Its output is committed, so the pages stay plain static files.

The code is published to be read and reviewed, not reused: [LICENSE](LICENSE) (all rights reserved). To report a security problem privately, see [SECURITY.md](SECURITY.md).

## Pages

| File | What it shows |
| --- | --- |
| `index.html` (`/`) | Public home page: the artists, picks from the store, how it works, and following projects for their free releases |
| `shop.html` (`/shop`) | All products, with search and filters (kind, genre, tempo, key and more; [docs/discovery.md](docs/discovery.md)) |
| `explore.html` (`/explore`) | New releases, news and shows from every project, searchable and filterable |
| `projects.html` (`/projects`) | Every project: follow it, or switch on Auto-Stacc for its free releases |
| `about.html` (`/about`) | How buying, downloads and Auto-Stacc work |
| `autostacc.html` (`/autostacc`) | AutoStacc's creator profile (generated from `data/creators.js`) |
| `autostacc/glitches-and-stitches.html` and `autostacc/glitches-and-stitches/` | Glitches & Stitches' home, music, news and press pages, in its own skin |
| `dashboard.html`, `library.html`, `settings.html`, `studio.html` | The signed-in app (kept out of search): dashboard, Your Stacc, Settings (one page for `/settings/profile`, `/security`, `/orders`, `/email`, `/privacy`), and the Studio (creator pages, products, the Pack Builder, earnings) |
| `cart.html`, `login.html`, `checkout.html`, `admin.html` | Cart, sign-in, checkout status and the owner's Control Center (kept out of search) |
| `product.html` (`/product?p=<id>`) | A Studio creator's product, fetched from the store API (kept out of search) |
| `privacy.html`, `terms.html`, `refunds.html`, `security.html`, `contact.html`, `copyright.html`, `community-rules.html`, `help.html`, `license.html` | Trust pages generated from `data/legal.js`, `data/help.js` and `data/licenses.js` ([docs/production.md](docs/production.md)). Don't edit them; change the data and rebuild |
| `copyright-notice.html` | The public copyright notice form (`js/copyright-notice.js` → `server/copyright/filing.js`), linked from `/copyright` ([docs/copyright.md](docs/copyright.md)) |
| `404.html` | Shown for any address that doesn't exist |
| `community.html` | Generated from `scripts/lib/community-page.js`: the "opening soon" page at `/community`, and the frame its Function (`functions/community.js`) fills with spaces and threads once the community is switched on ([docs/community.md](docs/community.md)) |
| `guide.html`, `guide/` | Generated guides from `data/guides.js`: `/guide` and one page per article (`/guide/<id>`), buying, Your Stacc and refunds, and the creator manual ([docs/guides.md](docs/guides.md)). Don't edit them; change the data and rebuild |
| `shop/` | Generated: one page per product in `data/products.js` (`/shop/<id>`). Don't edit them; change `data/` and rebuild |

Studio creators' pages aren't files: they're stored in the database and rendered by `functions/[[path]].js`. Neither are release and news pages (`/<creator>/<project>/music/<slug>`, `/news/<slug>`), first-party included: every creator makes releases, news and shows in the Studio, and the same Function renders the pages from the database and lists them in `/sitemap-content.xml` ([docs/creators.md](docs/creators.md)). Community pages (switched off for now) are rendered by `functions/community.js` and `functions/community/[[path]].js`. Old addresses (`/music`, `/news`, `/press`) redirect to the project's own (`_redirects`).

Also published:
- `img/`: icons, the link-preview image and release artwork;
- `robots.txt`, `sitemap.xml` and `llms.txt` (generated);
- `_redirects` and `_headers`.

## Code layout

| Folder | What it holds |
| --- | --- |
| `css/`, `js/` | One file per feature; each page loads only the ones it uses |
| `data/` | All content and settings, as data (below) |
| `functions/` | Pages Functions entry points, which hand straight off to `server/` |
| `server/` | The store API, one folder per area (auth, cart, checkout, downloads, packs, studio and more); entry `server/app.js` |
| `db/` | D1 migrations (forward-only) and the generated catalog |
| `engine/` | The Rust processing engine ([docs/engine.md](docs/engine.md)) |
| `workers/` | The engine Worker that runs the engine in a Cloudflare Container |
| `scripts/` | Build, local servers, deploy helpers and the repository's own checks |
| `test/` | Unit, API security and browser tests |
| `img/` | Images |
| `docs/` | Project notes, an Obsidian vault ([docs/index.md](docs/index.md)) |

Generated output (also committed): `shop/` for product pages, `guide/` for guide articles, and each first-party creator's profile (`autostacc.html`). The project pages in `autostacc/` are hand-written.

Every file starts with a one-line purpose comment, and every top-level folder has a `.purpose` file; `.claude/tools/tree.sh [dir]` prints the map from them. Setup for Claude Code is described in `.claude/README.md`.

## Updating content

All content lives in `data/`. Edit these files, run `node scripts/build.js`, and commit what it changed. You don't need to touch the HTML.

| Files | What they hold |
| --- | --- |
| `data/site.js` | AutoStacc itself: name, address, home page title and description, contact, logo |
| `data/creators.js`, `data/projects.js` | First-party creators and their projects. A project's identity (name, bio, booking email, press kit, official profiles, newsletter, skin) is its entry in `data/projects.js` ([docs/projects.md](docs/projects.md)). Leave a profile's `url` empty until the real profile exists |
| `data/products.js`, `data/product-types.js` | Catalog items for sale (each with a page at `/shop/<id>`; empty since 2026-10-21, as AutoStacc's own products are made in the Studio like every creator's), and the kinds of product |
| `data/stacclets.js`, `data/pacs.js` | How a project's content is organised in Your Stacc ([docs/architecture.md](docs/architecture.md)) |
| `data/polls.js`, `data/relationships.js` | Community votes, and typed links between products, Stacclets, Pacs and polls |
| `data/legal.js`, `data/help.js`, `data/licenses.js` | The trust pages' text |
| `data/guides.js` | The guides' sections and articles (`/guide`) |
| `data/guide-index.js` | Generated: the search index `/guide` and `/help` share; don't edit |
| `data/workspaces.js` | The names and order of the sections in the Product Studio and the Control Center |
| `data/content-types.js`, `data/vocabulary.js`, `data/features.js` | Generated by `scripts/build.js` from `server/` (file kinds, the store's facets and values, feature switches). Don't edit them |

Releases, news posts and show dates are not in `data/`: every project, Glitches & Stitches included, makes them in the Studio's Music, News and Shows editors (`/studio`), and products there too. Entries marked `draft: true` are placeholders and stay out of search. How search visibility works: [docs/seo.md](docs/seo.md). Google Search Console setup for the owner: [docs/search-console.md](docs/search-console.md).

## The store

The site sells its own downloads, with:
- accounts, a cart and guest checkout through Stripe;
- Your Stacc, a library of everything you own, where you can download single files, folders or whole Pacs;
- private download links that expire, and receipts by email (Brevo);
- sales and promo codes;
- creators' storefronts and payouts;
- the owner's Control Center ([docs/admin.md](docs/admin.md)).

Pages stay static. The store is an API at `/api/*`: Cloudflare Pages Functions in `functions/`, with the code in `server/`, a D1 database (`db/`) and private R2 storage. Card details never touch this site, and paid files are never public.

- How it works: [docs/store.md](docs/store.md)
- Switching it on (Cloudflare, Stripe, Brevo, secrets): [docs/store-setup.md](docs/store-setup.md)
- Creators' sales and payouts: [docs/payouts-setup.md](docs/payouts-setup.md)
- Local development and tests: [docs/development.md](docs/development.md)

Until the store is switched on (repository variable `STORE_ENABLED`), the deploy publishes only the static site, and the store pages say it's offline.

## The engine

Creators upload a whole Pac (a ZIP, a folder or loose files) in the Pack Builder.

The Rust engine in `engine/` reads it safely and checks every file's bytes (SHA-256 and CRC-32). It works out each file's format and technical details, and suggests a kind, tempo and key. Nothing is ever executed or transcoded.

It runs in two places:
- natively, in a Cloudflare Container driven by the engine Worker (`workers/engine/`);
- as WebAssembly in the browser, so the creator sees problems before anything uploads.

The server always re-checks what was uploaded. How it works and how to replace it: [docs/engine.md](docs/engine.md). The Pack Builder and Pac editor: [docs/packs.md](docs/packs.md).

## Running locally

Needs Node 22.13 or later. The local servers handle the site the way Cloudflare Pages does, with clean addresses like `/shop`, redirects and real 404s. Release and news pages come from the store database, so they only work under `npm run dev`. Its test data (`scripts/dev.js`) adds the six former placeholder products from `test/support/catalog-fixtures.js`, the real release and news post the migrations seed, and a test show; none of it is ever deployed.

```sh
node scripts/serve.js        # static pages only, store offline: http://localhost:8000/
npm install && npm run dev   # whole site with the store in test mode: http://localhost:8788/
node scripts/build.js        # after changing data/: regenerate heads, item pages, sitemap and catalog
node scripts/seo-test.js     # search-visibility tests (also run in CI and before every deploy)
node scripts/docs-test.js    # notes and this README still match the repository
npm test                     # store unit tests
npm run test:store           # API security and browser suites together (npm run test:api / test:browser run one)
npm run site                 # build and collect the published files into dist/, as the deploy does
```

The engine has its own commands: `cargo test` in `engine/`, plus conformance and fuzzing ([docs/engine.md](docs/engine.md)).

## CI and deploying

| Workflow | Runs | What it does |
| --- | --- | --- |
| `.github/workflows/seo.yml` | Pull requests | Build check, SEO tests and the docs check, plus the `verify-site` browser checks |
| `.github/workflows/store.yml` | Pull requests that change code | Store unit, API security and browser tests |
| `.github/workflows/engine.yml` | Pull requests that change the engine; pushes to `main` | Engine tests and Container image; deploys the engine Worker from `main` |
| `.github/workflows/engine-fuzz.yml` | Monthly | Fuzzes the engine's parsers |
| `.github/workflows/codeql.yml` | Pull requests and weekly, once the repository is public | Code scanning |
| `.github/workflows/deploy.yml` | Pushes to `main` | Build check, SEO and unit tests, then publishes to Cloudflare Pages and checks the live site |
| `.github/workflows/clear-status-on-close.yml` | Closed issues | Removes their status labels |

Checks run once, on the pull request. A job whose files already passed is skipped, and the merge to `main` only deploys ([docs/decisions.md](docs/decisions.md), "CI runs each check once"). With the store enabled, the deploy also provisions and migrates the database ([docs/store-setup.md](docs/store-setup.md)). Dependabot (`.github/dependabot.yml`) proposes dependency updates monthly. `.github/CODEOWNERS` names who reviews changes to CI, the API and the engine.

One-time setup:
1. In Cloudflare, create an API token (**My Profile → API Tokens → Create Token**). Make it a custom token with **Account → Cloudflare Pages → Edit**. With the store on, also add **D1 → Edit** and **Workers R2 Storage → Edit**; for the engine, the permissions listed in [docs/engine.md](docs/engine.md). Then copy your **Account ID** from the dashboard.
2. In this repository, open **Settings → Environments → production** (limited to `main`) and add them as the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The store's secrets go in the same place ([docs/store-setup.md](docs/store-setup.md)).
3. Run the workflow (**Actions → Deploy to Cloudflare Pages → Run workflow**), or push to `main`.
4. In Cloudflare, open **Workers & Pages → autostacc → Custom domains** and add the domain. Cloudflare provides the HTTPS certificate automatically; no certificate or key goes in this repository.
