// Text for the pages generated from data/legal.js, data/help.js, data/licenses.js and data/guides.js, with a deliberately tiny markup:
// [label](/path or https:// or mailto:) links, **bold** and {contact} (the support address in data/site.js); everything
// else is escaped. Also the licence lists and the licence box product pages show (lib/pages.js, lib/trust-pages.js).
const { esc } = require("./head");

// The support address from data/site.js, or an honest "not set up yet".
const contact = (SITE) => (SITE.email
  ? `Email <a href="mailto:${esc(SITE.email)}">${esc(SITE.email)}</a>.`
  : "AutoStacc's support address isn't set up yet; it will appear here as soon as it is.");

// One line of text: escape it, then turn the allowed markup back into HTML. Links must stay on this site, use HTTPS
// or be mailto:; anything else is a build error, never a link.
function inline(SITE, text, where) {
  return esc(text)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
      if (!/^(\/(?!\/)|https:\/\/|mailto:)/.test(href)) throw new Error(`${where}: link "${href}" must start with /, https:// or mailto:`);
      const external = href.startsWith("https://");
      return `<a href="${href}"${external ? ' rel="noopener"' : ""}>${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\{contact\}/g, contact(SITE));
}

// A body: paragraphs (strings), lists ({ list: [...] }), and for guides also numbered steps ({ steps: [...] }), notes
// ({ note }) and subheadings ({ heading, id }). Anything else is a build error.
function block(SITE, b, where) {
  const items = (xs) => xs.map((x) => `<li>${inline(SITE, x, where)}</li>`).join("");
  if (typeof b === "string") return `<p>${inline(SITE, b, where)}</p>`;
  if (b.list) return `<ul>${items(b.list)}</ul>`;
  if (b.steps) return `<ol class="prose-steps">${items(b.steps)}</ol>`;
  if (b.note) return `<p class="prose-tip" role="note">${inline(SITE, b.note, where)}</p>`;
  if (b.heading && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(b.id || "")) return `<h2 id="${esc(b.id)}">${esc(b.heading)}</h2>`;
  throw new Error(`${where}: unknown block ${JSON.stringify(b).slice(0, 60)} (a heading needs a lowercase-hyphenated id)`);
}
const blocks = (SITE, body, where) => body.map((b) => block(SITE, b, where)).join("\n          ");

// Which kinds of product each licence covers, from data/product-types.js.
const kindsOf = (data, key) => Object.values(data.productTypes).filter((t) => t.license === key).map((t) => t.label);

const licenseLists = (SITE, l, where) => `<div class="license-lists">
            <div><h3>You can</h3><ul>${l.allowed.map((x) => `<li>${inline(SITE, x, where)}</li>`).join("")}</ul></div>
            <div><h3>You can't</h3><ul>${l.notAllowed.map((x) => `<li>${inline(SITE, x, where)}</li>`).join("")}</ul></div>
          </div>`;

// The licence box on a product page: the summary, the lists, and a link to the full licence. "" for a kind of
// product without fixed terms.
function licenseBox(SITE, data, p) {
  const key = (data.productTypes[p.type] || {}).license;
  const l = key && data.licenses[key];
  if (!l) return "";
  return `<section class="license-box" aria-labelledby="license-${esc(p.id)}">
            <h2 id="license-${esc(p.id)}" class="included-head">Licence</h2>
            <p><strong>${esc(l.title)}.</strong> ${inline(SITE, l.summary, `data/licenses.js ${key}`)}</p>
            ${licenseLists(SITE, l, `data/licenses.js ${key}`)}
            <p class="small-print">Full terms: <a href="/license#${esc(key)}">${esc(l.title)}</a>.</p>
          </section>`;
}

module.exports = { contact, inline, blocks, kindsOf, licenseLists, licenseBox };
