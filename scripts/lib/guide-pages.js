// The guides from data/guides.js: /guide (the sections and their articles), one page per article (/guide/<id>), and
// data/guide-index.js, the search index /guide and /help share (js/guide-search.js). Article text uses the same tiny
// markup as the trust pages (lib/rich-text.js). Returns { pages: [{ file, page, html }], index } like lib/pages.js.
const H = require("./head");
const { abs } = require("./data");
const { shell, hero, clip, suffix } = require("./pages");
const { blocks } = require("./rich-text");

const { esc } = H;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const fmtDate = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
};
const articlePath = (a) => "/guide/" + a.id;

// The search box: hidden until js/guide-search.js has its index, so without JavaScript nothing broken shows.
const searchBox = (label) => `<form class="guide-search" role="search" data-guide-search hidden>
          <label for="guide-q">${esc(label)}</label>
          <input id="guide-q" type="search" name="q" autocomplete="off" placeholder="Try: download, refund, payouts">
          <ul class="guide-results" aria-live="polite"></ul>
        </form>`;

function check(guides) {
  const errors = [];
  const sections = new Set(guides.sections.map((s) => s.id));
  const seen = new Set();
  for (const a of guides.articles) {
    const where = `data/guides.js ${a.id}`;
    if (!ID.test(a.id || "")) errors.push(`${where}: id must be lowercase-hyphenated`);
    if (seen.has(a.id)) errors.push(`${where}: duplicate id`);
    seen.add(a.id);
    if (!sections.has(a.section)) errors.push(`${where}: section "${a.section}" isn't in sections`);
    if (!a.title || !a.summary) errors.push(`${where}: needs a title and a summary`);
    if (!DAY.test(a.updated || "")) errors.push(`${where}: updated must be YYYY-MM-DD`);
    const ids = (a.body || []).filter((b) => b.heading).map((b) => b.id);
    if (new Set(ids).size !== ids.length) errors.push(`${where}: two headings share an id`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
}

function page(SITE, { path, title, description, type, extra }) {
  const fullTitle = `${title}${suffix(SITE.name)}`;
  const desc = clip(description);
  return { path, title: fullTitle, description: desc, index: true, ogType: "website",
    schema: [H.webPage(SITE, { path, title: fullTitle, description: desc }, type, extra)] };
}

const help = `<nav class="prose-related" aria-label="More help"><p>Still stuck?</p><ul><li><a href="/help">Quick answers</a></li><li><a href="/contact">Contact support</a></li><li><a href="/guide">All guides</a></li></ul></nav>`;

// "Start here": the few guides most people need first (data/guides.js `start`), above the full list.
function start(guides) {
  const list = (guides.start || []).map((id) => guides.articles.find((a) => a.id === id)).filter(Boolean);
  return list.length ? `        <section class="guide-start" aria-labelledby="guide-start-h">
          <h2 id="guide-start-h">Start here</h2>
          <ul class="guide-start-list">${list.map((a) => `<li><a href="${articlePath(a)}">${esc(a.title)}</a></li>`).join("")}</ul>
        </section>` : "";
}

function indexPage(SITE, guides) {
  const crumbs = [["Home", "/"], ["Guides", "/guide"]];
  const description = "Step-by-step guides to AutoStacc: buying, Your Stacc, downloads, following projects and refunds, plus the creator manual for the Studio, selling, packs and payouts.";
  const p = page(SITE, { path: "/guide", title: "Guides", description, type: "CollectionPage",
    extra: { breadcrumb: H.breadcrumbs(SITE, crumbs), mainEntity: H.itemList(SITE, guides.articles.map((a) => [a.title, articlePath(a)])) } });
  const main = `${hero(crumbs, "AutoStacc", "Guides", "Step by step, for buying on AutoStacc and for creators in the Studio. Quick answers are in <a href=\"/help\">Help</a>.")}

    <section>
      <div class="wrap guide-home">
        ${searchBox("Search guides and help")}
${start(guides)}
${guides.sections.map((s) => `        <section class="guide-section" id="${esc(s.id)}" aria-labelledby="${esc(s.id)}-h">
          <h2 id="${esc(s.id)}-h">${esc(s.title)}</h2>
          <p class="guide-intro">${esc(s.intro)}</p>
          <ul class="guide-cards">${guides.articles.filter((a) => a.section === s.id).map((a) => `
            <li><a class="guide-card" href="${articlePath(a)}"><strong>${esc(a.title)}</strong><span>${esc(a.summary)}</span></a></li>`).join("")}
          </ul>
        </section>`).join("\n")}
      </div>
    </section>`;
  return { file: "guide.html", page: p, html: shell(SITE, { page: p, section: "guide", styles: ["prose", "guide"], scripts: ["data/guide-index.js", "js/guide-search.js"], main }) };
}

function articlePage(SITE, guides, a) {
  const section = guides.sections.find((s) => s.id === a.section);
  const path = articlePath(a);
  const crumbs = [["Home", "/"], ["Guides", "/guide"], [a.title, path]];
  const p = page(SITE, { path, title: a.title, description: a.summary, type: "WebPage",
    extra: { breadcrumb: H.breadcrumbs(SITE, crumbs), dateModified: a.updated, isPartOf: { "@id": abs(SITE, "/guide") + "#webpage" } } });
  const heads = a.body.filter((b) => b.heading);
  const toc = heads.length > 1 ? `<nav class="prose-toc" aria-label="On this page"><p class="prose-toc-title">On this page</p>
          <ol>${heads.map((h) => `<li><a href="#${esc(h.id)}">${esc(h.heading)}</a></li>`).join("")}</ol></nav>` : "";
  const more = guides.articles.filter((x) => x.section === a.section && x.id !== a.id);
  const main = `${hero(crumbs, esc(section.title), a.title, esc(a.summary))}

    <section>
      <div class="wrap prose-layout">
        ${toc}
        <article class="prose">
          <p class="prose-updated">Last updated ${esc(fmtDate(a.updated))}</p>
          ${blocks(SITE, a.body, `data/guides.js ${a.id}`)}
          ${more.length ? `<nav class="prose-related" aria-label="More in ${esc(section.title)}"><p>More in ${esc(section.title)}</p><ul>${more.map((x) => `<li><a href="${articlePath(x)}">${esc(x.title)}</a></li>`).join("")}</ul></nav>` : ""}
          ${help}
        </article>
      </div>
    </section>`;
  return { file: `guide/${a.id}.html`, page: p, html: shell(SITE, { page: p, section: "guide", styles: ["prose", "guide"], scripts: [], main }) };
}

// Plain text of a body, for the search index, read straight from the source markup (never from HTML): a link keeps
// its label, **bold** its words, {contact} becomes "contact support". The index is shown with textContent only.
const plainLine = (t) => String(t).replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\{contact\}/g, "contact support");
const plain = (body) => body.map((b) => (typeof b === "string" ? [b] : b.list || b.steps || [b.note || b.heading || ""]))
  .flat().map(plainLine).join(" ").replace(/\s+/g, " ").trim();

// One entry per guide and per help answer: title, where it is, its path and its text.
function searchIndex(SITE, guides, help) {
  const sectionTitle = Object.fromEntries(guides.sections.map((s) => [s.id, s.title]));
  return [
    ...guides.articles.map((a) => ({ t: a.title, s: sectionTitle[a.section], p: articlePath(a), x: `${a.summary} ${plain(a.body)}` })),
    ...help.flatMap((g) => g.items.map((q) => ({ t: q.q, s: "Help", p: `/help#${q.id}`, x: plain(q.a) })))
  ];
}

function guidePages(SITE, data) {
  check(data.guides);
  return {
    pages: [indexPage(SITE, data.guides), ...data.guides.articles.map((a) => articlePage(SITE, data.guides, a))],
    index: searchIndex(SITE, data.guides, data.help)
  };
}

module.exports = { guidePages, searchBox };
