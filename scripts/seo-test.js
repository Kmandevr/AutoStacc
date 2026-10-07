// SEO regression tests, no browser and no dependencies: page metadata, canonicals, JSON-LD, sitemap, robots.txt,
// redirects, recorded public URLs, placeholder identity data and brand spelling. Prints PASS/WARN/FAIL lines.
// Usage: node scripts/seo-test.js   (exit 1 on any FAIL). The rendered-head and crawl checks are in verify-site.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { ROOT, loadData, origin } = require("./lib/data");

const out = [];
const add = (level, check, detail, file) => out.push(`${level} ${check} - ${detail}${file ? ` (${file})` : ""}`);
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const exists = (f) => fs.existsSync(path.join(ROOT, f));
const data = loadData();
const { SITE } = data;
const ORIGIN = origin(SITE);
const ARTIST = SITE.artist;
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&amp;/g, "&");

// ---------- the build is current ----------
try {
  execFileSync("node", [path.join(ROOT, "scripts/build.js"), "--check"], { stdio: "pipe" });
  add("PASS", "build", "generated pages, heads and sitemap match data/");
} catch (e) {
  const msg = (String(e.stdout || "") + String(e.stderr || "")).trim().split("\n")[0].replace(/^FAIL build - /, "");
  add("FAIL", "build", msg + " (run node scripts/build.js)");
}

// ---------- pages ----------
const pageFiles = [
  ...fs.readdirSync(ROOT).filter((f) => f.endsWith(".html")),
  ...["music", "shop", "news"].filter(exists).flatMap((d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith(".html")).map((f) => `${d}/${f}`))
];
const urlPath = (f) => (f === "index.html" ? "/" : "/" + f.replace(/\.html$/, ""));
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]));
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((m) => attrs(m[0]));
const metaVal = (head, key) => tags(head, "meta").filter((m) => m.name === key || m.property === key).map((m) => m.content);
const draftProducts = new Set(data.products.filter((p) => p.draft).map((p) => `shop/${p.id}.html`));
const EXPECT_NOINDEX = (f) => f === "404.html" || draftProducts.has(f);
const BAD_HOST = /localhost|127\.0\.0\.1|0\.0\.0\.0|\.pages\.dev|example\.(com|org|net)|\.local\b/i;

const pages = {}; // file -> facts
// A canonical must be an address on this site that a page file serves.
const servedPathsOf = (u) => u.startsWith(ORIGIN + "/") && pageFiles.some((f) => ORIGIN + urlPath(f) === u.split(/[?#]/)[0]);
const titles = new Map(), descriptions = new Map();
for (const f of pageFiles) {
  const html = read(f);
  const head = (html.match(/<head>([\s\S]*?)<\/head>/i) || [])[1] || "";
  const title = decode(((head.match(/<title>([^<]*)<\/title>/g) || []).map((t) => t.slice(7, -8)))[0] || "");
  const descs = metaVal(head, "description");
  const robots = metaVal(head, "robots").join(",");
  const canon = tags(head, "link").filter((l) => l.rel === "canonical").map((l) => l.href);
  const noindex = /noindex/i.test(robots);
  pages[f] = { html, head, title, noindex, canon, path: urlPath(f) };

  if ((head.match(/<title>/g) || []).length !== 1) add("FAIL", "title", `${(head.match(/<title>/g) || []).length} <title> tags`, f);
  if (!title) add("FAIL", "title", "missing", f);
  else {
    if (!title.includes(ARTIST)) add("FAIL", "title-brand", `"${title}" doesn't name ${ARTIST}`, f);
    if (title.length > 70) add("WARN", "title-length", `${title.length} chars, search results cut at ~60-70`, f);
  }
  if (descs.length !== 1) add("FAIL", "description", `${descs.length} meta descriptions`, f);
  else if (descs[0].length < 50 || descs[0].length > 170) add("WARN", "description-length", `${descs[0].length} chars (aim for 50-160)`, f);
  if (!/<meta name="viewport"/.test(head)) add("FAIL", "viewport", "missing", f);
  if (!/<html[^>]*\slang="en"/.test(html)) add("FAIL", "lang", "missing lang", f);
  if (!/<meta charset="utf-8">/i.test(head)) add("FAIL", "charset", "missing", f);
  if (BAD_HOST.test(head)) add("FAIL", "head-host", `head mentions ${head.match(BAD_HOST)[0]}`, f);

  if (noindex && !EXPECT_NOINDEX(f)) add("FAIL", "noindex", `public page is noindex (${robots})`, f);
  if (!noindex && EXPECT_NOINDEX(f)) add("FAIL", "noindex", "should be noindex (404 page or draft product)", f);
  if (noindex && canon.length) add("FAIL", "canonical", `noindex page names a canonical (${canon.join(", ")})`, f);
  for (const c of canon) if (!servedPathsOf(c)) add("FAIL", "canonical", `${c} isn't a page on this site`, f);
  if (!noindex) {
    if (canon.length !== 1) add("FAIL", "canonical", `${canon.length} canonical links`, f);
    else if (canon[0] !== ORIGIN + pages[f].path) add("FAIL", "canonical", `${canon[0]} should be ${ORIGIN + pages[f].path}`, f);
    const t = title, d = descs[0];
    if (titles.has(t)) add("FAIL", "duplicate-title", `same title as ${titles.get(t)}`, f); else titles.set(t, f);
    if (descriptions.has(d)) add("FAIL", "duplicate-description", `same description as ${descriptions.get(d)}`, f); else descriptions.set(d, f);
  }
  for (const k of ["og:title", "og:description", "og:image", "og:type", "og:site_name", "twitter:card"]) {
    if (!metaVal(head, k).length) add("FAIL", "open-graph", `missing ${k}`, f);
  }
  const ogImage = metaVal(head, "og:image")[0] || "";
  if (ogImage && !ogImage.startsWith(ORIGIN + "/")) add("FAIL", "og-image", `${ogImage} is not on ${ORIGIN}`, f);
  if (ogImage && !exists(ogImage.slice(ORIGIN.length + 1))) add("FAIL", "og-image", `${ogImage} doesn't exist`, f);
  if (!noindex && metaVal(head, "og:url")[0] !== canon[0]) add("FAIL", "og-url", "og:url doesn't match the canonical", f);
  if (metaVal(head, "og:site_name")[0] && metaVal(head, "og:site_name")[0] !== ARTIST) add("FAIL", "og-site-name", `should be ${ARTIST}`, f);

  // Headings written in the HTML (generated lists add theirs at runtime; verify-site checks the rendered page).
  const h1s = (html.match(/<h1\b/g) || []).length;
  if (h1s !== 1) add("FAIL", "h1", `${h1s} h1 elements`, f);
  const levels = [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
  levels.forEach((l, i) => i && l > levels[i - 1] + 1 && add("FAIL", "heading-order", `h${levels[i - 1]} followed by h${l}`, f));
  for (const img of tags(html, "img")) {
    if (!("alt" in img)) add("FAIL", "img-alt", `${img.src} has no alt`, f);
    if (!img.width || !img.height) add("WARN", "img-size", `${img.src} has no width/height (layout shift)`, f);
  }
}

// ---------- internal links in the HTML resolve to real pages, without redirect hops ----------
const servedPaths = new Set(Object.values(pages).map((p) => p.path));
for (const [f, p] of Object.entries(pages)) {
  for (const m of p.html.matchAll(/\shref="([^"]+)"/g)) {
    const href = decode(m[1]);
    if (/^(https?:|mailto:|#)/.test(href) || href.startsWith("//")) continue;
    const clean = href.split(/[?#]/)[0];
    if (/\.(css|png|jpg|webp|ico|svg|js)$/.test(clean)) { if (!exists(clean.slice(1))) add("FAIL", "broken-asset", href, f); continue; }
    if (!href.startsWith("/")) add("WARN", "relative-link", `${href}: use a root-relative clean address`, f);
    else if (clean.endsWith(".html")) add("WARN", "link-redirect", `${href} redirects; link to ${clean.replace(/(index)?\.html$/, "")}`, f);
    else if (!servedPaths.has(clean)) add("FAIL", "broken-link", href, f);
  }
}

// ---------- structured data ----------
const REQUIRED = {
  WebSite: ["name", "url"], MusicGroup: ["name", "url"], MusicAlbum: ["name", "url", "byArtist", "datePublished", "track"],
  MusicRecording: ["name"], Product: ["name", "description", "offers", "brand", "url"], Offer: ["price", "priceCurrency", "availability"],
  BlogPosting: ["headline", "datePublished", "author", "url"], BreadcrumbList: ["itemListElement"], ItemList: ["itemListElement"],
  WebPage: ["url", "name"], CollectionPage: ["url", "name"], AboutPage: ["url", "name"], ItemPage: ["url", "name"], ListItem: ["position"]
};
const URL_KEYS = new Set(["url", "item", "@id", "image", "logo", "sameAs", "mainEntityOfPage", "availability", "albumReleaseType"]);
function walk(node, f, typesSeen) {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, f, typesSeen));
  if (!node || typeof node !== "object") return;
  for (const k of ["aggregateRating", "review", "reviews", "ratingValue"]) if (k in node) add("FAIL", "fake-reviews", `${k} found: no ratings or reviews unless they are real and on the page`, f);
  const type = node["@type"];
  if (type) {
    typesSeen.add(type);
    if (!REQUIRED[type]) add("WARN", "jsonld-type", `unexpected @type ${type}`, f);
    for (const k of REQUIRED[type] || []) if (node[k] === undefined || node[k] === "") add("FAIL", "jsonld-required", `${type} missing ${k}`, f);
    if (type === "ListItem" && !node.item && !node.url) add("FAIL", "jsonld-required", "ListItem needs item or url", f);
  }
  for (const [k, v] of Object.entries(node)) {
    if (URL_KEYS.has(k)) {
      for (const u of [].concat(v).filter((x) => typeof x === "string")) {
        let ok = false;
        try { ok = new URL(u).protocol === "https:"; } catch {}
        if (!ok) add("FAIL", "jsonld-url", `${k}: "${u}" is not an absolute https URL`, f);
        else if (BAD_HOST.test(u)) add("FAIL", "jsonld-url", `${k}: ${u}`, f);
        else if (k !== "sameAs" && !u.startsWith("https://schema.org/") && !u.startsWith(ORIGIN + "/")) add("WARN", "jsonld-url", `${k}: ${u} is off-site`, f);
      }
    }
    if (typeof v === "object") walk(v, f, typesSeen);
  }
}
const jsonTypes = {};
for (const [f, p] of Object.entries(pages)) {
  const seen = new Set();
  for (const m of p.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let json;
    try { json = JSON.parse(m[1]); } catch (e) { add("FAIL", "jsonld-parse", e.message, f); continue; }
    if (json["@context"] !== "https://schema.org") add("FAIL", "jsonld-context", "@context should be https://schema.org", f);
    walk(json, f, seen);
    for (const g of [].concat(json["@graph"] || json)) {
      if (g["@type"] === "MusicGroup" && g.name !== ARTIST) add("FAIL", "jsonld-brand", `MusicGroup name "${g.name}"`, f);
    }
  }
  jsonTypes[f] = seen;
}
const needs = (f, type, why) => pages[f] && !jsonTypes[f].has(type) && add("FAIL", "jsonld-missing", `${type} expected (${why})`, f);
needs("index.html", "WebSite", "home page");
needs("index.html", "MusicGroup", "home page");
for (const r of data.releases) needs(`music/${r.id}.html`, "MusicAlbum", "release page");
for (const n of data.news) needs(`news/${n.id}.html`, "BlogPosting", "news post");
for (const pr of data.products) {
  const f = `shop/${pr.id}.html`;
  if (pr.draft && jsonTypes[f] && jsonTypes[f].has("Product")) add("FAIL", "jsonld-draft", "draft product must not publish Product data", f);
  if (!pr.draft) needs(f, "Product", "public product");
}
for (const [f, p] of Object.entries(pages)) if (!p.noindex && f !== "index.html") needs(f, "BreadcrumbList", "every indexable page below home");
const home = pages["index.html"] && pages["index.html"].html;
if (home && !/"sameAs"/.test(home)) add("WARN", "same-as", "no official profiles in data/site.js socials yet");

// ---------- sitemap.xml ----------
const sitemap = exists("sitemap.xml") ? read("sitemap.xml") : "";
const locs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => decode(m[1]));
if (!/^<\?xml version="1\.0" encoding="UTF-8"\?>/.test(sitemap)) add("FAIL", "sitemap-xml", "missing XML declaration");
if (!/<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/.test(sitemap)) add("FAIL", "sitemap-xml", "missing sitemap urlset namespace");
const body = sitemap.replace(/<\?xml[^>]*\?>/, "").replace(/<!--[\s\S]*?-->/g, "");
const stack = [];
for (const m of body.matchAll(/<(\/?)([a-z]+)[^>]*>/g)) {
  if (!m[1]) stack.push(m[2]);
  else if (stack.pop() !== m[2]) { add("FAIL", "sitemap-xml", `unbalanced </${m[2]}>`); break; }
}
if (stack.length) add("FAIL", "sitemap-xml", `unclosed <${stack.join("><")}>`);
if (/&(?!amp;|lt;|gt;|quot;|apos;)/.test(body)) add("FAIL", "sitemap-xml", "unescaped &");
if (!locs.length) add("FAIL", "sitemap", "no URLs");
const PRIVATE = /^\/(account|login|admin|checkout|cart|api|private)(\/|$)/;
const byPath = Object.fromEntries(Object.entries(pages).map(([f, p]) => [p.path, f]));
locs.forEach((u, i) => {
  if (locs.indexOf(u) !== i) add("FAIL", "sitemap-duplicate", u);
  if (!u.startsWith(ORIGIN + "/")) return add("FAIL", "sitemap-url", `${u} is not on ${ORIGIN}`);
  if (BAD_HOST.test(u) || /[?#]/.test(u) || (u.endsWith("/") && u !== ORIGIN + "/")) add("FAIL", "sitemap-url", `${u} isn't a clean canonical address`);
  const p = u.slice(ORIGIN.length);
  if (PRIVATE.test(p)) add("FAIL", "sitemap-private", u);
  const f = byPath[p];
  if (!f) add("FAIL", "sitemap-url", `${u} has no page`);
  else if (pages[f].noindex) add("FAIL", "sitemap-noindex", `${u} is noindex`);
  else if (pages[f].canon[0] !== u) add("FAIL", "sitemap-canonical", `${u} canonical is ${pages[f].canon[0]}`);
});
for (const [f, p] of Object.entries(pages)) if (!p.noindex && !locs.includes(ORIGIN + p.path)) add("FAIL", "sitemap-missing", `${ORIGIN + p.path} not in sitemap.xml`, f);
if (locs.length && !out.some((l) => l.startsWith("FAIL sitemap"))) add("PASS", "sitemap", `${locs.length} canonical public URLs, valid XML`);

// ---------- robots.txt ----------
const robots = exists("robots.txt") ? read("robots.txt") : "";
if (!robots) add("FAIL", "robots", "robots.txt missing");
if (!new RegExp(`^Sitemap: ${ORIGIN.replace(/\./g, "\\.")}/sitemap\\.xml$`, "m").test(robots)) add("FAIL", "robots", `no "Sitemap: ${ORIGIN}/sitemap.xml" line`);
// Rules for "*" (Google's matching: the longest matching rule wins; Allow wins a tie).
const rules = [];
let star = false;
for (const line of robots.split("\n").map((l) => l.replace(/#.*/, "").trim()).filter(Boolean)) {
  const [k, ...v] = line.split(":");
  const val = v.join(":").trim();
  if (/^user-agent$/i.test(k)) star = val === "*";
  else if (star && /^(allow|disallow)$/i.test(k) && val) rules.push([k.toLowerCase(), val]);
}
const allowed = (p) => {
  const hits = rules.filter(([, v]) => p.startsWith(v.replace(/\*.*$/, "")));
  if (!hits.length) return true;
  const len = Math.max(...hits.map(([, v]) => v.length));
  return hits.some(([k, v]) => v.length === len && k === "allow");
};
for (const u of locs) if (!allowed(u.slice(ORIGIN.length))) add("FAIL", "robots-blocks", `${u} is blocked by robots.txt`);
for (const p of ["/css/base.css", "/js/util.js", "/data/site.js", "/img/og.png"]) if (!allowed(p)) add("FAIL", "robots-blocks", `${p} is blocked (pages need it to render)`);
for (const p of ["/account", "/login", "/admin", "/checkout", "/cart", "/api/", "/private/"]) if (allowed(p)) add("FAIL", "robots-private", `${p} is crawlable`);
if (robots && !out.some((l) => /^FAIL robots/.test(l))) add("PASS", "robots", "public pages crawlable, private areas blocked, sitemap declared");

// ---------- redirects, recorded URLs and preview hosts ----------
const redirects = exists("_redirects") ? read("_redirects").split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => l.trim().split(/\s+/)) : [];
for (const [from, to, code] of redirects) {
  if (locs.includes(ORIGIN + from)) add("FAIL", "redirect-public", `${from} is in the sitemap but redirects to ${to}`);
  if (!["301", "308"].includes(code)) add("WARN", "redirect-code", `${from} -> ${to} uses ${code || "302"}; permanent moves should be 301`);
  if (to !== "/" && !to.startsWith("http") && !servedPaths.has(to)) add("FAIL", "redirect-target", `${from} -> ${to} goes nowhere`);
}
const recorded = exists("scripts/public-urls.txt") ? read("scripts/public-urls.txt").split("\n").filter((l) => l && !l.startsWith("#")) : [];
for (const u of recorded) {
  const p = u.slice(ORIGIN.length);
  if (!locs.includes(u) && !redirects.some(([from]) => from === p)) {
    add("FAIL", "url-disappeared", `${u} was public and is gone: add a 301 in _redirects, or remove it from scripts/public-urls.txt if that's deliberate`);
  }
}
const headers = exists("_headers") ? read("_headers") : "";
if (!/https:\/\/:project\.pages\.dev\/\*\s+X-Robots-Tag: noindex/.test(headers)) add("WARN", "preview-noindex", "_headers doesn't keep *.pages.dev out of search");
if (/^\/\*\s*\n\s+X-Robots-Tag:\s*noindex/m.test(headers)) add("FAIL", "headers-noindex", "_headers sends noindex for every page on every host");
const deploy = exists(".github/workflows/deploy.yml") ? read(".github/workflows/deploy.yml") : "";
for (const f of ["_headers", "robots.txt", "sitemap.xml", "_redirects"]) if (deploy && !deploy.includes(f)) add("FAIL", "deploy", `deploy.yml doesn't publish ${f}`);

// ---------- identity data: no placeholders shipped ----------
const isProfile = (u) => { try { const x = new URL(u); return x.protocol === "https:" && x.pathname.replace(/\/+$/, "") !== ""; } catch { return false; } };
for (const s of SITE.socials || []) {
  if (s.url && !isProfile(s.url)) add("FAIL", "placeholder-profile", `${s.name}: "${s.url}" isn't a profile page (leave it "" until it exists)`, "data/site.js");
  if (s.url && BAD_HOST.test(s.url)) add("FAIL", "placeholder-profile", `${s.name}: ${s.url}`, "data/site.js");
}
for (const r of data.releases) for (const l of r.links || []) if (l.url && !isProfile(l.url)) add("FAIL", "placeholder-link", `${r.id} ${l.name}: "${l.url}"`, "data/music.js");
if (SITE.email && (BAD_HOST.test(SITE.email) || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(SITE.email))) add("FAIL", "placeholder-email", `"${SITE.email}" isn't a real address`, "data/site.js");
if (!SITE.email) add("WARN", "contact", "no booking email set yet (issue #7)", "data/site.js");
if (SITE.url !== "https://autostacc.com") add("FAIL", "site-url", `SITE.url is ${SITE.url}`, "data/site.js");
if (!SITE.title || !SITE.title.startsWith(ARTIST)) add("FAIL", "home-title", "SITE.title must start with the artist name", "data/site.js");
const drafts = data.products.filter((p) => p.draft).length;
if (drafts) add("WARN", "drafts", `${drafts} placeholder product(s) kept out of search (issue #5)`, "data/products.js");

// ---------- brand spelling across everything published ----------
const published = [...pageFiles, ...["js", "data"].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith(".js")).map((f) => `${d}/${f}`)), "sitemap.xml", "robots.txt"];
const MISSPELL = [
  [/Glitches\s*(?:&amp;|&)\s*Stitch(?!es)/, "Glitches & Stitch"],
  [/(?<![\w/-])Stiches\b|Glitches\s*(?:&amp;|&)\s*Stiches/i, "Stiches"],
  [/Glitch\s*(?:&amp;|&)\s*Stitches/, "Glitch & Stitches"],
  [/Glitches\s+and\s+Stitches/i, "Glitches and Stitches"],
  [/\bAutoStacc\b/, "AutoStacc (the artist is Glitches & Stitches; the domain is autostacc.com)"]
];
for (const f of published) {
  const text = read(f).split("\n").filter((l) => !/alternateNames|"alternateName"|^\s*"Glitches and Stitches"\s*$/.test(l)).join("\n");
  for (const [re, name] of MISSPELL) if (re.test(text)) add("FAIL", "brand-spelling", `"${name}" found`, f);
}

// ---------- report ----------
const fails = out.filter((l) => l.startsWith("FAIL")), warns = out.filter((l) => l.startsWith("WARN"));
console.log(out.join("\n"));
console.log(`\n${fails.length ? "FAIL" : warns.length ? "WARN" : "PASS"}: ${fails.length} fail, ${warns.length} warn across ${pageFiles.length} pages and ${locs.length} sitemap URLs`);
process.exit(fails.length ? 1 : 0);
