// Generates everything search engines read from data/: each page's <head> metadata, the trust pages (/privacy, /terms,
// /refunds, /security, /contact, /help, /license), one page per product (shop/) and
// per project release and news post (<project address>/music/, <project address>/news/), sitemap.xml, llms.txt (the site for AI assistants), the list of public URLs, and db/catalog.sql (the store database's copy of the catalog).
// Usage: node scripts/build.js [--check]
// --check writes nothing and exits 1 if any generated file is out of date (CI and the deploy run it before building).
const fs = require("fs");
const path = require("path");
const { ROOT, loadData, abs, projectPath, projectDir } = require("./lib/data");
const H = require("./lib/head");
const P = require("./lib/pages");
const C = require("./lib/catalog");
const V = require("../server/discovery/vocabulary.js");
const PL = require("./lib/platform");
const { platformSql } = require("./lib/platform-catalog");
const { llmsTxt } = require("./lib/llms");
const { creatorPage, projectCard } = require("./lib/creator-page");
const { trustPages } = require("./lib/trust-pages");

const check = process.argv.includes("--check");
const data = loadData();
const { SITE } = data;
const errors = [];
const outputs = new Map(); // file -> content

// ---------- hand-written pages: every *.html in the root and in each creator's folder ----------
// A creator's space is /<creator> (data/creators.js; its profile page <creator>.html is generated below), and each of
// its projects' pages are <creator>/<project>.html and <creator>/<project>/ (scripts/lib/data.js projectPath).
// Each writes its own <title> and <meta name="description">, except the home page (from data/site.js) and each
// project's home, <its folder>.html (from its entry in data/projects.js); everything else in the head block is
// generated. A page opts out of search with its own <meta name="robots" content="noindex">.
const PAGE_TYPES = { music: "CollectionPage", shop: "CollectionPage", news: "CollectionPage", projects: "CollectionPage", explore: "CollectionPage", press: "AboutPage", about: "AboutPage" };
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const strip = (html) => html.replace(new RegExp(`${H.START.slice(0, 15)}[\\s\\S]*?${H.END}`), "");
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const htmlUnder = (dir) => (fs.existsSync(path.join(ROOT, dir)) ? fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }) : [])
  .flatMap((d) => (d.isDirectory() ? htmlUnder(`${dir}/${d.name}`) : d.name.endsWith(".html") ? [`${dir}/${d.name}`] : []));

const creatorDirs = data.creators.map((c) => c.id);
const handPages = [...fs.readdirSync(ROOT).filter((f) => f.endsWith(".html")), ...creatorDirs.flatMap(htmlUnder)].filter((f) => !read(f).includes(P.GENERATED))
  .sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b)));
const pages = []; // every page with its metadata, for the sitemap
const projectById = new Map(data.projects.map((x) => [x.id, x]));

for (const file of handPages) {
  const html = read(file);
  const rest = strip(html);
  const attr = (name) => (html.match(new RegExp(`<body[^>]*\\s${name}="([^"]*)"`)) || [])[1];
  const key = attr("data-page");
  const project = projectById.get(attr("data-project"));
  const isHome = file === "index.html";
  const projectHome = project && file === `${projectDir(project.id)}.html` ? project : null;
  const own = isHome ? SITE : projectHome;
  const title = own ? own.title : decode((rest.match(/<title>([^<]*)<\/title>/) || [])[1] || "");
  const description = own ? own.description : decode((rest.match(/<meta name="description" content="([^"]*)">/) || [])[1] || "");
  if (!title) errors.push(`${file}: add a <title> above the seo block${projectHome ? " (or title in data/projects.js)" : ""}`);
  if (!description) errors.push(`${file}: add a <meta name="description" content="..."> above the seo block`);
  if (own && /<title>/.test(rest)) errors.push(`${file}: this page's title comes from data/ (${isHome ? "site.js" : "projects.js"}); remove its own <title>`);
  if (creatorDirs.some((d) => file.startsWith(d + "/")) && !project) errors.push(`${file}: add data-project="<id>" (an id in data/projects.js) to <body>`);
  if (!html.includes(H.START.slice(0, 15)) || !html.includes(H.END)) {
    errors.push(`${file}: add the two seo markers in <head> (copy them from shop.html)`);
    continue;
  }
  const index = !/<meta name="robots" content="[^"]*noindex/.test(rest);
  const p = isHome ? "/" : file === "404.html" ? null : "/" + file.replace(/\.html$/, "");
  const name = title.split(" · ")[0];
  const page = { file, path: p, title, description, ownTitle: !own, ownRobots: !index, index: index && Boolean(p), ogType: "website", schema: [],
    image: project ? project.image : undefined };

  if (isHome) {
    page.schema = [H.website(SITE), H.organization(SITE), H.webPage(SITE, page, "WebPage", { about: { "@id": abs(SITE, "/#organization") } })];
  } else if (page.index) {
    const crumbs = project
      ? [["Home", "/"], ...P.ownerCrumb(data, project), ...(projectHome ? [] : [[project.name, projectPath(project.id)]]), [projectHome ? project.name : name, p]]
      : [["Home", "/"], [name, p]];
    const ofProject = (x) => !project || x.project === project.id;
    const lists = {
      music: data.releases.filter(ofProject).map((r) => [r.title, projectPath(r.project, "music", r.id)]),
      shop: data.products.filter((x) => !x.draft).map((x) => [x.title, "/shop/" + x.id]),
      news: [...data.news].filter(ofProject).sort((a, b) => b.date.localeCompare(a.date)).map((n) => [n.title, projectPath(n.project, "news", n.id)]),
      projects: data.projects.filter((x) => !x.draft).map((x) => [x.name, projectPath(x.id)])
    }[key];
    const extra = { breadcrumb: H.breadcrumbs(SITE, crumbs) };
    if (lists && lists.length) extra.mainEntity = H.itemList(SITE, lists);
    if (project && (projectHome || key === "press")) extra.about = { "@id": abs(SITE, projectPath(project.id)) + "#project" };
    if (key === "about" && !project) extra.about = { "@id": abs(SITE, "/#organization") };
    page.schema = [H.webPage(SITE, page, (!projectHome && PAGE_TYPES[key]) || "WebPage", extra),
      ...(project && (projectHome || key === "press") ? [H.projectEntity(SITE, project)] : []),
      ...(key === "about" && !project ? [H.organization(SITE)] : [])];
  }
  const block = H.headBlock(SITE, page);
  // A list between <!-- projects:start --> and <!-- projects:end --> gets a plain link per published project, so the
  // project pages are linked in the HTML itself (js/projects.js upgrades the list to cards with follow controls).
  const projectLinks = data.projects.filter((x) => !x.draft).map(projectCard).join("");
  outputs.set(file, html.replace(new RegExp(`${H.START.slice(0, 15)}[^\\n]*\\n[\\s\\S]*?${H.END}`), () => block)
    .replace(/(<!-- projects:start[^>]*-->)[\s\S]*?(<!-- projects:end -->)/g, (m, a, b) => `${a}${projectLinks}${b}`));
  pages.push(page);
}

// ---------- generated pages ----------
const generated = [
  ...data.releases.map((r) => P.releasePage(SITE, data, r)),
  ...data.products.map((x) => P.productPage(SITE, data, x)),
  ...data.news.map((n) => P.newsPage(SITE, data, n)),
  ...data.creators.filter((c) => !c.draft).map((c) => creatorPage(SITE, data, c)),
  ...trustPages(SITE, data)
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
errors.push(...C.validate(data.products, data.productTypes, data.projects));
errors.push(...PL.validate(data));
outputs.set("db/catalog.sql", C.catalogSql(data.products, data.productTypes, data.projects) + platformSql(data));
// The store vocabulary for the browser (labels and which filters apply to which kind), from the API's own copy.
outputs.set("data/vocabulary.js", `// The store's controlled vocabulary for the browser: facet labels and values, which facets apply to each kind of
// product, specs and the BPM range. Generated by scripts/build.js from server/discovery/vocabulary.js; don't edit.
window.VOCABULARY = ${JSON.stringify(V.browserVocabulary(), null, 1)};
`);

// The words the processing engine suggests values from, for its conformance suite (the server sends the same object with
// each job): engine/conformance/vocabulary.json.
outputs.set("engine/conformance/vocabulary.json", `${JSON.stringify(V.engineVocabulary(), null, 2)}\n`);

// Kinds of content for the browser (Your Stacc, the admin's kind picker), from the same vocabulary as the engine and store.
const kindsForBrowser = V.contentTypes();
outputs.set("data/content-types.js", `// Kinds of content inside Pacs (One-shots, Loops, MIDI, Presets, ...): Your Stacc groups and filters files by them, and
// a file of unknown kind is filed by its extension (formats, first match in this order). ALIASES: old names that still
// mean a kind (\"samples\" is \"one-shots\"). Generated by scripts/build.js from server/discovery/vocabulary.js (KINDS,
// FORMATS); don't edit: a new kind or format is one entry there.
window.CONTENT_TYPES = ${JSON.stringify(kindsForBrowser.types, null, 1)};
window.CONTENT_TYPE_ALIASES = ${JSON.stringify(kindsForBrowser.aliases, null, 1)};
`);

// Generated files that no longer match any data entry (an id was removed or made a draft) are deleted.
const stale = [];
// (music/ and news/ at the root, then projects/, held the pages before they moved to their creator's space.)
const rootHtml = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));
for (const f of [...rootHtml, ...["music", "shop", "news", "projects", ...creatorDirs].flatMap(htmlUnder)]) {
  if (!outputs.has(f) && read(f).includes(P.GENERATED)) stale.push(f);
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

// ---------- llms.txt: the site in plain text for AI assistants ----------
outputs.set("llms.txt", llmsTxt(data));

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
for (const f of stale) {
  fs.unlinkSync(path.join(ROOT, f));
  // A folder emptied by the removal goes too (music/, news/ and projects/ once their pages moved).
  const dir = path.dirname(path.join(ROOT, f));
  if (!fs.readdirSync(dir).length) fs.rmdirSync(dir);
}
console.log(`build: ${changed.length} written, ${stale.length} removed, ${urls.length} URLs in sitemap.xml`);
for (const f of [...changed, ...stale.map((s) => s + " (removed)")]) console.log("  " + f);
