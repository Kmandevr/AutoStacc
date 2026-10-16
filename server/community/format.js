// The one formatter for community posts (docs/community.md, "Formatting"): turns what someone typed into safe HTML.
// Everything is escaped; only this small set becomes markup: paragraphs (a blank line), line breaks, **bold**, *italic*,
// `inline code`, lists ("- " or "1. "), quotes ("> "), and links, either bare http(s) addresses or [label](https://...).
// A link shows its domain beside its label so it can't pose as another site, and carries rel="ugc nofollow noopener".
// Anything that isn't a valid http(s) address stays plain text. No HTML from the author ever passes through.

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
const anchor = (u, labelHtml) =>
  `<a href="${esc(u.href)}" rel="ugc nofollow noopener"><bdi>${labelHtml}</bdi></a> <span class="link-host">(${esc(host(u))})</span>`;

// Bold and italic, on text that is already escaped (the markers survive escaping unchanged).
const emphasis = (html) => html
  .replace(/\*\*(?=\S)([^*]*\S)\*\*/g, "<strong>$1</strong>")
  .replace(/(^|[^*\w])\*(?=\S)([^*]*\S)\*(?![*\w])/g, "$1<em>$2</em>");

// Code spans, labelled links and bare addresses are found on the raw text, then each piece is escaped on its own.
const TOKEN = /`([^`\n]+)`|\[([^\]\n]{1,200})\]\(([^)\s]{1,2000})\)|(https?:\/\/[^\s<>"'`]+)/g;

export function inline(raw) {
  raw = clean(raw);
  let out = "";
  let last = 0;
  for (const m of String(raw).matchAll(TOKEN)) {
    out += emphasis(esc(raw.slice(last, m.index)));
    last = m.index + m[0].length;
    if (m[1] !== undefined) { out += `<code>${esc(m[1])}</code>`; continue; }
    if (m[2] !== undefined) {
      const u = safeUrl(m[3]);
      out += u ? anchor(u, emphasis(esc(m[2]))) : emphasis(esc(m[0]));
      continue;
    }
    // A bare address: trailing punctuation belongs to the sentence, not the link (trimmed with a loop: a regex anchored
    // at the end is quadratic on long runs of dots).
    let end = m[4].length;
    while (end > 0 && ".,;:!?)]".includes(m[4][end - 1])) end--;
    const addr = m[4].slice(0, end);
    const trail = end < m[4].length ? [m[4].slice(end)] : null;
    const u = safeUrl(addr);
    out += u ? anchor(u, esc(addr)) : esc(addr);
    if (trail) out += esc(trail[0]);
  }
  return out + emphasis(esc(String(raw).slice(last)));
}

const LIST = { ul: /^\s*[-*]\s+(.*)$/, ol: /^\s*\d{1,3}[.)]\s+(.*)$/ };
const QUOTE = /^\s*>\s?(.*)$/;

// A whole post: blocks split on blank lines; inside a block, list and quote lines group, other lines join with <br>.
export function format(body) {
  const text = clean(body).replace(/\r\n?/g, "\n").slice(0, MAX_BODY).trim();
  if (!text) return "";
  const html = [];
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.split("\n");
    let i = 0;
    let para = [];
    const flush = () => { if (para.length) html.push(`<p>${para.map(inline).join("<br>")}</p>`); para = []; };
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
        ? `<blockquote><p>${items.map(inline).join("<br>")}</p></blockquote>`
        : `<${kind}>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</${kind}>`);
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
