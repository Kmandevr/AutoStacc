# AutoStacc

Website for the EDM artist **Glitches & Stitches**: sells digital items (sample packs, presets, stems, music, visuals) and posts news, tour dates and updates.

It is a plain static site (HTML, CSS and JavaScript, with no build step or server), so it can be hosted for free on GitHub Pages, Netlify or Cloudflare Pages.

## Pages

| File | What it shows |
| --- | --- |
| `home.html` | Hero, music player and streaming links, latest news, featured products, upcoming shows, about, the loop, newsletter signup |
| `shop.html` | All products, filterable by category |
| `news.html` | Every update in full |
| `press.html` | Short and long bio (with copy buttons), booking and press contact, press kit, fact sheet |
| `404.html` | Shown for any address that doesn't exist |

Also published: `img/` (site icon and the link-preview image), `robots.txt`, `sitemap.xml` and `_redirects`.

## Code layout

One file per feature in `css/` and `js/`; each page loads only the ones it uses. Setup for Claude Code is described in `.claude/README.md`.

## Updating content

All content lives in `data/`. Edit these files; you don't need to touch the HTML.

- `data/site.js`: artist name, site address, booking email, press kit link, social links, newsletter endpoint. Social links that are just a site's home page (like `https://instagram.com/`) stay hidden until you add the real profile.
- `data/music.js`: the embedded player (paste the embed link from Spotify, SoundCloud, Deezer, Bandcamp, Apple Music or YouTube) and streaming links. It currently plays HAIL from YouTube (full track, every play counts as a view) and falls back to Deezer's player if YouTube can't play for a visitor.
- `data/products.js`: items for sale
- `data/news.js`: news posts (the newest is shown first automatically)
- `data/shows.js`: tour dates (past dates are hidden automatically). Shows with a ticket link are also announced to Google.

## Selling digital items

Each product has a `checkoutUrl`. Point it at a hosted checkout that takes payment **and** delivers the file, for example:

- [Stripe Payment Links](https://stripe.com/payments/payment-links) (set a redirect to the download after payment)
- [Gumroad](https://gumroad.com), [Lemon Squeezy](https://www.lemonsqueezy.com), [Payhip](https://payhip.com) or [Bandcamp](https://bandcamp.com)

While `checkoutUrl` is empty, the product shows a disabled "Coming soon" button. Payment and file delivery happen on the provider's side, so this site never handles card details or the download files themselves.

## Newsletter

Set `newsletterAction` in `data/site.js` to a form endpoint (Buttondown, Mailchimp, Formspree and similar). While it's empty, the form shows a "coming soon" message.

## Running locally

Open `home.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000/home.html
```

## Deploying to Cloudflare Pages

The live site is deployed by `.github/workflows/deploy.yml` on every push to `main`. One-time setup:

1. In Cloudflare, create an API token (**My Profile → API Tokens → Create Token**, custom token with **Account → Cloudflare Pages → Edit**) and copy your **Account ID** from the dashboard.
2. In this repository, open **Settings → Secrets and variables → Actions** and add them as `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Run the workflow (**Actions → Deploy to Cloudflare Pages → Run workflow**) or push to `main`.
4. In Cloudflare, open **Workers & Pages → autostacc → Custom domains** and add the domain. Cloudflare provides the HTTPS certificate automatically; no certificate or key goes in this repository.

## Deploying to GitHub Pages

In the repository, open **Settings → Pages**, set the source to "Deploy from a branch", and pick the branch and `/ (root)`.
