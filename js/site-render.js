// Creator sites (docs/builder.md): a page of a version 2 site document as HTML. A page is a list of sections; a section
// is a free 12-column grid whose elements sit at { x, y, w, h } (columns and 24px rows, growing to fit their content).
// On phones the grid becomes one column in reading order (top to bottom, left to right) unless an element has its own
// phone order, and phone-hidden elements drop out (css/creator-site.css). Every inline style is built here from checked
// numbers and #rrggbb colours, never from creator text. pageHtml writes the whole document (head, AutoStacc strip,
// footer) for the server; the Studio's editor uses the same functions, so it shows what visitors get.
// Shared by the server (server/sites/render.js) and the Studio's editor; pure. Sets GS.siteRender in browsers.
(function (root) {
  "use strict";

  const node = typeof module === "object" && module.exports;
  const T = node ? require("./site-text.js") : root.GS.siteText;
  const EL = node ? require("./site-elements.js") : root.GS.siteElements;
  const TH = node ? require("./site-theme.js") : root.GS.siteTheme;
  const CSS = node ? require("./site-css.js") : root.GS.siteCss;
  const { esc, safeUrl, linkAttrs } = T;

  const COLS = 12;
  const ROW = 24;
  const HEX = /^#[0-9a-f]{6}$/i;
  // Text size and heading size for each size setting.
  const SIZES = { s: [".875rem", "clamp(1.3rem, 3vw, 1.8rem)"], l: ["1.25rem", "clamp(2.6rem, 8vw, 5rem)"],
    xl: ["1.6rem", "clamp(3rem, 10vw, 6.5rem)"], xxl: ["2.2rem", "clamp(3.4rem, 13vw, 9rem)"] };

  // Reading order on phones: an element's own phone order, else top to bottom, then left to right.
  function phoneOrder(elements) {
    const ranked = elements.map((el, i) => ({ el, i })).sort((a, b) => (a.el.box.y - b.el.box.y) || (a.el.box.x - b.el.box.x) || (a.i - b.i));
    const rank = new Map(ranked.map((r, n) => [r.el, n]));
    return (el) => (el.phone && Number.isInteger(el.phone.order) ? el.phone.order : rank.get(el));
  }

  function styleOf(el) {
    const s = el.style || {};
    const out = [];
    if (s.align) out.push(`text-align:${s.align}`);
    if (HEX.test(s.color || "")) out.push(`--el-text:${s.color}`);
    if (HEX.test(s.bg || "")) out.push(`--el-bg:${s.bg}`);
    if (s.radius) out.push(`--el-radius:${s.radius}px`);
    if (s.pad) out.push(`--el-pad:${s.pad}px`);
    if (SIZES[s.size]) out.push(`--el-fs:${SIZES[s.size][0]}`, `--el-hs:${SIZES[s.size][1]}`);
    return out;
  }

  function elementHtml(el, ctx, order) {
    const inner = EL.render(el, ctx);
    if (!inner && !["spacer", "divider"].includes(el.type) && !ctx.editor) return "";
    const b = el.box;
    const style = [`grid-column:${b.x + 1} / span ${b.w}`, `grid-row:${b.y + 1} / span ${b.h}`, `--po:${order}`, ...styleOf(el)];
    if (el.phone && el.phone.h) style.push(`--ph:${el.phone.h * ROW}px`);
    const cls = ["cs-el", `cs-t-${el.type}`, el.style && el.style.bg ? "cs-filled" : "", el.style && el.style.shadow ? "cs-shadow" : "",
      el.phone && el.phone.hidden ? "cs-ph-hide" : "", ...(el.cls || [])].filter(Boolean).join(" ");
    const fx = `${el.effect ? ` data-fx="${esc(el.effect)}"` : ""}${el.hover ? ` data-hover="${esc(el.hover)}"` : ""}`;
    return `<div class="${esc(cls)}" data-el="${esc(el.id)}" style="${style.join(";")}"${fx}>${inner || (ctx.editor ? `<p class="cs-empty">${esc(el.type)}</p>` : "")}</div>`;
  }

  function sectionHtml(sec, ctx) {
    const rows = Math.max(sec.rows, ...sec.elements.map((el) => el.box.y + el.box.h), 1);
    const style = [`--rows:${rows}`];
    const bg = sec.background || {};
    if (HEX.test(bg.color || "")) style.push(`--sec-bg:${bg.color}`);
    if (bg.asset && ctx.images.has(bg.asset)) {
      style.push(`--sec-img:url("${ctx.images.get(bg.asset)}")`, `--sec-fit:${bg.fit === "contain" ? "contain" : bg.fit === "tile" ? "auto" : "cover"}`,
        `--sec-repeat:${bg.fit === "tile" ? "repeat" : "no-repeat"}`, `--sec-ov:${(bg.overlay || 0) / 100}`);
    }
    if (HEX.test(bg.text || "")) style.push(`--sec-text:${bg.text}`);
    const cls = ["cs-sec", sec.full ? "cs-full" : "", bg.asset && ctx.images.has(bg.asset) ? "cs-has-img" : "", HEX.test(bg.color || "") ? "cs-has-bg" : "", ...(sec.cls || [])].filter(Boolean).join(" ");
    const order = phoneOrder(sec.elements);
    return `<section class="${esc(cls)}" data-sec="${esc(sec.id)}" style="${style.join(";")}"><div class="cs-grid">${sec.elements.map((el) => elementHtml(el, ctx, order(el))).join("")}</div></section>`;
  }

  // The site's menu: the creator's own items, else every page in order.
  function navItems(doc, base) {
    const pageHref = (slug) => (slug ? `${base}/${slug}` : base);
    if (doc.nav && doc.nav.items && doc.nav.items.length) {
      return doc.nav.items.map((n) => (n.url ? { label: n.label, href: safeUrl(n.url), external: !String(n.url).startsWith("/") } : { label: n.label, href: pageHref(n.page), slug: n.page })).filter((n) => n.href);
    }
    return doc.pages.length > 1 ? doc.pages.map((p) => ({ label: p.title, href: pageHref(p.slug), slug: p.slug })) : [];
  }

  // header: { base, name, by: { name, path } | null }
  function headerHtml(doc, page, ctx, header) {
    const mode = doc.theme.header || "bar";
    if (mode === "none") return "";
    const nav = navItems(doc, header.base);
    const menu = nav.length ? `<nav class="cs-nav" aria-label="${esc(header.name)}">${nav.map((n) => `<a href="${esc(n.href)}"${n.external ? linkAttrs(n.href) : ""}${n.slug === page.slug ? ' aria-current="page"' : ""}>${esc(n.label)}</a>`).join("")}</nav>` : "";
    if (mode === "menu") return menu ? `<header class="cs-head cs-head-menu">${menu}</header>` : "";
    const logo = doc.theme.logo && ctx.images.has(doc.theme.logo) ? `<img class="cs-logo" src="${esc(ctx.images.get(doc.theme.logo))}" alt="${esc(header.name)}">` : esc(header.name);
    return `<header class="cs-head">${header.by ? `<p class="cs-by"><a href="${esc(header.by.path)}">${esc(header.by.name)}</a></p>` : ""}<p class="cs-brand"><a href="${esc(header.base)}">${logo}</a></p>${menu}</header>`;
  }

  // The page area: header and sections.
  function bodyHtml(doc, page, ctx, header) {
    return `<div class="cs-site">${headerHtml(doc, page, ctx, header)}<main class="cs-main">${page.sections.map((s) => sectionHtml(s, ctx)).join("")}</main></div>`;
  }
  // The creator's CSS, checked and rebuilt (js/site-css.js; a sheet with problems shows nothing). It refers to their
  // files by address; any file that isn't theirs (anymore) is dropped here.
  const ownCss = (css, ctx) => CSS.check(css).css.replace(/url\("\/media\/sites\/(as_[a-z2-7]+)"\)/g, (m, id) => (ctx.images.has(id) ? m : "none"));

  // The whole document. opts: { siteUrl, path, title, description, indexable, doc, page, ctx, header, runtime }.
  function pageHtml(o) {
    const theme = o.doc.theme;
    const fontSrc = theme.fontAsset && o.ctx.images.has(theme.fontAsset) ? o.ctx.images.get(theme.fontAsset) : null;
    const css = ownCss(theme.css, o.ctx);
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(o.title)}</title>
  ${o.description ? `<meta name="description" content="${esc(o.description)}">` : ""}
  <link rel="canonical" href="${esc(o.siteUrl + o.path)}">
  ${o.indexable ? "" : '<meta name="robots" content="noindex">'}
  <meta property="og:title" content="${esc(o.title)}">
  <meta property="og:url" content="${esc(o.siteUrl + o.path)}">
  <meta property="og:site_name" content="AutoStacc">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <link rel="icon" href="/img/favicon.png" type="image/png">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="${esc(TH.fontHref(theme))}">
  <link rel="stylesheet" href="/css/creator-site.css">
  <style>${TH.themeCss(theme, fontSrc)}</style>
  ${css ? `<style>${css}</style>` : ""}
  ${o.runtime ? `<script src="${esc(o.runtime)}" defer></script>` : ""}
</head>
<body>
  <div class="cs-strip"><a href="/">AutoStacc</a><span>Creator page · accounts, cart and payments only ever happen on AutoStacc itself</span></div>
  ${bodyHtml(o.doc, o.page, o.ctx, o.header)}
  <footer class="cs-footer"><a href="/">Made on AutoStacc</a> · <a href="/about">About AutoStacc</a></footer>
</body>
</html>
`;
  }

  const api = { COLS, ROW, pageHtml, bodyHtml, sectionHtml, navItems, ownCss };
  if (node) module.exports = api;
  else (root.GS = root.GS || {}).siteRender = api;
})(typeof self !== "undefined" ? self : globalThis);
