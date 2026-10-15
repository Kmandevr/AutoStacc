---
title: Creator pages
summary: PLANNED / NOT IMPLEMENTED. Blueprint for customizable project pages: creator HTML/CSS (later JavaScript) isolated in a sandboxed iframe on sandbox.autostacc.com, seamless under /<creator>/<project>.
covers: [server/sites/, functions/[[path]].js, functions/media/sites/, _headers, server/lib/http.js, server/auth/index.js, server/orders/guest.js, server/impersonation/sessions.js]
updated: 2026-10-15
---

# Creator pages (sandboxed customization)

> **PLANNED / NOT IMPLEMENTED.** This note is a design. None of the sandbox exists: no `sandbox.autostacc.com` host or Worker, no iframes, no bridge, no runtime, no sanitizer, no custom HTML/CSS/JS, nothing in `_headers`, `_redirects` or Cloudflare for it (checked 2026-10-09, again 2026-10-15). Only its prerequisites exist, in a different, simpler form: creator accounts and projects in D1, and server-rendered block sites at `/<creator>/<project>[/<page>]` with no creator code at all ([creators](creators.md); [building it later](#building-it-later-order) step 1). Building any part of it is a separate task the owner has to ask for. Decisions behind it: [decisions](decisions.md#2026-10-08-creator-pages-are-sandboxed-planned).

> **Updated 2026-10-08, after this plan:** the owner then chose addresses `/<creator>/<project>[/<page>]` (AutoStacc is the creator `autostacc`, so Glitches & Stitches is at `/autostacc/glitches-and-stitches`), and creator accounts with free, block-only sites now exist ([creators](creators.md)). This note's addresses are updated to match. Its sandbox design remains the plan for creator HTML/CSS and JavaScript: blocks stay the safe default, and custom code would be a further block type or page mode rendered in the sandbox iframe.

> **Superseded for now, 2026-10-15:** the owner chose checked CSS plus a library of trusted interactive pieces written by AutoStacc instead of creator code in a sandbox ([builder](builder.md)). This plan stays as the reference if creator code is ever wanted. Creator pages now load AutoStacc's own runtime script (and nothing a creator wrote); everything else below about today's headers still holds.

**Technically isolated, visually integrated.** A project's page looks like one AutoStacc page at `https://autostacc.com/<creator>/<project>`. The parts a creator designs run in an iframe from `https://sandbox.autostacc.com`, with no access to anything AutoStacc owns. AutoStacc draws everything that matters (navigation, the project's name, products, prices, cart, account, footer, and everything search engines read). The creator draws the look.

Context: [architecture](architecture.md) (Project → Stacclet → Pac → asset), [projects](projects.md) (the project data contract), [modules](modules.md) (drop-in components), [store](store.md#security-model) (the security model this must not weaken), [autostacc](autostacc.md#site-structure) (the project mini-site frame).

## Owner's answers (2026-10-08)

| Question | Answer |
| --- | --- |
| Public address | answered `/projects/<id>` and `/projects/<id>/<page>` at the time; superseded the same day by `/<creator>/<project>` and `/<creator>/<project>/<page>` ([creators](creators.md)) |
| Sandbox host | a subdomain, `sandbox.autostacc.com`; no second domain |
| How much a creator controls | the project's whole content area. AutoStacc keeps the top strip, cart, checkout, account, Your Stacc and the "Sold and delivered by AutoStacc" line |
| More than one page | yes: sub-pages under `/<creator>/<project>/` |
| JavaScript | design for it now; build HTML and CSS only when this is implemented |
| Creator code and signed-in users | yes-or-no answers only (signed in? owns product X?); never identity, email, ids or sessions |
| Components creators can place | all the platform's public modules (products, buy buttons, player, polls, follow, news, shows, newsletter, public asset gallery), always rendered or acted on by AutoStacc |
| Third-party content | only an AutoStacc-curated list of embeds and fonts; no third-party analytics |
| Free vs paid creators | a business decision, still open; [limits](#limits-per-tier-open) lists the technical knobs |
| Moderation | Levels 1–2 publish instantly; Level 3 needs one-time approval of the creator, then publishes instantly; every page has a kill switch |
| Search engines | AutoStacc renders the name, bio, products, releases and structured data in the parent page; the iframe is visual only and `noindex` |
| Glitches & Stitches | moves into the sandbox too, but at a higher trust level (owner-written code) |

## Where it fits today

- Projects are trusted code in git: hand-written pages under `<creator>/<project>`, `css/projects/<id>/skin.css` and `look.css`, all reviewed and deployed with the site. This works for projects AutoStacc runs, but not for creators AutoStacc doesn't know.
- Creator accounts and self-service publishing now exist ([creators](creators.md)): creators and members in D1, Studio projects, and block-based site documents stored in the database and rendered at publish. Custom code would build on those.
- Today's headers forbid framing: `X-Frame-Options: SAMEORIGIN` on every page, and `frame-ancestors 'none'` on store and account pages. Store and account pages keep that forever. Only a project page's shell would frame the sandbox.
- Cookies are already host-only. Better Auth's `gs.*` cookies (the session, and the two-step sign-in cookie when that switch is on), the guest order key (`Path=/api/`) and the impersonation cookie (`SameSite=Strict`) set no `Domain`, so `sandbox.autostacc.com` never receives them. State-changing API calls already require the exact origin (`assertSameOrigin` in `server/lib/http.js`). The design below depends on both staying true.

## 1. User experience

### What the visitor sees

```
┌──────────────────────────────────────────────────────────────┐
│ AutoStacc strip: home · Store · Projects · Your Stacc · cart │  parent (AutoStacc)
├──────────────────────────────────────────────────────────────┤
│ project header: logo, wordmark, its pages, menu              │  parent, wearing the project's look
├──────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ custom section (creator HTML/CSS)                        │ │  iframe: sandbox.autostacc.com
│ └──────────────────────────────────────────────────────────┘ │
│ products grid (AutoStacc module)                             │  parent
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ custom section                                           │ │  iframe
│ └──────────────────────────────────────────────────────────┘ │
│ poll · releases · shows (AutoStacc modules)                  │  parent
├──────────────────────────────────────────────────────────────┤
│ project footer · "Sold and delivered by AutoStacc"           │  parent
└──────────────────────────────────────────────────────────────┘
```

A creator page is an ordered list of **sections**. A section is either a **platform module** (AutoStacc renders it natively in the parent, as the [modules](modules.md) do today) or a **custom section** (creator HTML/CSS, one iframe each). The store, prices and buttons that spend money are never inside creator code. Custom sections can also hold inline **component placeholders** (`<autostacc-product id="…">`); the sandbox runtime draws those from public data, and their actions go to the parent ([§4](#4-controlled-communication)).

The header and footer belong to the parent but take the project's look. A creator sets this look in their page settings: colours, fonts from the curated list, logo, wordmark. AutoStacc stores it as **design tokens**, not as CSS, and applies them to the parent's own markup, the way `look.css` and `.skin-<id>` work today. Tokens are values (colour codes, a font name from the list, sizes in a range), so they can't carry code. The same tokens go to every custom section, so the header, the modules and the creator's HTML match.

### Not "a website in a box"

- **No frame chrome.** No border, no scrollbars of its own (the parent page scrolls), a transparent background, full width of the content column.
- **Automatic height.** AutoStacc's runtime inside the frame watches the document (`ResizeObserver`) and reports its height. The parent sets the iframe height, capped (e.g. 20 000 px per section) and limited to a few updates a second. The last published height is stored with the page, so the parent reserves that space before the frame loads and the layout doesn't jump.
- **Loading.** The parent page is complete without the frames: the project's name, bio and modules are in the HTML. Each custom section shows a quiet placeholder at its reserved height in the project's background colour and fades in when the runtime says `ready`. Sections near the top load immediately; ones further down use `loading="lazy"`.
- **Responsive.** The frame is as wide as the content column, so the creator's media queries respond to the section's width. On phones that is the phone width, and it behaves like container queries. The runtime adds the viewport meta tag; creators write ordinary responsive CSS.
- **Theme and motion.** The parent passes `theme: light|dark`, so a creator can style both. `prefers-reduced-motion` works inside the frame without help.
- **Links and navigation.** The frame can't navigate itself or the top page. The runtime catches clicks on links and sends them to the parent:
  - a project page (`/<creator>/<project>/tour`) → a normal page load in the parent (the site has no single-page app, and cross-document view transitions already smooth page changes);
  - another AutoStacc page (`/shop?project=<id>`, a product) → the same;
  - an outside link → only `https:`, and an AutoStacc interstitial ("You're leaving AutoStacc for example.com") in the parent, opened in a new tab with `noopener`;
  - an anchor in the same section → the parent scrolls the page to that point.
- **Keyboard and screen readers.** Each iframe has a `title` (the section's name). Tab order flows into and out of it naturally. Focus outlines and skip links stay with the parent.
- **The URL never changes.** The visitor is always on `autostacc.com/<creator>/<project>/…`. The sandbox address appears only in the iframe's `src`.

### Errors

If a custom section doesn't say `ready` within a few seconds, reports an error, or its frame dies (the parent no longer hears its heartbeat), the parent swaps in the section's **fallback**. That's plain text and images saved with the page at publish, or simply removing the section. The platform modules and the store are in the parent, so they keep working whatever the creator's code does. A creator whose page has been disabled ([§8](#8-abuse)) gets the default project page, generated from their data.

## 2. Security model

### The boundary, in layers

No single layer is trusted alone; each assumes the one before it failed.

1. **Different origin.** Creator content is served only from `https://sandbox.autostacc.com`, never from `autostacc.com`. The same-origin policy then hides the parent's DOM, JavaScript state, `localStorage` and API responses from it.
2. **Opaque origin on top.** Every creator frame is `<iframe sandbox="allow-scripts">` with no `allow-same-origin`. The sandbox host also sends the same restriction as a header (`Content-Security-Policy: sandbox allow-scripts`), so the document stays sandboxed even when someone opens the sandbox URL directly. The frame then runs in a unique, opaque origin (`null`):
   - it can't read or set cookies or use storage, even for `sandbox.autostacc.com`;
   - its requests are cross-site to everything, so no `SameSite` cookie is ever attached;
   - any `fetch` sends `Origin: null`, which `assertSameOrigin` refuses;
   - two creator frames, even from the same creator, can't reach each other.

   Without `allow-top-navigation`, `allow-popups`, `allow-forms`, `allow-modals` and `allow-downloads`, it can't redirect the page, open windows, submit forms, show dialogs or start downloads. This layer is what makes a subdomain safe enough without a second domain (see [trade-offs](#trade-offs-of-a-subdomain)).
3. **Content Security Policy on the sandbox document.** It's generated per page at publish:
   - `default-src 'none'`;
   - `script-src` lists only AutoStacc's runtime, by hash (Level 3 adds the creator's own published bundle, by hash);
   - `style-src` and `font-src` allow the published stylesheet and the curated fonts;
   - `img-src` and `media-src` allow only this project's public asset path (`https://sandbox.autostacc.com/a/<project-id>/`);
   - `connect-src 'none'`, `form-action 'none'`, `base-uri 'none'`, `object-src 'none'`;
   - `frame-src` allows only curated embeds (YouTube, Deezer and others on the list);
   - `frame-ancestors https://autostacc.com`, so nobody else can frame a creator page to phish with it.
4. **Sanitizing at publish (Level 2).** Creator HTML is parsed and rewritten through an allowlist of elements and attributes. Scripts, inline event handlers, `javascript:` and `data:` URLs (except images), `<form>`, `<input>`, `<object>`, `<embed>`, `<base>`, `<meta http-equiv>`, `<link>`, SVG scripting and external `url()` in CSS are dropped. Sanitizing happens once, at publish, and its output is what gets served. **Sanitizing is a layer, not the boundary.** A sanitizer bug lets through only what the frame's sandbox and CSP still forbid.
5. **Parent-side checks.** The parent trusts nothing the frame says. Each message is checked against its schema and rate limit, and every action that matters is re-checked on the server as it is today. The server prices the cart and checks ownership against `entitlements`.
6. **The sandbox host has no keys.** It's a separate Worker (or Pages project) with no D1, no `FILES` bucket and no secrets. Its only binding is a read-only bucket of *published* creator pages and *public* assets. Even remote code execution in that Worker reaches only data that is already public.

### The terms, briefly

| Mechanism | What it gives | What it doesn't |
| --- | --- | --- |
| **Same-origin** content (creator HTML on `autostacc.com`) | nothing: it would run with full access to sessions, the DOM and the API | never allowed |
| **Cross-origin** (`sandbox.autostacc.com`) | separate DOM, storage, JS heap; can't read our responses | still *same-site*: a cookie set with `Domain=autostacc.com` would reach it, and `SameSite` doesn't separate subdomains |
| **iframe `sandbox`** without `allow-same-origin` | opaque origin: no cookies, no storage, cross-site to everything, no top navigation, popups, forms or downloads | doesn't limit network or CPU; CSP and limits do |
| **CSP** | what the document may load, run, connect to and who may frame it | not a substitute for isolation; a policy with a hole is still a hole |
| **Sanitization** | strips dangerous markup before it is stored | bypasses are found regularly; never the only layer |
| **Controlled communication** | a small, versioned list of requests the parent chooses to honour | never a general API proxy |
| **Signed / controlled asset URLs** | only published, public, same-project files are reachable | never storage keys or the private bucket |

### What creator code never gets

AutoStacc cookies or sessions; the parent DOM or its state; any `/api/*` call made with the visitor's session; database or storage credentials; admin, Control Center or impersonation functions; another creator's assets or pages; any customer's identity, email, orders or library; private (paid) files.

### Trade-offs of a subdomain

The owner chose not to buy a second domain. With the opaque-origin sandbox that is sound, as long as these rules hold (each later becomes a test):

- **No cookie on `autostacc.com` ever sets `Domain=`.** If it did, the cookie would reach the sandbox host. When this is built, rename the session cookie to the `__Host-` prefix, which browsers refuse to scope to subdomains.
- **The sandbox host never sets cookies** and never answers `/api/*`.
- **`assertSameOrigin` stays an exact-origin check**, never "same site", and every new state-changing route uses it.
- **`document.domain` is never used**; `Origin-Agent-Cluster: ?1` on both hosts.
- **Nothing on `autostacc.com` trusts `*.autostacc.com`** (CORS, CSP, postMessage checks).

What a second domain would still add: browsers put different sites in different processes. A subdomain shares the site `autostacc.com`, so on some browsers (notably phones) a creator frame may share a process and main thread with the parent. Level 2 has no creator JavaScript, so this only matters for Level 3: an infinite loop there could freeze the tab. That is the main reason Level 3 is gated by trust ([§5](#5-levels-of-customization)). Revisit the second domain if Level 3 opens widely.

## 3. Creator assets (AutoStacc Library)

Creators upload files to their library (images, artwork, audio, video, project files). Each file is **private** by default. A creator can mark a file **public for pages**; paid product files (`product_files` in the private `FILES` bucket) can never be marked public.

- **References, not URLs.** Creator HTML names assets as `asset:<asset-id>` (or picks them in the editor). At publish, each reference is checked: the asset exists, belongs to this project, and is public. It is then rewritten to an immutable URL such as `https://sandbox.autostacc.com/a/<project-id>/<asset-id>-<content-hash>.<ext>`. A reference to another project's asset, a private file or a paid file fails the publish with a clear message.
- **Copy, don't share.** Publishing copies the public file into a separate public-pages bucket (as preview clips go to `PREVIEWS` today). The sandbox host never reads `FILES`, so no bug in it can serve a paid file.
- **Scoped by CSP too.** The page's `img-src` and `media-src` list only its own project's path, so a hand-typed URL to another project's asset doesn't load either.
- **Served safely:** correct `Content-Type`, `nosniff`, `Content-Disposition: inline` for media and `attachment` for anything else, no HTML or SVG served as a document from the asset path (SVG is rasterised or served as `image/svg+xml` with a `sandbox` CSP), size limits per type.
- **Unpublishing** removes the public copy. Immutable URLs mean a replaced image is a new URL, so caches never serve the wrong file.
- **Owned content** (a paid preset, a full track) is never loaded by the frame. If a creator wants an "owners only" section, the parent decides which variant to show (below) and delivers files through the existing signed-download flow in its own UI.

## 4. Controlled communication

### Channel

1. The parent creates the iframe and a `MessageChannel`.
2. On the frame's `load`, the parent posts one handshake to `iframe.contentWindow`, with target origin `*` because the frame's origin is `null`, and transfers one port.
3. After that, both sides talk only on that port. Nothing else on the page can inject messages into it, and the parent ignores every `window` message whose `source` isn't that iframe's window.
4. The handshake and later messages from the parent carry **only public data**, because the parent can't verify who is listening on the other side of `*`.

Messages are `{ v: 1, id, type, payload }`. Every `type` is on a fixed list with a schema; anything else is dropped and counted. The rate is limited per frame, and a frame that floods is cut off (fallback shown).

### Frame → parent (requests)

| Type | Effect | Guard |
| --- | --- | --- |
| `ready`, `heartbeat`, `error` | lifecycle | |
| `resize {height}` | sets the frame height | capped, limited to a few per second |
| `navigate {path}` | parent loads that AutoStacc page | `path` must be a root-relative AutoStacc path; parsed, never concatenated |
| `openExternal {url}` | interstitial, then new tab | `https:` only, blocklist, shown to the visitor before leaving |
| `scrollTo {y}` | parent scrolls to section top + y | clamped to the section |
| `addToCart {productId}` | parent adds it and opens the cart drawer | product must belong to this project; the cart is priced by the server as always |
| `showProduct {productId}` | parent opens the product (page or panel) | same project |
| `follow {projectId}` | parent shows its own follow / Auto-Stacc control | this project only; the visitor confirms in parent UI |
| `query {kind}` | yes/no answer (below) | |

The parent never accepts requests to check out, sign in or out, change settings, download files, read the library, call `/api/*` or run code. Anything that changes the visitor's account state happens in parent UI the visitor clicks.

### Parent → frame (data)

- At handshake: the theme (light or dark), the page's design tokens, the frame's width, the public data its component placeholders need (product title, artwork, the catalog price and live sale price, release info). That data comes from the same public endpoints any visitor can read.
- **Yes/no answers** (owner's rule): `signedIn: true|false`, `owns(<productId>): true|false` (for this project's products only), `follows: true|false`. Never a name, email, id, token or count. The parent answers only for frames whose CSP has `connect-src 'none'` and no outside embeds, so the answer can't be sent anywhere.
- **Better: let the parent choose.** For "owners see this, others see that", the creator publishes two variants and the parent loads one. The frame never learns which visitor it has. This is the default; `query` exists for small touches ("Thanks for buying").

### Component placeholders

`<autostacc-product>`, `<autostacc-buy>`, `<autostacc-player>`, `<autostacc-follow>`, `<autostacc-poll>`, `<autostacc-news>`, `<autostacc-shows>`, `<autostacc-newsletter>`, `<autostacc-gallery>`. Inside a frame, the runtime draws read-only versions from the public data above and turns clicks into the requests in the table. Anything with a form or an account (the newsletter signup, voting in a poll, following) opens the parent's real component; the frame never collects input. Placed as sections, the same components are simply the parent's modules.

## 5. Levels of customization

| | Level 1: AutoStacc components | Level 2: custom HTML/CSS | Level 3: custom JavaScript |
| --- | --- | --- | --- |
| What the creator does | arranges sections, picks modules, sets design tokens | writes sections in HTML and CSS, uses placeholders and public assets | adds a script bundle to a section |
| Where it runs | parent only, no iframe | sandbox frame; only AutoStacc's runtime script runs | sandbox frame; creator script allowed by hash |
| Publishing | instant | instant, after sanitizing | instant, once the creator is approved; scanned each publish |
| Status | design | **first to build** (owner, 2026-10-08) | designed, not to be built yet |
| Advantages | fastest, accessible, SEO-perfect, zero code risk | real visual freedom; no script from the creator at all | animations, visualisers, interactive art, games |
| Risks | low: token values validated | sanitizer bypass (contained by sandbox and CSP), phishing look-alikes, heavy pages, offensive content | everything in §8; CPU and memory abuse; fingerprinting; phishing UI; exfiltration if any network is allowed |
| Limits | only what modules offer | no forms, no network, no outside CSS or fonts beyond the list | no network (`connect-src 'none'`) except a curated list later; size, CPU and memory budgets; no storage; kill switch |

Each level contains the one below. Level 1 needs no sandbox and is how most creators should start.

### Trust levels

Separate from the level a page uses, each project has a **trust level** that only AutoStacc admins set. A creator can never set it themselves.

| Trust | Who | What it relaxes |
| --- | --- | --- |
| `standard` | new creators | defaults above |
| `verified` | approved creators | may publish Level 3; larger budgets |
| `first-party` | projects AutoStacc runs (Glitches & Stitches, owner-written) | Level 3 without scanning delays; larger budgets; the project's UI sounds and easter eggs as Level 3 scripts; a wider curated embed list; may keep its existing skin as the header/footer look |

**Trust relaxes the rules, never the boundary.** A first-party page still runs in the opaque-origin sandbox with no cookies, no API and only bridge requests. That way a mistake in owner-written code, a compromised editor account or a copied snippet can't reach customers' sessions either. Glitches & Stitches' current hand-written pages stay as they are until this is built. Moving them is then a migration: the terminal skin becomes design tokens plus custom sections, and sounds and effects become a first-party Level 3 bundle.

## 6. Creator URLs and routing

Addresses are `https://autostacc.com/<creator>/<project>` and `/<creator>/<project>/<page>`. Generated release and news pages are `/<creator>/<project>/music/<release>` and `/news/<post>`.

```
GET autostacc.com/<creator>/<project>/<page>
  └─ static file exists?            → served as today (first-party pages, generated release/news pages)
  └─ else Pages Function            → look up published page (project, page) in D1
       → render the shell: AutoStacc frame + project header/footer (tokens)
         + platform modules + SEO head + <iframe src="https://sandbox.autostacc.com/p/<id>/<page>/<version>/<section>">
       → cache at the edge; purge that address on publish
GET sandbox.autostacc.com/p/<id>/<page>/<version>/<section>
  └─ sandbox Worker → published section from the pages bucket, with its CSP; immutable, cached forever
```

- **Reserved page names** under a project: `music`, `news`, `press`, and any future platform-generated path, so a custom page never hides a generated page. Page names are lowercase-hyphenated, like ids.
- **Versioned frame URLs.** Publishing writes a new version and updates one pointer. The parent shell references the current version, so a visitor never mixes old and new sections, and rollback is moving the pointer back.
- **The sandbox host isn't a website.** `/` and unknown paths answer 404. Every response is `X-Robots-Tag: noindex`, `frame-ancestors https://autostacc.com`. Someone who opens a section URL directly sees an unstyled, sandboxed fragment that can do nothing.
- **Search:** title, description, canonical (`/<creator>/<project>/<page>`), Open Graph and JSON-LD come from the project's data, as `scripts/build.js` does today, and the name, bio, products and releases are real HTML in the parent. Custom sections add nothing search engines need.

## 7. Scaling

- **One of everything:** one sandbox Worker for every creator, one route for every project page, one pages bucket, one public-assets bucket. No server, domain, deployment, certificate or DNS record per creator. `sandbox.autostacc.com` is one hostname, and per-creator separation comes from opaque origins and per-path CSP, not subdomains.
- **Work at publish, not per request.** Sanitizing, asset rewriting, CSP generation, hashing and fallback snapshots happen once, when a creator publishes. Requests serve stored output.
- **Cacheable.** Frame URLs are immutable (cache forever). Parent shells are the same for every visitor (personal parts such as the cart count, sign-in state and live prices load from the API in the browser, as today), so they cache at the edge and are purged by address on publish.
- **Hybrid build.** First-party projects can keep build-time generation from `data/`. Database-driven projects are rendered by the function above. The sitemap becomes a sitemap index with database-generated chunks when there are many projects.
- **Limits** keep any one creator's cost bounded: pages per project, sections per page, HTML/CSS/JS sizes, asset storage and bandwidth.

## 8. Abuse

| Attack | Defence |
| --- | --- |
| **XSS against AutoStacc** | creator markup never renders on `autostacc.com`; parent never inserts frame data as HTML (text and attributes only, schema-checked) |
| **Cookie or session theft** | host-only cookies; opaque origin gets no cookies and no storage; sandbox host sets none |
| **iframe escape** (top navigation, popups, `window.parent` tricks, `document.domain`) | no `allow-top-navigation`, `allow-popups` or `allow-same-origin`; cross-origin access to `parent` throws; `Origin-Agent-Cluster`; no `document.domain` |
| **Unauthorised API calls** | `connect-src 'none'`; any request carries `Origin: null` and no cookies; exact-origin check; the API sends no CORS headers |
| **Another creator's assets** | publish-time ownership check; per-project CSP path; private and paid files never in the public bucket |
| **Customer data** | the frame only ever gets public data and yes/no answers, only when it has no network |
| **Malicious downloads** | no `allow-downloads`; asset types and sizes checked; non-media served as `attachment`; executables refused at upload |
| **Phishing** (fake login form, fake checkout) | no forms or inputs; sign-in and checkout only in parent UI; outside links go through the interstitial; reports and takedown |
| **Resource abuse** (huge pages, CPU loops, memory) | size budgets at publish; lazy frames; Level 3 only for approved creators; heartbeat watchdog swaps in the fallback when it can; per-creator bandwidth limits on the asset host |
| **Malicious JavaScript** (Level 3) | everything above, plus scanning at publish, one-time creator approval, no network, hashed bundles (no runtime `eval`ed loads from elsewhere), kill switch |
| **Clickjacking AutoStacc** | store and account pages keep `frame-ancestors 'none'`; only project shells allow the sandbox as a child, and the sandbox only allows `autostacc.com` as a parent |
| **Offensive or infringing content** | report button on every project page; admins can disable a page, a section or a creator's customization (one switch each), audited like other admin actions ([control center](admin.md)) |

**If a creator page breaks or is disabled:** the parent shows section fallbacks or the default project page. The store, cart, checkout, Your Stacc and every other project are unaffected, because none of them load creator code.

## 9. Future compatibility

The sandbox is a **leaf**: AutoStacc calls into it, and it never calls into AutoStacc except through the bridge's fixed list. That keeps the core (accounts, store, entitlements, downloads, Your Stacc, admin) independent of creator code as the platform grows:

- **Storefronts, products, music, samples, presets:** stay data in the catalog, rendered by AutoStacc modules; creators decorate around them.
- **Projects and libraries:** creator asset libraries are the same asset model as Your Stacc, with a `public for pages` flag.
- **Social integrations:** new embeds join the curated list (`frame-src`), one at a time, after review.
- **Analytics:** AutoStacc's own anonymous counters per page and section, reported to the creator; no third-party trackers in frames.
- **Customer relationships:** stay in the parent (follows, Auto-Stacc, newsletters, messages). Creators see aggregates, never customer data through their page code.
- **New bridge features:** added by bumping the message version, each with its own schema, guard and tests. Unknown versions are refused.

## Limits per tier (open)

How these map to free and paid creators is a business decision the owner hasn't made. The technical knobs are: highest level allowed (1/2/3), number of pages, sections per page, HTML/CSS/JS size, asset storage and bandwidth, curated embed list (basic or wide), custom fonts, and priority for Level 3 approval.

## Building it later (order)

1. Creator accounts tied to projects, and page data in D1 (prerequisites, not designed here). **Done** (2026-10-08) as the Studio: `creators`, `creator_members`, `project_sites`, `site_pages` and `site_assets` (uploaded images) in D1, rendered at publish by `server/sites/` and served by `functions/[[path]].js` with edge caching. Its block document is a simpler cousin of Level 1 (preset, accent and font instead of design tokens; no platform modules such as polls or follow, no first-party projects).
2. Level 1: sections, design tokens, the shell route, edge caching.
3. Cookie hardening (`__Host-` prefix), header changes for project shells only, tests for the rules in [trade-offs](#trade-offs-of-a-subdomain).
4. The sandbox Worker, the runtime, the bridge (resize, navigate, ready, error) and fallbacks.
5. Level 2: sanitizer, public assets, component placeholders, cart and follow requests, yes/no answers.
6. Moderation: reports, kill switches, audit entries.
7. Migrate Glitches & Stitches as the first `first-party` project.
8. Level 3, only when the owner asks.

Each step gets security tests that attack it, in the same style as the store's (`test/api/`, `test/browser/`): frames that try to read cookies, call the API, navigate the top page, load another project's asset, flood the bridge or claim to be another frame.
