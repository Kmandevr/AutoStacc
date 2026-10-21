// The one formatter for community posts (docs/community.md, "Formatting"): turns what someone typed into safe HTML.
// Everything is escaped; only this small set becomes markup: paragraphs (a blank line), line breaks, **bold**, *italic*,
// `inline code`, lists ("- " or "1. "), quotes ("> "), and links, either bare http(s) addresses or [label](https://...).
// A link shows its domain beside its label so it can't pose as another site, and carries rel="ugc nofollow noopener".
// Anything that isn't a valid http(s) address stays plain text. No HTML from the author ever passes through.
// Features extend it (hooks.js formatExtensions) without changing it: ext.links are tried for each valid link and may
// return HTML (an embed, a store card) instead of the plain link; ext.blocks split the text first and may claim parts
// of it (a code block), returning HTML for those parts. Extensions build their HTML from parsed, escaped values only.

export const MAX_BODY = 10000;

// Direction controls (LRM, RLM, embeddings, overrides, isolates) can make a label or the shown domain read backwards;
// they are dropped from everything an author writes.
const BIDI = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const clean = (s) => String(s || "").replace(BIDI, "");

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// A link target: only absolute http(s) addresses without credentials. Returns the normalised URL or null.
export function safeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password || !u.hostname.replace(/^www\.?/, "")) return null;
  return u;
}

const host = (u) => u.hostname.replace(/^www\./, "");
const plainAnchor = (u, labelHtml) =>
  `<a href="${esc(u.href)}" rel="ugc nofollow noopener"><bdi>${labelHtml}</bdi></a> <span class="link-host">(${esc(host(u))})</span>`;
const NO_EXT = { links: [], blocks: [] };
const anchor = (u, labelHtml, ext = NO_EXT) => {
  for (const rule of ext.links) {
    const html = rule(u, labelHtml);
    if (html) return html;
  }
  return plainAnchor(u, labelHtml);
};

// Bold and italic, on text that is already escaped (the markers survive escaping unchanged).
const emphasis = (html) => html
  .replace(/\*\*(?=\S)([^*]*\S)\*\*/g, "<strong>$1</strong>")
  .replace(/(^|[^*\w])\*(?=\S)([^*]*\S)\*(?![*\w])/g, "$1<em>$2</em>");

// Code spans, labelled links and bare addresses are found on the raw text, then each piece is escaped on its own.
const TOKEN = /`([^`\n]+)`|\[([^\]\n]{1,200})\]\(([^)\s]{1,2000})\)|(https?:\/\/[^\s<>"'`]+)/g;

// Whether this text would show a link once formatted: the same tokens and URL rule the formatter itself uses, so a
// check built on it (no links at three copyright strikes) can't disagree with what readers see.
export function hasLink(raw) {
  for (const m of String(clean(raw)).matchAll(TOKEN)) {
    if (m[2] !== undefined && safeUrl(m[3])) return true;
    if (m[4] !== undefined && safeUrl(m[4].replace(/[.,;:!?)\]]+$/, ""))) return true;
  }
  return false;
}

export function inline(raw, ext = NO_EXT) {
  raw = clean(raw);
  let out = "";
  let last = 0;
  for (const m of String(raw).matchAll(TOKEN)) {
    out += emphasis(esc(raw.slice(last, m.index)));
    last = m.index + m[0].length;
    if (m[1] !== undefined) { out += `<code>${esc(m[1])}</code>`; continue; }
    if (m[2] !== undefined) {
      const u = safeUrl(m[3]);
      out += u ? anchor(u, emphasis(esc(m[2])), ext) : emphasis(esc(m[0]));
      continue;
    }
    // A bare address: trailing punctuation belongs to the sentence, not the link (trimmed with a loop: a regex anchored
    // at the end is quadratic on long runs of dots).
    let end = m[4].length;
    while (end > 0 && ".,;:!?)]".includes(m[4][end - 1])) end--;
    const addr = m[4].slice(0, end);
    const trail = end < m[4].length ? [m[4].slice(end)] : null;
    const u = safeUrl(addr);
    out += u ? anchor(u, esc(addr), ext) : esc(addr);
    if (trail) out += esc(trail[0]);
  }
  return out + emphasis(esc(String(raw).slice(last)));
}

const LIST = { ul: /^\s*[-*]\s+(.*)$/, ol: /^\s*\d{1,3}[.)]\s+(.*)$/ };
const QUOTE = /^\s*>\s?(.*)$/;

// A whole post: blocks split on blank lines; inside a block, list and quote lines group, other lines join with <br>.
export function format(body, ext = NO_EXT) {
  const text = clean(body).replace(/\r\n?/g, "\n").slice(0, MAX_BODY).trim();
  if (!text) return "";
  // Block extensions claim parts of the text first ({ html } parts); the rest ({ text } parts) is formatted as usual.
  let parts = [{ text }];
  for (const rule of ext.blocks) parts = parts.flatMap((p) => (p.text === undefined ? [p] : rule(p.text)));
  return parts.map((p) => (p.text === undefined ? p.html : paragraphs(p.text.trim(), ext))).filter(Boolean).join("\n");
}

function paragraphs(text, ext) {
  if (!text) return "";
  const html = [];
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.split("\n");
    let i = 0;
    let para = [];
    const flush = () => { if (para.length) html.push(`<p>${para.map((l) => inline(l, ext)).join("<br>")}</p>`); para = []; };
    while (i < lines.length) {
      const kind = LIST.ul.test(lines[i]) ? "ul" : LIST.ol.test(lines[i]) ? "ol" : QUOTE.test(lines[i]) ? "quote" : null;
      if (!kind) { para.push(lines[i].trim()); i++; continue; }
      flush();
      const items = [];
      const re = kind === "quote" ? QUOTE : LIST[kind];
      while (i < lines.length && re.test(lines[i]) && (kind === "quote" || !(kind === "ul" ? LIST.ol : LIST.ul).test(lines[i]))) {
        items.push(lines[i].match(re)[1]);
        i++;
      }
      html.push(kind === "quote"
        ? `<blockquote><p>${items.map((l) => inline(l, ext)).join("<br>")}</p></blockquote>`
        : `<${kind}>${items.map((x) => `<li>${inline(x, ext)}</li>`).join("")}</${kind}>`);
    }
    flush();
  }
  return html.join("\n");
}

// The plain text of a post (search, plain-text emails): markup markers dropped, nothing rendered and NOTHING ESCAPED.
// Whatever puts it into HTML (a preview, an HTML email, a meta description) must escape it there.
export const plain = (body) => clean(body).slice(0, MAX_BODY)
  .replace(/\[([^\]\n]{1,200})\]\(([^)\s]{1,2000})\)/g, "$1")
  .replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`\n]+)`/g, "$1")
  .replace(/\s+/g, " ").trim();
