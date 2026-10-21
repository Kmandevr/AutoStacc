// The page shell every server-rendered content page shares (a project's release and event pages, the events calendar,
// and any platform page that needs one): its security headers, the whole HTML document around the page's <main> (the
// head from render.js, which this module re-exports), and the small pieces pages are made of (breadcrumbs, hero,
// picture, dates, clipped descriptions). Only AutoStacc's own scripts and styles; a project's look (projects.look:
// skin, sounds) adds its skin stylesheet and sounds. Every value is escaped.
import { esc } from "../sites/text.js";
import { EMBED_HOSTS } from "../sites/embeds.js";
import { head, projectRef } from "./render.js";

export { SITE_NAME, SITE_IMAGE, abs, orgRef, projectRef, breadcrumbs, webPage, head } from "./render.js";

const FONTS = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700";
const SAFE_ID = /^[a-z0-9-]{1,60}$/;

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
export const pageHeaders = (maxAge = 60) => ({
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": CSP,
  "Strict-Transport-Security": "max-age=31536000",
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}`
});

export const fmtDate = (s) => {
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
// Only root-relative addresses on this site (artwork, project images); anything else is dropped.
export const local = (src) => {
  const s = String(src || "");
  if (/^\/(?!\/)[^\s"'<>\\]*$/.test(s)) return s;
  if (/^[A-Za-z0-9_][^\s"'<>\\:]*$/.test(s)) return "/" + s;
  return null;
};

// ctx: { creator, project, home, look: { skin, sounds }, frame: true for a first-party project (js/project-frame.js
// draws its header), lists: { music, events } = its list pages exist }. A platform page passes {} (no project).
// opts: { page (head), section, styles, main, scripts?: extra site scripts, bodyPage?: data-page value }.
export function shell(siteUrl, ctx, { page, section, styles, main, scripts = [], bodyPage }) {
  const look = ctx.look || {};
  const id = ctx.project && SAFE_ID.test(ctx.project.id) ? ctx.project.id : "";
  const skin = Boolean(id && look.skin);
  const sounds = Boolean(id && look.sounds);
  const frame = Boolean(id && ctx.frame);
  const css = ["core", "platform", "layout", ...(frame ? ["project-frame"] : []), ...styles, ...(skin ? [`projects/${id}/skin`] : []), ...(sounds ? ["eggs"] : [])];
  const js = ["data/site.js", "data/projects.js", "js/util.js", frame ? "js/project-frame.js" : "js/layout.js", "js/account-nav.js", "js/site-notice.js",
    ...(sounds ? ["js/sound.js", "js/eggs.js", "js/terminal.js"] : []), "js/motion.js", ...scripts];
  const projectAttrs = frame ? ` data-project="${esc(id)}" data-project-page="${esc(section)}"` : "";
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
<body data-page="${esc(bodyPage || `${section}-item`)}" data-section="${esc(section)}"${projectAttrs}>
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

export function crumbNav(crumbs) {
  const items = crumbs.map(([name, p], i) =>
    i === crumbs.length - 1 ? `<li aria-current="page">${esc(name)}</li>` : `<li><a href="${esc(p)}">${esc(name)}</a></li>`);
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items.join("")}</ol></nav>`;
}

// kicker and sub are markup the caller already escaped; title is text.
export function hero(crumbs, kicker, title, sub) {
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
export function picture(img, sizes, eager) {
  const src = local(img.src);
  if (!src) return "";
  const set = (type) => (Array.isArray(img.srcset) ? img.srcset : []).filter((s) => s && s.type === type && local(s.src) && Number(s.width) > 0)
    .map((s) => `${local(s.src)} ${Number(s.width)}w`).join(", ");
  const webp = set("image/webp"), jpeg = set("image/jpeg");
  const size = Number(img.width) > 0 && Number(img.height) > 0 ? ` width="${Number(img.width)}" height="${Number(img.height)}"` : "";
  return `<picture>${webp ? `<source type="image/webp" srcset="${esc(webp)}" sizes="${sizes}">` : ""}<img src="${esc(src)}"${jpeg ? ` srcset="${esc(jpeg)}" sizes="${sizes}"` : ""}${size} alt="${esc(img.alt || "")}" decoding="async"${eager ? ' fetchpriority="high"' : ' loading="lazy"'}></picture>`;
}
export const ogImage = (img) => (img && local(img.src) ? { src: local(img.src), width: Number(img.width) || null, height: Number(img.height) || null, alt: img.alt || "" } : null);

// ---------- a project's content pages ----------
const LISTS = { music: "Music", events: "Events" };
export const crumbsFor = (ctx, list, item) => [["Home", "/"], [ctx.creator.name, `/${ctx.creator.slug}`], [ctx.project.name, ctx.home],
  ...(ctx.lists[list] ? [[LISTS[list], `${ctx.home}/${list}`]] : []), ...(item ? [item] : [])];
export const byline = (ctx) => `by <a href="${esc(ctx.home)}">${esc(ctx.project.name)}</a>`;
export const artistType = (ctx) => (ctx.look.entity && /^[A-Za-z]{1,40}$/.test(ctx.look.entity) ? ctx.look.entity : "MusicGroup");
export const artistRef = (siteUrl, ctx) => projectRef(siteUrl, ctx, artistType(ctx));
export const tagList = (tags) => (tags && tags.length ? `<ul class="tag-list" aria-label="Tags">${tags.map((t) => `<li class="tag">${esc(t)}</li>`).join("")}</ul>` : "");
