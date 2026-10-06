# AutoStacc

Website for the EDM artist **Glitches & Stitches**: sells digital items (sample packs, presets, stems, music, visuals) and posts news, tour dates and updates.

It is a plain static site (HTML, CSS and JavaScript, with no build step or server), so it can be hosted for free on GitHub Pages, Netlify or Cloudflare Pages.

## Pages

| File | What it shows |
| --- | --- |
| `index.html` | Hero, latest news, featured products, upcoming shows, about, newsletter signup |
| `shop.html` | All products, filterable by category |
| `news.html` | Every update in full |

## Updating content

All content lives in `data/`. Edit these files; you don't need to touch the HTML.

- `data/site.js`: artist name, contact email, social links, newsletter endpoint
- `data/products.js`: items for sale
- `data/news.js`: news posts (the newest is shown first automatically)
- `data/shows.js`: tour dates (past dates are hidden automatically)

## Selling digital items

Each product has a `checkoutUrl`. Point it at a hosted checkout that takes payment **and** delivers the file, for example:

- [Stripe Payment Links](https://stripe.com/payments/payment-links) (set a redirect to the download after payment)
- [Gumroad](https://gumroad.com), [Lemon Squeezy](https://www.lemonsqueezy.com), [Payhip](https://payhip.com) or [Bandcamp](https://bandcamp.com)

While `checkoutUrl` is empty, the product shows a disabled "Coming soon" button. Payment and file delivery happen on the provider's side, so this site never handles card details or the download files themselves.

## Newsletter

Set `newsletterAction` in `data/site.js` to a form endpoint (Buttondown, Mailchimp, Formspree and similar). While it's empty, the form shows a "coming soon" message.

## Running locally

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploying to GitHub Pages

In the repository, open **Settings → Pages**, set the source to "Deploy from a branch", and pick the branch and `/ (root)`.
