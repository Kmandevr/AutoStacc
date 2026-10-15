---
title: Production requirements
summary: What makes AutoStacc fit to run as a public store (trust pages, licences, support, privacy, security, accessibility, SEO) and the rules every change must keep.
covers: [data/legal.js, data/help.js, data/licenses.js, data/product-types.js, data/site.js, scripts/lib/trust-pages.js, scripts/lib/rich-text.js, scripts/seo-test.js, _headers, server/files/policy.js, server/sites/images.js, server/sites/render.js, server/auth/index.js, server/lib/ratelimit.js, server/account/, server/email/preferences.js, server/analytics/routes.js, server/downloads/, server/impersonation/, server/packs/review.js, js/layout.js, SECURITY.md, LICENSE]
updated: 2026-10-15
---

# Production requirements

**Future feature work must preserve these requirements and must not bypass legal, security, accessibility, authorization, SEO or privacy protections.** If a change can't keep one, stop and ask the owner rather than working around it.

## Trust pages (all generated from `data/`)

| Page | Source | What it is |
| --- | --- | --- |
| `/privacy` | `data/legal.js` | What is collected, why, for how long, who else sees it, your choices |
| `/terms` | `data/legal.js` | General terms in plain language (not drafted by a lawyer, and says so) |
| `/refunds` | `data/legal.js` | Refunds for digital downloads |
| `/security` | `data/legal.js` | How accounts, payments and files are protected; reporting a problem |
| `/contact` | `data/legal.js` | How to reach AutoStacc, and what people can do themselves |
| `/help` | `data/help.js` | Questions and answers by topic (following, Auto-Stacc and release emails described as they work: opt-in, never paid items, announced releases only) |
| `/license` | `data/licenses.js` | What buyers may do, per kind of product |

- `scripts/build.js` writes them (`scripts/lib/trust-pages.js`; text markup in `scripts/lib/rich-text.js`: `[label](/path)`, `**bold**` and `{contact}` only, everything else escaped, a bad link fails the build). Never hand-edit the HTML.
- A document's `review` field shows a "To be confirmed" notice until the owner confirms its text; `scripts/seo-test.js` warns while any is set, and fails if a trust page is missing from the sitemap.
- **Write only what the code does.** When a change collects, keeps or shares something new (a field, a cookie, a provider, a log), update `/privacy` in the same change. Don't promise what isn't built.
- Owner decisions behind the text (support address, who runs AutoStacc, refunds, licences) are in [decisions](decisions.md).

## Licences

Each kind of product in `data/product-types.js` names its licence (`license: "sounds" | "stems" | "music" | "visuals"`), defined once in `data/licenses.js`. Product pages show a licence box (summary, "You can", "You can't", link to `/license#<key>`). A new kind of product picks an existing licence or gets a new one there; never write licence text on a product.

## Support and contact

One address, `SITE.email` in `data/site.js` (support@autostacc.com), used by the footer and `{contact}` in every trust page. Empty means the pages say plainly that support isn't set up yet; never put a made-up address there.

## Product pages

Show only facts that exist in `data/products.js` (`includes`, `pacs`, `metadata`, `preview`) or follow from it (type, price, project, licence). Never invent formats, file counts, sizes or specs. Product structured data is only published for products that are for sale (not drafts), with the real price and currency.

## Uploads

Nothing is accepted that isn't on a list. Paid files and previews: only the extensions in `server/files/policy.js`, each with a content type set by the server (never the uploader's) and, where the format has a reliable signature, a check of the file's first bytes; a file that isn't what its name says is deleted and refused (415). No HTML, SVG, scripts or executables. Previews are audio only (a Pac's preview clips: MP3, M4A, OGG or WAV under 20 MB, bytes matching the name). Pack Builder files are checked by the processing engine and the automated review (unsafe paths, files that aren't what their names say, programs, types AutoStacc doesn't deliver; at most 2,000 files a version and 4 GB a file, [packs](packs.md)). Customers' Studio images: PNG, JPEG, GIF or WebP by their bytes (`server/sites/images.js`). Downloads are always attachments with `nosniff`. A new format is one line in `policy.js` plus a test.

## Accounts and privacy

Users can see their data, change their name and password, sign out devices, choose optional emails, download everything (`/settings/privacy`, which says whether two-step sign-in is on but never its key or codes, wishlist, collections, tags and saved searches included) and delete their account (which erases them). The store's personal picks use history kept only in the browser and sent with each request, never stored by the server ([discovery](discovery.md)); searches and filters on Projects and Explore join that same history, and the home page reads it on the device to suggest projects ([browse](browse.md)). Deletion keeps orders only as anonymous sales records ([store](store.md#settings)), and keeps a product's change history while forgetting who made each change ([studio](studio.md)). Optional emails are opt-in and checked with `wants()` before sending (`server/email/preferences.js`). Visit counts are anonymous daily totals, skipped under Global Privacy Control or Do Not Track. Deletion is refused while the account owns a Studio creator, has a checkout that could still be paid, or is an admin (`server/account/delete.js`).

## Security

- The browser never decides prices, ownership, payment results or admin rights; the server and Stripe do. Every account-owned route checks the session; another person's id answers 404. Admin routes answer 404 to non-admins whatever the page shows.
- Rate limits: Better Auth limits sign-in, sign-up, resets and password changes (and, with admins' two-step sign-in switched on, the code steps: [store](store.md#accounts)); store routes call `limit()` (`server/lib/ratelimit.js`), counted per IP in the `rateLimit` table; counters idle for a day are deleted (about one limited request in a hundred runs the purge), which /privacy promises. Support impersonation can't use Better Auth's endpoints, refuses writes a route hasn't allowed and records every allowed one in the append-only audit log (`server/impersonation/policy.js`).
- `_headers`: HSTS and a baseline content policy on every page; account and store pages add a strict policy (own scripts only). Creators' Studio pages are served with `script-src 'none'` (`server/sites/render.js`). Public pages don't restrict scripts because the music players come from several services; tightening that needs the player origins checked against the live site first.
- The repository is public so it can be read and reviewed, not reused (`LICENSE`: all rights reserved). Vulnerabilities are reported privately (`SECURITY.md`, GitHub's private reporting, and `/security`). Secrets never go in the repository: they are GitHub secrets in the `production` Environment, which only the deploy jobs on `main` use, and Cloudflare secrets ([store-setup](store-setup.md)). CodeQL, Dependabot, `.github/CODEOWNERS` and the CI rules for a public repository: [development](development.md).
- Downloads: private files, links made per request, bound to the buyer and expiring after 5 minutes (`downloadTtlSeconds`). ZIPs of several files (`POST /api/downloads/bundle`) follow the same rules per file: each checked against its own product's entitlement when the link is made and again when used, names inside the ZIP cleaned so nothing can unpack outside its folder, and only files whose checksum is on record (Pack Builder files, and older files once the sweep has hashed them) ([packs](packs.md)).

## Accessibility

Keep: skip link, one `h1`, landmarks, labels on every field, errors announced (`role="alert"`), visible focus, 24px+ touch targets, Escape closing menus and drawers with focus returned, and calm motion under `prefers-reduced-motion`. The browser tests check widths 320 to 1280, small targets and CSP errors.

## Footer and navigation

The platform footer has Explore (Store, Projects, Releases, news and shows, About, Studio), Help (Help, Contact, Security) and Legal (Terms, Privacy, Refunds, Licences); a project's footer links Help and the legal pages too. Account links live in the top bar's account menu, not the footer. Sign-up and checkout link the terms they rely on.

## Not built yet (on purpose)

- `/sell` (explaining selling to creators) and `/status` (live service status): deferred by the owner.
- A stricter script policy on public pages (see Security).
