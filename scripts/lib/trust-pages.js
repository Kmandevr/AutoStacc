// Templates for the trust pages, all from data/: each legal document in data/legal.js (/privacy, /terms, /refunds,
// /security, /contact), the help centre (/help, data/help.js, with the guides' search box from lib/guide-pages.js) and the licences (/license, data/licenses.js). Their
// text markup is lib/rich-text.js. Returns { file, page, html } like lib/pages.js.
const H = require("./head");
const { shell, hero, clip, suffix } = require("./pages");
const { contact, inline, blocks, kindsOf, licenseLists } = require("./rich-text");
const { searchBox } = require("./guide-pages");

const { esc } = H;
const fmtDate = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
};

const toc = (items) => `<nav class="prose-toc" aria-label="On this page"><p class="prose-toc-title">On this page</p>
          <ol>${items.map(([id, label]) => `<li><a href="#${esc(id)}">${esc(label)}</a></li>`).join("")}</ol></nav>`;

function platformPage(SITE, { id, title, description, intro, main, scripts = [] }) {
  const path = "/" + id;
  const crumbs = [["Home", "/"], [title, path]];
  const fullTitle = `${title}${suffix(SITE.name)}`;
  const desc = clip(description);
  const page = {
    path, title: fullTitle, description: desc, index: true, ogType: "website",
    schema: [H.webPage(SITE, { path, title: fullTitle, description: desc }, "WebPage", { breadcrumb: H.breadcrumbs(SITE, crumbs) })]
  };
  const html = shell(SITE, { page, section: id, styles: ["prose", ...(scripts.length ? ["guide"] : [])], scripts, main: `${hero(crumbs, "AutoStacc", title, intro)}\n\n${main}` });
  return { file: id + ".html", page, html };
}

function legalPage(SITE, data, doc) {
  const where = `data/legal.js ${doc.id}`;
  const notice = doc.review ? `<p class="prose-notice" role="note"><strong>To be confirmed:</strong> ${inline(SITE, doc.review, where)}</p>` : "";
  const main = `    <section>
      <div class="wrap prose-layout">
        ${doc.sections.length > 3 ? toc(doc.sections.map((s) => [s.id, s.heading])) : ""}
        <div class="prose">
          ${notice}
          <p class="prose-updated">Last updated ${esc(fmtDate(doc.updated))}</p>
${doc.sections.map((s) => `          <section id="${esc(s.id)}" aria-labelledby="${esc(s.id)}-h">
          <h2 id="${esc(s.id)}-h">${esc(s.heading)}</h2>
          ${blocks(SITE, s.body, `${where} #${s.id}`)}
          </section>`).join("\n")}
          ${related(doc.id)}
        </div>
      </div>
    </section>`;
  return platformPage(SITE, { id: doc.id, title: doc.title, description: doc.description, intro: esc(doc.summary), main });
}

// Every trust page links to the others, so none is an orphan.
const RELATED = [["/help", "Help"], ["/guide", "Guides"], ["/contact", "Contact"], ["/terms", "Terms"], ["/privacy", "Privacy"], ["/refunds", "Refunds"], ["/license", "Licences"], ["/security", "Security"], ["/copyright", "Copyright"], ["/community-rules", "Community rules"]];
const related = (id) => `<nav class="prose-related" aria-label="Help and policies"><p>See also</p><ul>${RELATED.filter(([p]) => p !== "/" + id)
  .map(([p, l]) => `<li><a href="${p}">${l}</a></li>`).join("")}</ul></nav>`;

function helpPage(SITE, data) {
  const main = `    <section>
      <div class="wrap prose-layout">
        ${toc(data.help.map((g) => [g.id, g.title]))}
        <div class="prose">
          ${searchBox("Search help and guides")}
${data.help.map((g) => `          <section id="${esc(g.id)}" aria-labelledby="${esc(g.id)}-h">
          <h2 id="${esc(g.id)}-h">${esc(g.title)}</h2>
${g.items.map((q) => `          <h3 id="${esc(q.id)}">${esc(q.q)}</h3>
          ${blocks(SITE, q.a, `data/help.js #${q.id}`)}`).join("\n")}
          </section>`).join("\n")}
          ${related("help")}
        </div>
      </div>
    </section>`;
  return platformPage(SITE, { id: "help", title: "Help", description: "Answers about downloads, guest purchases, accounts, passwords, payments, refunds, licences, following projects and Your Stacc on AutoStacc.",
    intro: "Quick answers about buying, downloading, your account and Your Stacc. Step by step: the <a href=\"/guide\">Guides</a>. Can't find yours? See <a href=\"/contact\">Contact</a>.", main,
    scripts: ["data/guide-index.js", "js/guide-search.js"] });
}

function licensePage(SITE, data) {
  const entries = Object.entries(data.licenses);
  const main = `    <section>
      <div class="wrap prose-layout">
        ${toc(entries.map(([key, l]) => [key, l.title]))}
        <div class="prose">
          <p>Buying a product gets you a licence to use its files, not the copyright in them: that stays with the artist or creator. Which licence applies depends on the kind of product, and every product page says which one it has.</p>
${entries.map(([key, l]) => `          <section id="${esc(key)}" class="license" aria-labelledby="${esc(key)}-h">
          <h2 id="${esc(key)}-h">${esc(l.title)}</h2>
          <p class="small-print">For: ${esc(kindsOf(data, key).join(", ") || "products that name it")}</p>
          <p>${inline(SITE, l.summary, `data/licenses.js ${key}`)}</p>
          ${licenseLists(SITE, l, `data/licenses.js ${key}`)}
          </section>`).join("\n")}
          <section id="everything" aria-labelledby="everything-h">
          <h2 id="everything-h">For every licence</h2>
          <ul><li>The licence is yours personally; it can't be passed on or shared with others.</li><li>It lasts for good, and stays the one you bought under even if the terms change later.</li><li>A refunded purchase ends its licence.</li><li>Want to do something not covered here? Ask first: ${contact(SITE)}</li></ul>
          </section>
          ${related("license")}
        </div>
      </div>
    </section>`;
  return platformPage(SITE, { id: "license", title: "Licences", description: "What you may do with what you buy on AutoStacc: sounds and presets in your own music, remix stems, music for listening and DJ sets, and visuals for your shows.",
    intro: "What you can do with what you buy, by kind of product, in plain words.", main });
}

function trustPages(SITE, data) {
  const ids = data.legal.map((d) => d.id);
  for (const need of ["privacy", "terms", "refunds", "security", "contact"]) if (!ids.includes(need)) throw new Error(`data/legal.js: the ${need} document is missing`);
  return [...data.legal.map((d) => legalPage(SITE, data, d)), helpPage(SITE, data), licensePage(SITE, data)];
}

module.exports = { trustPages };
