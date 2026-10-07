# AutoStacc

Website for the EDM artist **Glitches & Stitches**: sells digital items (sample packs, presets, stems, music, visuals) and posts news, tour dates and updates.

It is a plain static site (HTML, CSS and JavaScript, no framework or server), hosted on Cloudflare Pages at https://autostacc.com. One small Node script, `scripts/build.js`, generates the search metadata, the release/product/news pages and the sitemap from `data/`; its output is committed, so the site is still just static files.

## Pages

| File | What it shows |
| --- | --- |
| `index.html` (`/`) | Hero, music player and streaming links, latest news, featured products, upcoming shows, about, the loop, newsletter signup |
| `music.html` (`/music`) | Every release, and the official profiles |
| `shop.html` (`/shop`) | All products, filterable by category |
| `news.html` (`/news`) | Every update in full |
| `press.html` (`/press`) | Short and long bio (with copy buttons), booking and press contact, press kit, fact sheet, official profiles |
| `404.html` | Shown for any address that doesn't exist |
| `music/`, `shop/`, `news/` | Generated: one page per release (`/music/hail`), product and news post. Don't edit; change `data/` and rebuild |

Also published: `img/` (icons, link-preview image, release artwork), `robots.txt`, `sitemap.xml` (generated), `_redirects` and `_headers`.

## Code layout

One file per feature in `css/` and `js/`; each page loads only the ones it uses. Setup for Claude Code is described in `.claude/README.md`.

## Updating content

All content lives in `data/`. Edit these files, then run `node scripts/build.js` and commit what it changed; you don't need to touch the HTML.

- `data/site.js`: artist name, site address, home page title and description, booking email, press kit link, official profiles, newsletter endpoint. Leave a profile's `url` empty until the real profile exists.
- `data/music.js`: releases (each gets a page at `/music/<id>`), with artwork, tracks, streaming links and the embedded player. HAIL plays from YouTube (full track, every play counts as a view) and falls back to Deezer's player if YouTube can't play for a visitor.
- `data/products.js`: items for sale (each gets a page at `/shop/<id>`)
- `data/news.js`: news posts (each gets a page at `/news/<id>`; the newest is shown first automatically)
- `data/shows.js`: tour dates (past dates are hidden automatically). Shows with a ticket link are also announced to Google.

Entries marked `draft: true` are placeholders: they stay out of search (and draft news, shows and releases aren't shown). How search visibility works: `docs/seo.md`. Google Search Console setup for the owner: `docs/search-console.md`.

## Selling digital items

Each product has a `checkoutUrl`. Point it at a hosted checkout that takes payment **and** delivers the file, for example:

- [Stripe Payment Links](https://stripe.com/payments/payment-links) (set a redirect to the download after payment)
- [Gumroad](https://gumroad.com), [Lemon Squeezy](https://www.lemonsqueezy.com), [Payhip](https://payhip.com) or [Bandcamp](https://bandcamp.com)

While `checkoutUrl` is empty, the product shows a disabled "Coming soon" button. Payment and file delivery happen on the provider's side, so this site never handles card details or the download files themselves.

## Newsletter

Set `newsletterAction` in `data/site.js` to a form endpoint (Buttondown, Mailchimp, Formspree and similar). While it's empty, the form shows a "coming soon" message.

## Running locally

Serve the folder the way Cloudflare Pages does (clean addresses like `/shop`, redirects, real 404s):

```sh
node scripts/serve.js        # then visit http://localhost:8000/
node scripts/build.js        # after changing data/: regenerate heads, item pages and sitemap
node scripts/seo-test.js     # search-visibility tests (also run in CI and before every deploy)
```

## Deploying to Cloudflare Pages

The live site is deployed by `.github/workflows/deploy.yml` on every push to `main`. It first checks that the generated files match `data/` and runs `scripts/seo-test.js`; either failing stops the deploy. One-time setup:

1. In Cloudflare, create an API token (**My Profile → API Tokens → Create Token**, custom token with **Account → Cloudflare Pages → Edit**) and copy your **Account ID** from the dashboard.
2. In this repository, open **Settings → Secrets and variables → Actions** and add them as `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Run the workflow (**Actions → Deploy to Cloudflare Pages → Run workflow**) or push to `main`.
4. In Cloudflare, open **Workers & Pages → autostacc → Custom domains** and add the domain. Cloudflare provides the HTTPS certificate automatically; no certificate or key goes in this repository.
