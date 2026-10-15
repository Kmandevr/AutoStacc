// Safe text for creator sites (docs/creators.md, docs/builder.md). Creators never write HTML: text uses a tiny markup
// (blank line = new paragraph, line break kept, **bold**, *italic*, [label](link)) and every character is escaped before
// any of it becomes a tag. Links may only be https:, mailto: or a root-relative AutoStacc page (never /api/ or /media/);
// anything else is shown as plain text. Shared by the server (server/sites/text.js) and the Studio's visual editor;
// pure, no DOM. Sets GS.siteText in browsers, module.exports in Node.
(function (root) {
  "use strict";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // A link a creator may use, normalized, or null. No javascript:, data:, protocol-relative (//host) or credentials.
  function safeUrl(raw) {
    const s = String(raw || "").trim();
    if (!s || s.length > 500) return null;
    // AutoStacc pages, but never the API or media endpoints (a creator's own verify or sign-in link, say).
    if (/^\/(?!\/)[^\s\\]*$/.test(s)) return /^\/(api|media)(\/|$|\?)/i.test(s) ? null : s;
    if (/^mailto:[^\s@<>"]+@[^\s@<>"]+$/i.test(s)) return s;
    let u;
    try {
      u = new URL(s);
    } catch {
      return null;
    }
    if (u.protocol !== "https:" || u.username || u.password) return null;
    return u.href;
  }

  // Off-site links open as plain links that tell the other site nothing about the visitor's page.
  const linkAttrs = (href) => (href.startsWith("/") ? "" : ' rel="noopener noreferrer nofollow ugc" target="_blank"');

  const inline = (escaped) => escaped
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");

  // One line of markup to HTML.
  function line(raw) {
    const out = [];
    const LINK = /\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)/g;
    let last = 0;
    for (const m of raw.matchAll(LINK)) {
      out.push(inline(esc(raw.slice(last, m.index))));
      const href = safeUrl(m[2]);
      out.push(href ? `<a href="${esc(href)}"${linkAttrs(href)}>${inline(esc(m[1]))}</a>` : inline(esc(m[0])));
      last = m.index + m[0].length;
    }
    out.push(inline(esc(raw.slice(last))));
    return out.join("");
  }

  function markup(text) {
    return String(text || "").replace(/\r\n?/g, "\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
      .map((p) => `<p>${p.split("\n").map(line).join("<br>")}</p>`).join("\n");
  }

  const api = { esc, safeUrl, linkAttrs, markup };
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.GS = root.GS || {}).siteText = api;
})(typeof self !== "undefined" ? self : globalThis);
