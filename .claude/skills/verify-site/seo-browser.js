// Browser SEO checks for check.js: the rendered <head> of each page, and a crawl from the home page for orphan pages
// and broken links. Returns [level, check, detail(, file)] entries; check.js prints them.
const fs = require("fs");

// Reads what a crawler sees after scripts have run.
async function checkHead(tab, { SITE, path, noindex }) {
  const origin = SITE.url.replace(/\/+$/, "");
  const f = await tab.evaluate(() => {
    const meta = (k) => [...document.querySelectorAll(`meta[name="${k}"],meta[property="${k}"]`)].map((m) => m.content);
    return {
      title: document.title,
      description: meta("description"),
      robots: meta("robots").join(","),
      canonical: [...document.querySelectorAll('link[rel="canonical"]')].map((l) => l.href),
      og: Object.fromEntries(["og:title", "og:description", "og:image", "og:url", "og:type", "twitter:card"].map((k) => [k, meta(k)[0]])),
      jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent),
      headings: [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName[1])),
      noAlt: [...document.querySelectorAll("img:not([alt])")].map((i) => i.src),
      htmlLinks: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => /^[^:]*\.html(#|$)/.test(h))
    };
  });
  const p = [];
  if (!f.title) p.push(["FAIL", "seo-title", "rendered page has no title"]);
  else if (!f.title.includes(SITE.artist) && !f.title.startsWith("[signal lost]")) p.push(["FAIL", "seo-title", `"${f.title}" doesn't name ${SITE.artist}`]);
  if (f.description.length !== 1 || !f.description[0]) p.push(["FAIL", "seo-description", `${f.description.length} meta descriptions`]);
  if (/noindex/.test(f.robots) !== noindex) p.push(["FAIL", "seo-robots", noindex ? "should be noindex" : `public page is "${f.robots}"`]);
  if (!noindex && (f.canonical.length !== 1 || f.canonical[0] !== origin + path)) p.push(["FAIL", "seo-canonical", `${f.canonical.join(", ") || "none"}, expected ${origin + path}`]);
  for (const [k, v] of Object.entries(f.og)) if (!v && !(k === "og:url" && path.startsWith("/this-address"))) p.push(["FAIL", "seo-open-graph", `missing ${k}`]);
  for (const t of f.jsonld) {
    try {
      const j = JSON.parse(t);
      if (/"(aggregateRating|review)"/.test(t)) p.push(["FAIL", "seo-jsonld", "ratings or reviews in structured data"]);
      if ([].concat(j).some((x) => x["@context"] !== "https://schema.org")) p.push(["FAIL", "seo-jsonld", "@context isn't https://schema.org"]);
    } catch (e) {
      p.push(["FAIL", "seo-jsonld", "invalid JSON: " + e.message]);
    }
  }
  if (!noindex && !f.jsonld.length) p.push(["WARN", "seo-jsonld", "no structured data"]);
  const h1 = f.headings.filter((h) => h === 1).length;
  if (h1 !== 1) p.push(["FAIL", "seo-h1", `${h1} h1 elements after rendering`]);
  f.headings.forEach((h, i) => i && h > f.headings[i - 1] + 1 && p.push(["FAIL", "seo-heading-order", `h${f.headings[i - 1]} followed by h${h} after rendering`]));
  for (const src of f.noAlt) p.push(["FAIL", "seo-img-alt", `${src} has no alt`]);
  for (const h of f.htmlLinks) p.push(["WARN", "seo-link-redirect", `link to ${h} goes through a redirect`]);
  return p;
}

// Breadth-first crawl of rendered pages from "/", following same-site links.
async function crawl(browser, base, SITE) {
  const origin = SITE.url.replace(/\/+$/, "");
  const sitemap = [...fs.readFileSync("sitemap.xml", "utf8").matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1].slice(origin.length) || "/");
  const seen = new Map([["/", "(start)"]]);
  const queue = ["/"];
  const out = [];
  const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  while (queue.length && seen.size < 200) {
    const p = queue.shift();
    const res = await tab.goto(base + p).catch(() => null);
    if (!res || res.status() >= 400) {
      out.push(["FAIL", "broken-link", `${p} returned ${res ? res.status() : "nothing"}`, seen.get(p)]);
      continue;
    }
    await tab.waitForTimeout(150);
    const links = await tab.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.href));
    for (const href of links) {
      if (!href.startsWith(base)) continue;
      const next = new URL(href).pathname;
      if (/\.(png|jpg|webp|xml|txt|css|js)$/.test(next) || seen.has(next)) continue;
      seen.set(next, p);
      queue.push(next);
    }
  }
  await tab.close();
  for (const p of sitemap) if (!seen.has(p)) out.push(["FAIL", "orphan-page", `${p} is in the sitemap but no page links to it`]);
  if (!out.length) out.push(["PASS", "crawl", `${seen.size} pages reached from the home page, every sitemap URL linked`]);
  return out;
}

module.exports = { checkHead, crawl };
