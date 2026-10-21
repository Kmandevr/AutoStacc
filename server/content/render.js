// Whole HTML documents for a project's release and news pages (/<creator>/<project>/music/<slug>, /news/<slug>), the
// same for every creator, first-party included: title "<title> · <project> · AutoStacc", canonical (trusted creators
// only, else noindex), Open Graph (music.album / article) and JSON-LD (WebPage + BreadcrumbList, MusicAlbum /
// NewsArticle), as scripts/lib/pages.js wrote them when they were static. Only AutoStacc's own scripts and styles; a
// project's look (projects.look: skin, sounds) adds its skin stylesheet and sounds. Every value is escaped; news text
// is the safe-text markup (server/sites/text.js), embeds come only from server/sites/embeds.js.
import { esc } from "../sites/text.js";
import { EMBED_HOSTS, embedFor } from "../sites/embeds.js";

const SITE_NAME = "AutoStacc";
// The share picture and logo for pages without their own artwork (data/site.js image and logo).
const SITE_IMAGE = { src: "/img/og.png", width: 1200, height: 630, alt: "The AutoStacc logo, four stacked colour blocks, beside the AutoStacc wordmark" };
const SITE_LOGO = "/img/apple-touch-icon.png";
const FONTS = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700";
const RELEASE_TYPES = { Single: "SingleRelease", EP: "EPRelease", Album: "AlbumRelease" };
const SAFE_ID = /^[a-z0-9-]{1,60}$/;
const DURATION = /^(\d{1,3}):([0-5]\d)$/;

// The same policy idea as the static pages, tightened: this site's scripts only, frames only from the embed players.
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "media-src 'self'",
  `frame-src ${EMBED_HOSTS.join(" ")}`,
  "connect-src 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'self'"
].join("; ");

// _headers doesn't reach Function responses, so the page's own headers say what the static pages' did.
export const pageHeaders = () => ({
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": CSP,
  "Strict-Transport-Security": "max-age=31536000",
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cache-Control": "public, max-age=60, s-maxage=60"
});

const fmtDate = (s) => {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
};
// Search descriptions read best under ~160 characters; cut at a word boundary.
export const clip = (s, n = 160) => {
  s = String(s || "").replace(/\s+/g, " ").trim();
  if (s.length <= n) return s;
  const cut = s.lastIndexOf(" ", n - 1);
  return s.slice(0, cut > 0 ? cut : n - 1).replace(/[,.;:]$/, "") + "…";
};
const isoDuration = (d) => {
  const m = DURATION.exec(String(d || ""));
  return m ? `PT${Number(m[1])}M${Number(m[2])}S` : null;
};
const isHttps = (u) => typeof u === "string" && /^https:\/\/[^/\s]+\.[^/\s]+/.test(u);
// Only root-relative addresses on this site (artwork, project images); anything else is dropped.
const local = (src) => {
  const s = String(src || "");
  if (/^\/(?!\/)[^\s"'<>\\]*$/.test(s)) return s;
  if (/^[A-Za-z0-9_][^\s"'<>\\:]*$/.test(s)) return "/" + s;
  return null;
};
const abs = (siteUrl, p) => siteUrl + p;

// ---------- schema.org ----------
const orgRef = (siteUrl) => ({ "@type": "Organization", "@id": siteUrl + "/#organization", name: SITE_NAME, url: siteUrl + "/", logo: siteUrl + SITE_LOGO });
const projectRef = (siteUrl, ctx, type) => ({ "@type": type, "@id": abs(siteUrl, ctx.home) + "#project", name: ctx.project.name, url: abs(siteUrl, ctx.home) });
const breadcrumbs = (siteUrl, crumbs) => ({
  "@type": "BreadcrumbList",
  itemListElement: crumbs.map(([name, p], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(siteUrl, p) }))
});
const webPage = (siteUrl, { path, title, description }, main, crumbs) => ({
  "@type": "WebPage",
  "@id": abs(siteUrl, path) + "#webpage",
  url: abs(siteUrl, path),
  name: title,
  description,
  inLanguage: "en",
  isPartOf: { "@id": siteUrl + "/#website" },
  mainEntity: { "@id": main },
  breadcrumb: breadcrumbs(siteUrl, crumbs)
});

// ---------- head ----------
function head(siteUrl, page) {
  const image = page.image || SITE_IMAGE;
  const url = abs(siteUrl, page.path);
  const lines = [];
  const meta = (attr, key, value) => lines.push(`<meta ${attr}="${key}" content="${esc(value)}">`);
  lines.push(`<title>${esc(page.title)}</title>`);
  meta("name", "description", page.description);
  if (page.index) lines.push(`<link rel="canonical" href="${esc(url)}">`);
  else meta("name", "robots", "noindex, follow");
  meta("property", "og:site_name", SITE_NAME);
  meta("property", "og:locale", "en_US");
  meta("property", "og:type", page.ogType);
  meta("property", "og:title", page.title);
  meta("property", "og:description", page.description);
  meta("property", "og:url", url);
  meta("property", "og:image", abs(siteUrl, image.src));
  if (image.width) meta("property", "og:image:width", image.width);
  if (image.height) meta("property", "og:image:height", image.height);
  if (image.alt) meta("property", "og:image:alt", image.alt);
  for (const [k, v] of Object.entries(page.og || {})) meta("property", k, v);
  meta("name", "twitter:card", "summary_large_image");
  meta("name", "twitter:title", page.title);
  meta("name", "twitter:description", page.description);
  meta("name", "twitter:image", abs(siteUrl, image.src));
  if (image.alt) meta("name", "twitter:image:alt", image.alt);
  // "<" is escaped so text from the content can never close the script tag.
  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": page.schema }).replace(/</g, "\\u003c");
  lines.push(`<script type="application/ld+json">${json}</script>`);
  return lines.join("\n  ");
}

// ---------- page frame ----------
// ctx: { creator, project, home, look: { skin, sounds }, frame: true for a project in data/projects.js (first-party:
// js/project-frame.js draws its header), lists: { music, news } = its list pages exist }.
function shell(siteUrl, ctx, { page, section, styles, main }) {
  const id = SAFE_ID.test(ctx.project.id) ? ctx.project.id : "";
  const skin = Boolean(id && ctx.look.skin);
  const sounds = Boolean(id && ctx.look.sounds);
  const css = ["core", "platform", "layout", ...(ctx.frame ? ["project-frame"] : []), ...styles, ...(skin ? [`projects/${id}/skin`] : []), ...(sounds ? ["eggs"] : [])];
  const js = ["data/site.js", "data/projects.js", "js/util.js", ctx.frame ? "js/project-frame.js" : "js/layout.js", "js/account-nav.js", "js/site-notice.js",
    ...(sounds ? ["js/sound.js", "js/eggs.js", "js/terminal.js"] : []), "js/motion.js"];
  const projectAttrs = ctx.frame && id ? ` data-project="${esc(id)}" data-project-page="${esc(section)}"` : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${head(siteUrl, page)}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${FONTS}${skin ? "&amp;family=VT323" : ""}&amp;display=swap" rel="stylesheet">
  <link rel="icon" href="/img/favicon.png" type="image/png">
  <link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
  <meta name="theme-color" content="#111318">
  <meta name="color-scheme" content="light dark">
  <script src="/js/theme.js"></script>
${css.map((s) => `  <link rel="stylesheet" href="/css/${s}.css">`).join("\n")}
</head>
<body data-page="${section}-item" data-section="${section}"${projectAttrs}>
  <header id="site-header"></header>

  <main id="main" class="${skin ? `skin-${esc(id)}` : "platform"}">
${main}
  </main>

  <footer id="site-footer"></footer>

${js.map((s) => `  <script src="/${s}"></script>`).join("\n")}
</body>
</html>
`;
}

function crumbNav(crumbs) {
  const items = crumbs.map(([name, p], i) =>
    i === crumbs.length - 1 ? `<li aria-current="page">${esc(name)}</li>` : `<li><a href="${esc(p)}">${esc(name)}</a></li>`);
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items.join("")}</ol></nav>`;
}

function hero(crumbs, kicker, title, sub) {
  return `    <div class="page-hero detail-hero">
      <div class="wrap">
        ${crumbNav(crumbs)}
        <p class="detail-kicker">${kicker}</p>
        <h1 class="glitch" data-text="${esc(title)}">${esc(title)}</h1>
        ${sub ? `<p>${sub}</p>` : ""}
      </div>
    </div>`;
}

// Artwork as stored: { src (root-relative), width, height, alt, srcset?: [{ src, width, type }] }.
function picture(img, sizes, eager) {
  const src = local(img.src);
  if (!src) return "";
  const set = (type) => (Array.isArray(img.srcset) ? img.srcset : []).filter((s) => s && s.type === type && local(s.src) && Number(s.width) > 0)
    .map((s) => `${local(s.src)} ${Number(s.width)}w`).join(", ");
  const webp = set("image/webp"), jpeg = set("image/jpeg");
  const size = Number(img.width) > 0 && Number(img.height) > 0 ? ` width="${Number(img.width)}" height="${Number(img.height)}"` : "";
  return `<picture>${webp ? `<source type="image/webp" srcset="${esc(webp)}" sizes="${sizes}">` : ""}<img src="${esc(src)}"${jpeg ? ` srcset="${esc(jpeg)}" sizes="${sizes}"` : ""}${size} alt="${esc(img.alt || "")}" decoding="async"${eager ? ' fetchpriority="high"' : ' loading="lazy"'}></picture>`;
}
const ogImage = (img) => (img && local(img.src) ? { src: local(img.src), width: Number(img.width) || null, height: Number(img.height) || null, alt: img.alt || "" } : null);

const crumbsFor = (ctx, list, item) => [["Home", "/"], [ctx.creator.name, `/${ctx.creator.slug}`], [ctx.project.name, ctx.home],
  ...(ctx.lists[list] ? [[list === "music" ? "Music" : "News", `${ctx.home}/${list}`]] : []), item];
const byline = (ctx) => `by <a href="${esc(ctx.home)}">${esc(ctx.project.name)}</a>`;
const releasePath = (ctx, slug) => `${ctx.home}/music/${slug}`;
const newsPath = (ctx, slug) => `${ctx.home}/news/${slug}`;
const artistType = (ctx) => (ctx.look.entity && /^[A-Za-z]{1,40}$/.test(ctx.look.entity) ? ctx.look.entity : "MusicGroup");

// A player for a share link, or for a player address embeds.js already made (content.js hands those out); never a
// frame from anywhere else (the CSP allows only EMBED_HOSTS).
function frameOf(raw) {
  const made = embedFor(raw);
  if (made) return made;
  let u;
  try { u = new URL(String(raw || "")); } catch { return null; }
  return u.protocol === "https:" && !u.username && !u.password && !u.port && EMBED_HOSTS.includes(u.origin)
    ? { src: u.href, ratio: /youtube/.test(u.hostname) ? "16 / 9" : null } : null;
}

// The embedded player: the release's main link, else its backup, only through the known players.
function player(r, artist) {
  const e = frameOf(r.embedUrl) || frameOf(r.fallbackEmbedUrl);
  if (!e) return `<div class="player-empty"><span>&gt; awaiting signal</span><span class="cursor">no player yet</span></div>`;
  return `<div class="listen-player"><iframe class="player${e.ratio ? " tall" : ""}" src="${esc(e.src)}" title="${esc(`${r.title} by ${artist}`)}" loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe></div>`;
}

// ---------- release ----------
// r: { slug, title, type, date, upc, description, artwork, tracks, credits, embedUrl, fallbackEmbedUrl, links }
// news: the project's published posts about it ({ slug, title, tag, date }).
export function renderRelease(siteUrl, ctx, r, news = []) {
  const path = releasePath(ctx, r.slug);
  const url = abs(siteUrl, path);
  const type = RELEASE_TYPES[r.type] ? r.type : "Album";
  const crumbs = crumbsFor(ctx, "music", [r.title, path]);
  const title = `${r.title} (${type.toLowerCase()}) · ${ctx.project.name} · ${SITE_NAME}`;
  const description = clip(r.description || `${r.title}, a ${type.toLowerCase()} by ${ctx.project.name}, released ${fmtDate(r.date)}.`);
  const links = (r.links || []).filter((l) => l && l.name && isHttps(l.url));
  const tracks = (r.tracks || []).filter((t) => t && t.title);
  const credits = (r.credits || []).filter((c) => c && c.role && c.name);
  const total = tracks.reduce((t, x) => { const m = DURATION.exec(String(x.duration || "")); return t + (m ? Number(m[1]) * 60 + Number(m[2]) : 0); }, 0);
  const length = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  const artist = projectRef(siteUrl, ctx, artistType(ctx));
  const image = ogImage(r.artwork);
  const page = {
    path, title, description,
    index: ctx.index,
    ogType: "music.album",
    image,
    og: { "music:musician": abs(siteUrl, ctx.home), "music:release_date": r.date },
    schema: [
      webPage(siteUrl, { path, title, description }, url + "#release", crumbs),
      {
        "@type": "MusicAlbum",
        "@id": url + "#release",
        name: r.title,
        url,
        description,
        albumReleaseType: "https://schema.org/" + RELEASE_TYPES[type],
        byArtist: artist,
        datePublished: r.date,
        ...(image && { image: abs(siteUrl, image.src) }),
        numTracks: tracks.length,
        track: {
          "@type": "ItemList",
          numberOfItems: tracks.length,
          itemListElement: tracks.map((t, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: { "@type": "MusicRecording", name: t.title, byArtist: artist, ...(isoDuration(t.duration) && { duration: isoDuration(t.duration) }), ...(t.isrc && { isrcCode: t.isrc }) }
          }))
        },
        ...(links.length && { sameAs: links.map((l) => l.url) })
      }
    ]
  };
  const main = `${hero(crumbs, `${esc(type)} · ${esc(String(r.date).slice(0, 4))}`, r.title, byline(ctx))}

    <section>
      <div class="wrap release">
        ${r.artwork && local(r.artwork.src) ? `<figure class="release-art">${picture(r.artwork, "(max-width: 860px) 100vw, 480px", true)}</figure>` : ""}
        <div class="release-info">
          <p class="lede">${esc(r.description || description)}</p>
          <dl class="facts">
            <dt>Artist</dt><dd><a href="${esc(ctx.home)}">${esc(ctx.project.name)}</a></dd>
            <dt>Release</dt><dd>${esc(type)}</dd>
            <dt>Released</dt><dd><time datetime="${esc(r.date)}">${fmtDate(r.date)}</time></dd>
            <dt>Length</dt><dd>${tracks.length} track${tracks.length === 1 ? "" : "s"}, ${length}</dd>
            ${r.upc ? `<dt>UPC</dt><dd>${esc(r.upc)}</dd>` : ""}
          </dl>
          ${links.length ? `<p class="platforms-label">Stream ${esc(r.title)} on</p>
          <div class="platforms">${links.map((l) => `<a class="btn ghost" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a>`).join("")}</div>` : ""}
        </div>
      </div>
    </section>

    <section class="alt">
      <div class="wrap">
        <div class="section-head"><h2>Listen</h2></div>
        ${player(r, ctx.project.name)}
      </div>
    </section>

    <section>
      <div class="wrap">
        <div class="section-head"><h2>Tracklist</h2></div>
        <ol class="tracklist">
          ${tracks.map((t) => `<li><span class="track-title">${esc(t.title)}</span>${isoDuration(t.duration) ? `<time datetime="${isoDuration(t.duration)}">${esc(t.duration)}</time>` : ""}${t.isrc ? `<span class="isrc">ISRC ${esc(t.isrc)}</span>` : ""}</li>`).join("\n          ")}
        </ol>
        ${credits.length ? `<h2 class="sub-head">Credits</h2>
        <dl class="facts">${credits.map((c) => `<dt>${esc(c.role)}</dt><dd>${esc(c.name)}</dd>`).join("")}</dl>` : ""}
      </div>
    </section>
${news.length ? `
    <section>
      <div class="wrap">
        <div class="section-head"><h2>News</h2>${ctx.lists.news ? `<a href="${esc(ctx.home)}/news">All updates &rarr;</a>` : ""}</div>
        <ul class="tiles">${news.map((n) => `<li><a class="tile" href="${esc(newsPath(ctx, n.slug))}"><span class="tag">${esc(n.tag || "Update")}</span><strong>${esc(n.title)}</strong><time datetime="${esc(n.date)}">${fmtDate(n.date)}</time></a></li>`).join("")}</ul>
      </div>
    </section>
` : ""}
    <section class="alt">
      <div class="wrap detail-more">
        ${ctx.lists.music ? `<a class="btn ghost" href="${esc(ctx.home)}/music">All music</a>` : `<a class="btn ghost" href="${esc(ctx.home)}">${esc(ctx.project.name)}</a>`}
        <a class="btn ghost" href="/shop">Shop downloads</a>
      </div>
    </section>`;
  return shell(siteUrl, ctx, { page, section: "music", styles: ["music", "detail"], main });
}

// ---------- news post ----------
// n: { slug, title, tag, date, summary, bodyHtml (safe-text markup already rendered by the server) }
// release: the release it is about, when published ({ slug, title, type, artwork }).
export function renderNews(siteUrl, ctx, n, release = null) {
  const path = newsPath(ctx, n.slug);
  const url = abs(siteUrl, path);
  const crumbs = crumbsFor(ctx, "news", [n.title, path]);
  const title = `${n.title} · ${ctx.project.name} · ${SITE_NAME}`;
  const description = clip(n.summary || n.title);
  const image = (release && ogImage(release.artwork)) || (local(ctx.project.image) ? { src: local(ctx.project.image), alt: ctx.project.name } : null) || SITE_IMAGE;
  const page = {
    path, title, description,
    index: ctx.index,
    ogType: "article",
    image,
    og: { "article:published_time": n.date, ...(n.tag && { "article:section": n.tag }) },
    schema: [
      webPage(siteUrl, { path, title, description }, url + "#article", crumbs),
      {
        "@type": "NewsArticle",
        "@id": url + "#article",
        headline: n.title,
        description,
        datePublished: n.date,
        url,
        mainEntityOfPage: url,
        image: abs(siteUrl, image.src),
        author: projectRef(siteUrl, ctx, artistType(ctx)),
        publisher: orgRef(siteUrl),
        ...(n.tag && { articleSection: n.tag }),
        inLanguage: "en"
      }
    ]
  };
  const main = `${hero(crumbs, `${esc(n.tag || "Update")} · <time datetime="${esc(n.date)}">${fmtDate(n.date)}</time>`, n.title, byline(ctx))}

    <section>
      <div class="wrap article">
        <div class="article-body">
          ${n.bodyHtml || `<p>${esc(n.summary || "")}</p>`}
        </div>
        ${release ? `<a class="tile release-tile" href="${esc(releasePath(ctx, release.slug))}">${release.artwork ? picture(release.artwork, "160px", false) : ""}<span><span class="tag">${esc(release.type)}</span><strong>${esc(release.title)}</strong><span>Release page &rarr;</span></span></a>` : ""}
      </div>
    </section>

    <section class="alt">
      <div class="wrap detail-more">
        ${ctx.lists.news ? `<a class="btn ghost" href="${esc(ctx.home)}/news">All news</a>` : `<a class="btn ghost" href="${esc(ctx.home)}">${esc(ctx.project.name)}</a>`}
        ${ctx.lists.music ? `<a class="btn ghost" href="${esc(ctx.home)}/music">Music</a>` : ""}
      </div>
    </section>`;
  return shell(siteUrl, ctx, { page, section: "news", styles: ["news", "detail"], main });
}
