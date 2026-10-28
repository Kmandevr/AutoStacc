---
title: Search Console
summary: Step-by-step for the owner: set up Google Search Console for autostacc.com, submit the sitemap, request indexing, and point every official profile back to the site.
covers: [data/projects.js, robots.txt, _redirects, sitemap.xml, server/content/sitemap.js]
updated: 2026-10-28
---

# Google Search Console and profile checklist

The website side is done: clean addresses, canonical links, a sitemap (with the trust pages, guides, `/community`, `/copyright`, `/copyright-notice` and `/community-rules`; the community's threads get their own sitemap when it opens), robots.txt and structured data saying who AutoStacc and each project are (details in [seo](seo.md)). Two things only the owner can do: tell Google the site is yours, and make every official profile link back to it. No one can guarantee a #1 result; these steps give Google every legitimate reason to treat autostacc.com as AutoStacc's site and its Glitches & Stitches page as the artist's official home.

## Before you start: quick checks (2 minutes)

Open each of these in a browser. They should all work:

- https://autostacc.com/ shows AutoStacc's public home page (not a redirect to /home or to login)
- https://autostacc.com/autostacc/glitches-and-stitches/music/hail shows the HAIL page, and the old https://autostacc.com/music/hail redirects there
- https://autostacc.com/sitemap.xml shows a list of addresses
- https://autostacc.com/robots.txt names both `Sitemap: https://autostacc.com/sitemap.xml` and `Sitemap: https://autostacc.com/sitemap-content.xml` (releases and news posts made in the Studio)
- https://autostacc.com/this-does-not-exist shows the "Not found" page
- http://autostacc.com (no s) and https://www.autostacc.com both end up on https://autostacc.com/. If `www` doesn't work: Cloudflare dashboard → autostacc.com → DNS, add a proxied `CNAME` record `www` → `autostacc.com`, then Rules → Redirect Rules → "Redirect from WWW to root" template. "Always Use HTTPS" is under SSL/TLS → Edge Certificates; turn it on if it isn't.

## 1. Add autostacc.com as a Domain property

1. Go to https://search.google.com/search-console and sign in with the Google account you want to own the site's data.
2. Click **Add property** and choose **Domain** (the left box). Type `autostacc.com` (no https, no www). A Domain property covers http, https, www and every page in one place.

## 2. Verify you own it (DNS record in Cloudflare)

1. Google shows a TXT record starting with `google-site-verification=`. Copy it.
2. In Cloudflare: **autostacc.com → DNS → Records → Add record**. Type `TXT`, Name `@`, Content: paste the value. Save.
3. Back in Search Console, click **Verify**. If it says not found, wait 10 minutes and try again. Leave the TXT record in place forever; removing it removes your access.

## 3. Submit the sitemap

1. In the left menu: **Sitemaps**.
2. Under "Add a new sitemap" type `sitemap.xml` and click **Submit**, then do the same for `sitemap-content.xml` (the release and news pages made in the Studio).
3. Status should become **Success** within a day, with the number of discovered pages. The sitemaps update themselves when releases, products or news are added; you never need to resubmit it. `sitemap.xml` also lists the platform pages the build makes, `/creators` among them since 2026-10-21; check it shows in the discovered count.

## 4. Inspect the home page and request indexing

1. Paste `https://autostacc.com/` into the search bar at the top of Search Console.
2. If it says "URL is not on Google", click **Request indexing**. If it says "URL is on Google", you're done with this step.
3. Click **Test live URL** → **View tested page** → **Screenshot** to confirm Google sees the real page.

## 5. Inspect the important pages

Do the same (paste the address, Request indexing if needed) for:

- https://autostacc.com/autostacc/glitches-and-stitches
- https://autostacc.com/autostacc/glitches-and-stitches/music/hail
- https://autostacc.com/autostacc/glitches-and-stitches/music
- https://autostacc.com/autostacc/glitches-and-stitches/press
- https://autostacc.com/autostacc/glitches-and-stitches/news
- https://autostacc.com/shop
- https://autostacc.com/projects
- https://autostacc.com/explore

When a new release or real product goes live, inspect its page (`/autostacc/glitches-and-stitches/music/<name>` or `/shop/<name>`) the same way. Google allows a limited number of requests per day; only request the pages that matter.

## 6. Watch indexing coverage (weekly for the first month, then monthly)

**Indexing → Pages.** "Indexed" should grow to the number of addresses in the sitemap. Under "Why pages aren't indexed", these are expected and fine:

- *Excluded by 'noindex' tag*: the 404 page and placeholder products (marked `draft` in the data). They join search once they're real.
- *Page with redirect*: old addresses like /home, /shop.html and the pre-2026-10-08 /music, /news and /press pages.
- *Alternate page with proper canonical tag*: addresses with `?something` on the end.
- *Blocked by robots.txt*: the signed-in and store pages (dashboard, Your Stacc, settings, Studio, login, cart, checkout, admin), the store API and the site search results (`/search`), which are private or change with every query on purpose.

Anything else (for example "Crawled – currently not indexed" on the home page or HAIL for more than a few weeks): open a GitHub issue with a screenshot.

## 7. Watch what people search

**Performance → Search results.** Turn on "Average position". The **Queries** tab shows what people typed, for example "glitches and stitches", "glitches & stitches hail". New sites usually take a few weeks to appear. Don't chase every query; if people search for something real that the site doesn't answer (a release, a show), that's a content idea.

## 8. Fix what Search Console reports

Search Console emails you when something breaks. **Enhancements** (or "Experience") lists structured-data problems for products, breadcrumbs and so on. For anything it reports: open a GitHub issue, paste the message and the address. The site's automated tests (`node scripts/seo-test.js`) catch most problems before they go live.

Optional, same idea for Bing (also powers DuckDuckGo and others): https://www.bing.com/webmasters → **Import from Google Search Console**.

## Profiles that should point back to the official page

Search engines connect an artist to their official site when the site links to the profiles (done: footer, music and press pages, structured data) **and the profiles link back**. Add `https://autostacc.com/autostacc/glitches-and-stitches` (the artist's official page since 2026-10-08) wherever a profile has a website or links field. When a profile exists, put its address in the project's `socials` in `data/projects.js` (or send it to whoever updates the site).

| Profile | Status | What to do |
| --- | --- | --- |
| Deezer artist page | Linked from the site | Deezer for Creators (via DistroKid's artist tools): add the website if offered |
| Apple Music artist page | Linked from the site | The artist name is spelled "Glitches & Stiches" there. Ask DistroKid support to correct it to "Glitches & Stitches" (issue #10). Apple Music for Artists: claim the profile; it has no website field |
| Spotify | Not found yet | Find the artist page (or ask DistroKid), claim it in Spotify for Artists, add autostacc.com in the bio. Then add the URL to the project's `socials` in `data/projects.js` and HAIL's Spotify link in the Studio's Music editor |
| YouTube | HAIL is on the auto-generated "Release - Topic" channel | If there's an own channel: add autostacc.com under Customization → Links, then add the channel URL to the project's `socials` in `data/projects.js` |
| SoundCloud | Not set | Profile → Edit → Your links: add autostacc.com |
| Bandcamp | Not set | Profile → Edit profile → Website |
| Instagram, TikTok | Not set | Put autostacc.com as the bio link |
| Beatport | Not set | If releases go there, claim the artist page |
| DistroKid HyperFollow | Not set | Optional pre-save/link page; add it to the release's links in the Studio's Music editor if used |
| Press kit | Not set | Mention autostacc.com in the bio and one-sheet; set the project's `pressKitUrl` in `data/projects.js` |

Always write the name exactly **Glitches & Stitches** on every profile. Missing profiles and the booking email are tracked in issue #7.
