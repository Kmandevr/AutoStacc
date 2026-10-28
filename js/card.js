// The one card every list on AutoStacc draws (owner, 2026-10-27, #230): art or a generated tile, a small line saying
// what it is, the title, a short line, then the area's own body and footer, with status tags (Official, Unverified
// creator, Pinned, New...) as small chips in the top-right corner (card.tag). Each area supplies only its content and
// keeps its own class and data-* attributes (cls, attrs). Pure string templates, no DOM: shared by the browser
// (GS.card; load before the area's script) and the server and build scripts (module.exports). Styles: css/core.css.
(function (root) {
  "use strict";

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TONES = ["official", "unofficial", "verified", "unverified", "pinned", "new", "sale", "soon", "team", "info"];

  // A status chip. tone picks its colour (one of TONES, else plain); title is the tooltip.
  function tag(label, tone = "", title = "") {
    const t = TONES.includes(tone) ? ` tag-${tone}` : "";
    return `<span class="tag${tone === "unverified" ? " unverified" : ""}${t}"${title ? ` title="${esc(title)}"` : ""}>${esc(label)}</span>`;
  }
  const tagHtml = (x) => (typeof x === "string" ? tag(x) : x && x.label ? tag(x.label, x.tone, x.title) : "");

  // The first letters of a name, for a generated tile when there is no picture.
  const initials = (name) => String(name || "").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).slice(0, 2)
    .map((w) => (w.match(/[\p{L}\p{N}]/u) || [""])[0].toUpperCase()).join("") || "?";

  /**
   * card({ href, title, level, eyebrow, sub, tags, img, initials, art, artCls, body, foot, cls, attrs, as, titleCls, bodyCls })
   * Text fields (title, eyebrow, sub, img, href, tag labels, attrs values) are escaped here; art, body and foot are
   * HTML the caller built (and escaped) itself. No href: the title is plain text. No img, initials or art: no tile.
   * titleCls and bodyCls add an area's own classes to the heading and body (its sheet and tests keep their names).
   */
  function card(o) {
    const href = o.href ? esc(o.href) : "";
    const level = Math.min(6, Math.max(2, o.level || 3));
    const attrs = Object.entries(o.attrs || {}).filter(([, v]) => v !== undefined && v !== null && v !== false)
      .map(([k, v]) => ` ${k}${v === true ? "" : `="${esc(v)}"`}`).join("");
    const inner = o.art || (o.img ? `<img src="${esc(o.img)}" alt="" width="240" height="240" loading="lazy">`
      : o.initials !== undefined ? `<span>${esc(o.initials || initials(o.title))}</span>` : "");
    const tile = inner ? (href ? `<a class="card-art${o.artCls ? ` ${o.artCls}` : ""}" href="${href}" tabindex="-1" aria-hidden="true">${inner}</a>`
      : `<span class="card-art${o.artCls ? ` ${o.artCls}` : ""}" aria-hidden="true">${inner}</span>`) : "";
    const tags = (o.tags || []).map(tagHtml).filter(Boolean).join("");
    const title = href ? `<a href="${href}">${esc(o.title)}</a>` : esc(o.title);
    const as = o.as === "li" ? "li" : "article";
    return `<${as} class="ui-card${o.cls ? ` ${o.cls}` : ""}"${attrs}>${tile}
      ${tags ? `<span class="card-tags">${tags}</span>` : ""}
      <div class="ui-card-body${o.bodyCls ? ` ${o.bodyCls}` : ""}">
        ${o.eyebrow ? `<p class="card-type">${esc(o.eyebrow)}</p>` : ""}
        <h${level} class="ui-card-title${o.titleCls ? ` ${o.titleCls}` : ""}">${title}</h${level}>
        ${o.sub ? `<p class="ui-card-sub">${esc(o.sub)}</p>` : ""}${o.body || ""}
      </div>${o.foot ? `\n      <div class="ui-card-foot">${o.foot}</div>` : ""}
    </${as}>`;
  }

  card.tag = tag;
  card.initials = initials;
  if (typeof module === "object" && module.exports) module.exports = card;
  else (root.GS = root.GS || {}).card = card;
})(typeof self !== "undefined" ? self : globalThis);
