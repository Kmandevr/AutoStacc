// Runs the site checks and prints one line per result: PASS / WARN / FAIL <check> - <detail> (<file>).
// Usage: NODE_PATH=$(npm root -g) node .claude/skills/verify-site/check.js [page.html ...]
// Needs Playwright with Chromium (preinstalled in cloud sessions at /opt/pw-browsers/chromium).
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execFileSync } = require("child_process");

const root = process.cwd();
const pages = process.argv.length > 2 ? process.argv.slice(2) : fs.readdirSync(root).filter((f) => f.endsWith(".html"));
const out = [];
const add = (level, check, detail, file) => out.push(`${level} ${check} - ${detail}${file ? ` (${file})` : ""}`);
const DATA_GLOBALS = { SITE: "data/site.js", PRODUCTS: "data/products.js", NEWS: "data/news.js", SHOWS: "data/shows.js", MUSIC: "data/music.js" };

// ---------- static checks: no browser needed ----------
for (const f of ["js", "data"].flatMap((d) => fs.readdirSync(path.join(root, d)).filter((n) => n.endsWith(".js")).map((n) => `${d}/${n}`))) {
  try { execFileSync("node", ["--check", f], { stdio: "pipe" }); }
  catch (e) { add("FAIL", "js-syntax", String(e.stderr).split("\n")[0], f); }
}
for (const f of fs.readdirSync(path.join(root, "css")).filter((n) => n.endsWith(".css")).map((n) => `css/${n}`)) {
  const css = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const open = (css.match(/{/g) || []).length, close = (css.match(/}/g) || []).length;
  if (open !== close) add("FAIL", "css-braces", `${open} "{" vs ${close} "}"`, f);
}
for (const page of pages) {
  const html = fs.readFileSync(page, "utf8");
  const refs = [...html.matchAll(/(?:src|href)="([^"#?:]+\.(?:js|css|html|png|jpg|svg|ico|webp))"/g)].map((m) => m[1]);
  for (const r of refs) if (!fs.existsSync(r)) add("FAIL", "broken-reference", `missing ${r}`, page);
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  for (const s of scripts.filter((s) => s.startsWith("js/") && fs.existsSync(s))) {
    const used = [...new Set([...fs.readFileSync(s, "utf8").matchAll(/window\.(SITE|PRODUCTS|NEWS|SHOWS|MUSIC)\b/g)].map((m) => m[1]))];
    for (const g of used) if (!scripts.includes(DATA_GLOBALS[g])) add("FAIL", "missing-data-script", `${s} reads window.${g} but the page does not load ${DATA_GLOBALS[g]}`, page);
    if (!scripts.includes("js/util.js") && /window\.GS/.test(fs.readFileSync(s, "utf8"))) add("FAIL", "missing-util", `${s} needs js/util.js loaded first`, page);
  }
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  for (const id of ids.filter((x, i) => ids.indexOf(x) !== i)) add("FAIL", "duplicate-id", `#${id}`, page);
  if (!/<html[^>]*\slang=/.test(html)) add("WARN", "html-lang", "missing lang attribute", page);
  if (!/<meta name="viewport"/.test(html)) add("FAIL", "viewport", "missing viewport meta", page);
  if (!/<title>[^<]+<\/title>/.test(html)) add("WARN", "title", "missing <title>", page);
  for (const m of html.matchAll(/<img\b(?![^>]*\balt=)[^>]*>/g)) add("WARN", "img-alt", "img without alt", page);
}

// ---------- browser checks ----------
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/home.html"));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
  res.writeHead(200, { "Content-Type": types[path.extname(p)] || "application/octet-stream" });
  res.end(fs.readFileSync(p));
});

(async () => {
  let chromium;
  try { ({ chromium } = require("playwright")); }
  catch { add("WARN", "browser", "playwright not found; set NODE_PATH=$(npm root -g). Browser checks skipped"); return; }
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined });
  for (const page of pages) {
    for (const width of [1280, 390]) {
      const tab = await browser.newPage({ viewport: { width, height: 800 } });
      const problems = [];
      tab.on("pageerror", (e) => problems.push(["FAIL", "runtime-error", String(e)]));
      tab.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && problems.push(["FAIL", "console-error", m.text()]));
      tab.on("response", (r) => r.url().startsWith(base) && r.status() >= 400 && problems.push(["FAIL", "http-" + r.status(), r.url().replace(base, "")]));
      tab.on("requestfailed", (r) => !r.url().startsWith(base) && problems.push(["WARN", "external-request", `${r.url().slice(0, 60)} failed (offline sandbox?)`]));
      await tab.goto(`${base}/${page}`);
      await tab.waitForTimeout(250);
      const facts = await tab.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        header: !!document.querySelector(".site-header .nav"),
        footer: !!document.querySelector(".site-footer .wrap"),
        empty: [...document.querySelectorAll("[id$='-list'],[id$='-grid'],[id^='featured'],[id^='latest']")].filter((e) => !e.children.length).map((e) => "#" + e.id),
        smallTargets: [...document.querySelectorAll("a,button")].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.height < 24 || r.width < 24); }).length
      }));
      if (facts.overflow > 0) problems.push(["FAIL", `overflow-${width}`, `page is ${facts.overflow}px wider than the viewport`]);
      if (!facts.header || !facts.footer) problems.push(["FAIL", "chrome", "header or footer did not render"]);
      for (const id of facts.empty) problems.push(["WARN", "empty-container", `${id} rendered nothing`]);
      if (width === 390 && facts.smallTargets) problems.push(["WARN", "tap-targets", `${facts.smallTargets} links/buttons smaller than 24px`]);
      if (width === 390) {
        const toggle = tab.locator(".nav-toggle");
        if (await toggle.isVisible()) {
          await toggle.click();
          if (!(await tab.locator(".nav.open").count())) problems.push(["FAIL", "nav-toggle", "menu did not open"]);
        } else problems.push(["WARN", "nav-toggle", "menu button not visible at 390px"]);
      }
      if (page === "shop.html" && width === 1280) {
        const before = await tab.locator(".card").count();
        const buttons = tab.locator("#shop-filters button");
        if ((await buttons.count()) > 2) {
          await buttons.nth(1).click();
          await tab.waitForTimeout(300); // the filter swaps cards inside a view transition, a frame or two later
          const after = await tab.locator(".card").count();
          if (!(after > 0 && after < before)) problems.push(["FAIL", "shop-filter", `cards ${before} -> ${after} after choosing a category`]);
          await buttons.nth(0).click();
          await tab.waitForTimeout(300);
          if ((await tab.locator(".card").count()) !== before) problems.push(["FAIL", "shop-filter", "'All' did not restore the full list"]);
        } else problems.push(["WARN", "shop-filter", "fewer than two categories, filter not exercised"]);
      }
      if (page === "home.html" && width === 1280 && (await tab.locator("#newsletter-form").count())) {
        await tab.fill("#newsletter-form input[type=email]", "test@example.com");
        await tab.click("#newsletter-form button");
        if (!(await tab.locator("#newsletter-msg").innerText()).trim() && !(await tab.url()).includes("?")) problems.push(["WARN", "newsletter", "submitting showed no message"]);
      }
      for (const [level, check, detail] of problems) add(level, `${check}@${width}`, detail, page);
      await tab.close();
    }
  }
  await browser.close();
})().catch((e) => add("FAIL", "checker", String(e.message || e).split("\n")[0])).finally(() => {
  server.close();
  const fails = out.filter((l) => l.startsWith("FAIL")), warns = out.filter((l) => l.startsWith("WARN"));
  const uniq = [...new Set(out)];
  console.log(uniq.join("\n") || "PASS all checks");
  console.log(`\n${fails.length ? "FAIL" : warns.length ? "WARN" : "PASS"}: ${fails.length} fail, ${warns.length} warn across ${pages.length} page(s)`);
  process.exit(fails.length ? 1 : 0);
});
