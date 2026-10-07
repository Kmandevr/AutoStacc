// Generates everything search engines read from data/: each page's <head> metadata, one page per release, product and
// news post, sitemap.xml, the list of public URLs, and db/catalog.sql (the store database's copy of the catalog).
// Usage: node scripts/build.js [--check]
// --check writes nothing and exits 1 if any generated file is out of date (CI and the deploy run it before building).
const fs = require("fs");
const path = require("path");
const { ROOT, loadData, abs } = require("./lib/data");
const H = require("./lib/head");
const P = require("./lib/pages");
const C = require("./lib/catalog");
const PL = require("./lib/platform");
const { platformSql } = require("./lib/platform-catalog");

const check = process.argv.includes("--check");
const data = loadData();
const { SITE } = data;
const errors = [];
const outputs = new Map(); // file -> content

// ---------- hand-written pages: every *.html in the root ----------
// Each writes its own <title> and <meta name="description"> (the home page takes both from data/site.js);
// everything else in the head block is generated. A page opts out of search with its own <meta name="robots" content="noindex">.
const PAGE_TYPES = { music: "CollectionPage", shop: "CollectionPage", news: "CollectionPage", projects: "CollectionPage", press: "AboutPage" };
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const strip = (html) => html.replace(new RegExp(`${H.START.slice(0, 15)}[\\s\\S]*?${H.END}`), "");
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&amp;/g, "&");

const handPages = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b)));
const pages = []; // every page with its metadata, for the sitemap

for (const file of handPages) {
  const html = read(file);
  const rest = strip(html);
  const key = (html.match(/<body[^>]*\sdata-page="([^"]+)"/) || [])[1];
  const isHome = file === "index.html";
  const title = isHome ? SITE.title : decode((rest.match(/<title>([^<]*)<\/title>/) || [])[1] || "");
  const description = isHome ? SITE.description : decode((rest.match(/<meta name="description" content="([^"]*)">/) || [])[1] || "");
  if (!title) errors.push(`${file}: add a <title> above the seo block`);
  if (!description) errors.push(`${file}: add a <meta name="description" content="..."> above the seo block`);
  if (isHome && /<title>/.test(rest)) errors.push(`${file}: the home page's title comes from data/site.js (title); remove its own <title>`);
  if (!html.includes(H.START.slice(0, 15)) || !html.includes(H.END)) {
    errors.push(`${file}: add the two seo markers in <head> (copy them from shop.html)`);
    continue;
  }
  const index = !/<meta name="robots" content="[^"]*noindex/.test(rest);
  const p = isHome ? "/" : file === "404.html" ? null : "/" + file.replace(/\.html$/, "");
  const name = title.split(" · ")[0];
  const page = { file, path: p, title, description, ownTitle: !isHome, ownRobots: !index, index: index && Boolean(p), ogType: "website", schema: [] };

  if (isHome) {
    page.schema = [H.website(SITE), H.artist(SITE), H.webPage(SITE, page, "WebPage", { about: { "@id": abs(SITE, "/#artist") } })];
  } else if (page.index) {
    const crumbs = [["Home", "/"], [name, p]];
    const lists = {
      music: data.releases.map((r) => [r.title, "/music/" + r.id]),
      shop: data.products.filter((x) => !x.draft).map((x) => [x.title, "/shop/" + x.id]),
      news: [...data.news].sort((a, b) => b.date.localeCompare(a.date)).map((n) => [n.title, "/news/" + n.id]),
      projects: data.projects.filter((x) => !x.draft).map((x) => [x.name, x.home])
    }[key];
    const extra = { breadcrumb: H.breadcrumbs(SITE, crumbs) };
    if (lists && lists.length) extra.mainEntity = H.itemList(SITE, lists);
    if (key === "press") extra.about = { "@id": abs(SITE, "/#artist") };
    page.schema = [H.webPage(SITE, page, PAGE_TYPES[key] || "WebPage", extra), ...(key === "press" ? [H.artist(SITE)] : [])];
  }
  const block = H.headBlock(SITE, page);
  outputs.set(file, html.replace(new RegExp(`${H.START.slice(0, 15)}[^\\n]*\\n[\\s\\S]*?${H.END}`), () => block));
  pages.push(page);
}

// ---------- generated pages ----------
const generated = [
  ...data.releases.map((r) => P.releasePage(SITE, data, r)),
  ...data.products.map((x) => P.productPage(SITE, data, x)),
  ...data.news.map((n) => P.newsPage(SITE, data, n))
];
const seen = new Set();
for (const g of generated) {
  if (seen.has(g.file)) errors.push(`duplicate id: ${g.file}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(path.basename(g.file, ".html"))) errors.push(`${g.file}: ids must be lowercase-hyphenated`);
  seen.add(g.file);
  outputs.set(g.file, g.html);
  pages.push({ ...g.page, file: g.file });
}
for (const r of data.releases) {
  if (!r.artwork) errors.push(`release ${r.id}: add artwork (it is the page's preview image)`);
  for (const t of r.tracks || []) if (!/^\d+:\d\d$/.test(t.duration || "")) errors.push(`release ${r.id}: track "${t.title}" needs a duration like "2:27"`);
}

// ---------- store catalog: db/catalog.sql (the deploy applies it to the store database) ----------
// Projects and polls are synced after the products, in the same file. The platform links are checked first.
errors.push(...C.validate(data.products, data.productTypes));
errors.push(...PL.validate(data));
outputs.set("db/catalog.sql", C.catalogSql(data.products, data.productTypes) + platformSql(data));

// Generated files that no longer match any data entry (an id was removed or made a draft) are deleted.
const stale = [];
for (const dir of ["music", "shop", "news"]) {
  if (!fs.existsSync(path.join(ROOT, dir))) continue;
  for (const f of fs.readdirSync(path.join(ROOT, dir)).filter((n) => n.endsWith(".html")).map((n) => `${dir}/${n}`)) {
    if (!outputs.has(f) && read(f).includes(P.GENERATED)) stale.push(f);
  }
}

// ---------- sitemap.xml: every indexable page ----------
const indexable = pages.filter((p) => p.index && p.path);
const urls = indexable.map((p) => abs(SITE, p.path));
outputs.set("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<!-- Every public page for search engines. Generated by scripts/build.js from the pages and data/; don't edit. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${H.esc(u)}</loc></url>`).join("\n")}
</urlset>
`);

// ---------- public URL record: new URLs are added, none is ever removed here ----------
// scripts/seo-test.js fails if a recorded URL is neither in the sitemap nor redirected in _redirects,
// so a page can't silently disappear from search. Remove a line by hand only when the removal is deliberate.
const RECORD = "scripts/public-urls.txt";
const recorded = fs.existsSync(path.join(ROOT, RECORD)) ? read(RECORD).split("\n").filter((l) => l && !l.startsWith("#")) : [];
const header = "# Public URLs ever published. scripts/build.js adds new ones; seo-test.js fails if one disappears without a redirect.\n";
outputs.set(RECORD, header + [...new Set([...recorded, ...urls])].join("\n") + "\n");

// ---------- write or check ----------
if (errors.length) {
  console.error(errors.map((e) => "FAIL build - " + e).join("\n"));
  process.exit(1);
}
const changed = [...outputs].filter(([f, c]) => !fs.existsSync(path.join(ROOT, f)) || read(f) !== c).map(([f]) => f);
if (check) {
  const out = [...changed.map((f) => `FAIL build - ${f} is out of date`), ...stale.map((f) => `FAIL build - ${f} is stale (no data entry)`)];
  console.log(out.length ? out.join("\n") + "\nRun: node scripts/build.js" : `PASS build - ${outputs.size} generated files up to date`);
  process.exit(out.length ? 1 : 0);
}
for (const f of changed) {
  fs.mkdirSync(path.dirname(path.join(ROOT, f)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, f), outputs.get(f));
}
for (const f of stale) fs.unlinkSync(path.join(ROOT, f));
console.log(`build: ${changed.length} written, ${stale.length} removed, ${urls.length} URLs in sitemap.xml`);
for (const f of [...changed, ...stale.map((s) => s + " (removed)")]) console.log("  " + f);
