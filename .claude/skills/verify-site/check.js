// Runs the site checks and prints one line per result: PASS / WARN / FAIL <check> - <detail> (<file>).
// Usage: NODE_PATH=$(npm root -g) node .claude/skills/verify-site/check.js [page.html ...]
// Needs Playwright with Chromium (preinstalled in cloud sessions at /opt/pw-browsers/chromium).
// Pages are served like production (scripts/serve.js): clean addresses, _redirects, real 404 status. The store API is
// offline there (503), so this also checks that every page still works when the store is down.
// Static checks, browser tabs (VERIFY_CONCURRENCY at once) and the crawl run concurrently; output is grouped per check.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");

const root = process.cwd();
const { createServer } = require(path.join(root, "scripts/serve.js"));
const { loadData } = require(path.join(root, "scripts/lib/data.js"));
const htmlUnder = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [])
  .flatMap((d) => (d.isDirectory() ? htmlUnder(`${dir}/${d.name}`) : d.name.endsWith(".html") ? [`${dir}/${d.name}`] : []));
const allPages = [...fs.readdirSync(root).filter((f) => f.endsWith(".html")), ...htmlUnder("shop"), ...htmlUnder("projects")];
const pages = process.argv.length > 2 ? process.argv.slice(2) : allPages;
const urlOf = (f) => (f === "index.html" ? "/" : f === "404.html" ? "/this-address-does-not-exist" : "/" + f.replace(/\.html$/, ""));
const { SITE, products, projects } = loadData(root);
const drafts = new Set(products.filter((p) => p.draft).map((p) => `shop/${p.id}.html`));
// Account and store pages are private: noindex, no canonical (same list as scripts/seo-test.js and robots.txt).
const PRIVATE = /^\/(dashboard|account|settings|studio|login|library|admin|checkout|cart|product)(\/|$)/;
const out = [];
const line = (level, check, detail, file) => `${level} ${check} - ${detail}${file ? ` (${file})` : ""}`;
const DATA_GLOBALS = { SITE: "data/site.js", PROJECTS: "data/projects.js", PRODUCTS: "data/products.js", NEWS: "data/news.js", SHOWS: "data/shows.js", MUSIC: "data/music.js" };

// Independent checks run at the same time (static checks, page tabs in a pool, the crawl); each job keeps its own
// lines and they are printed in the fixed order static -> pages (as listed, 1280 then 390) -> crawl, never interleaved.
// VERIFY_CONCURRENCY sets how many tabs are open at once (default: CPU count, 2 to 6).
const CONCURRENCY = Math.max(1, Number(process.env.VERIFY_CONCURRENCY) || Math.min(6, Math.max(2, os.cpus().length)));
const pool = async (jobs, limit) => {
  const results = new Array(jobs.length);
  let next = 0;
  const worker = async () => { while (next < jobs.length) { const i = next++; results[i] = await jobs[i](); } };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return results;
};

// ---------- static checks: no browser needed ----------
async function staticChecks() {
  const lines = [];
  const add = (level, check, detail, file) => lines.push(line(level, check, detail, file));
  const jsFiles = ["js", "data"].flatMap((d) => fs.readdirSync(path.join(root, d)).filter((n) => n.endsWith(".js")).map((n) => `${d}/${n}`));
  const syntax = await pool(jsFiles.map((f) => () => new Promise((resolve) =>
    execFile("node", ["--check", f], (err, _o, stderr) => resolve(err ? line("FAIL", "js-syntax", String(stderr).split("\n")[0], f) : null)))), os.cpus().length * 2);
  lines.push(...syntax.filter(Boolean));
  for (const f of fs.readdirSync(path.join(root, "css")).filter((n) => n.endsWith(".css")).map((n) => `css/${n}`)) {
    const css = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const open = (css.match(/{/g) || []).length, close = (css.match(/}/g) || []).length;
    if (open !== close) add("FAIL", "css-braces", `${open} "{" vs ${close} "}"`, f);
  }
  for (const page of pages) {
    const html = fs.readFileSync(page, "utf8");
    const refs = [...html.matchAll(/(?:src|href)="([^"#?:]+\.(?:js|css|html|png|jpg|svg|ico|webp))"/g)].map((m) => m[1].replace(/^\//, ""));
    for (const r of refs) if (!fs.existsSync(r)) add("FAIL", "broken-reference", `missing ${r}`, page);
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1].replace(/^\//, ""));
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
  return lines;
}

// ---------- browser checks: one page at one width, in its own tab ----------
const SEO = require("./seo-browser.js");
async function checkPage(browser, base, page, width) {
  const tab = await browser.newPage({ viewport: { width, height: 800 } });
  const problems = [];
  try {
    tab.on("pageerror", (e) => problems.push(["FAIL", "runtime-error", String(e)]));
    // Only our own pages count; embedded players (Deezer, Spotify, ...) log their own errors.
    tab.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && (!m.location().url || m.location().url.startsWith(base)) && problems.push(["FAIL", "console-error", m.text()]));
    tab.on("response", (r) => r.url().startsWith(base) && r.status() >= 400 && !(r.status() === 503 && r.url().startsWith(base + "/api/")) && !(page === "404.html" && r.url() === base + urlOf(page)) && problems.push(["FAIL", "http-" + r.status(), r.url().replace(base, "")]));
    // Requests made inside embedded players (YouTube ads and stats, etc.) aren't the site's own.
    tab.on("requestfailed", (r) => !r.url().startsWith(base) && r.frame() === tab.mainFrame() && problems.push(["WARN", "external-request", `${r.url().slice(0, 60)} failed (offline sandbox?)`]));
    const res = await tab.goto(base + urlOf(page));
    if (page === "404.html" && res.status() !== 404) problems.push(["FAIL", "404-status", `unknown address returned ${res.status()}, not 404`]);
    await tab.waitForTimeout(250);
    if (width === 1280) for (const p of await SEO.checkHead(tab, { SITE, projects, page, path: urlOf(page), noindex: page === "404.html" || drafts.has(page) || PRIVATE.test(urlOf(page)) })) problems.push(p);
    const facts = await tab.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      header: (!!document.querySelector(".side-nav") && !!document.querySelector(".topbar")) || (!!document.querySelector(".as-strip") && !!document.querySelector(".project-header")),
      footer: !!document.querySelector(".site-footer .wrap"),
      empty: [...document.querySelectorAll("[id$='-list'],[id$='-grid'],[id^='featured'],[id^='latest'],[data-shop] .grid")].filter((e) => !e.children.length).map((e) => "#" + e.id),
      smallTargets: [...document.querySelectorAll("a,button")].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.height < 24 || r.width < 24); }).length
    }));
    if (facts.overflow > 0) problems.push(["FAIL", `overflow-${width}`, `page is ${facts.overflow}px wider than the viewport`]);
    if (!facts.header || !facts.footer) problems.push(["FAIL", "chrome", "header or footer did not render"]);
    for (const id of facts.empty) problems.push(["WARN", "empty-container", `${id} rendered nothing`]);
    if (width === 390 && facts.smallTargets) problems.push(["WARN", "tap-targets", `${facts.smallTargets} links/buttons smaller than 24px`]);
    if (width === 390) {
      // Platform pages open the AutoStacc drawer from the phone tab bar's Menu tab; a project's pages open the project's own menu.
      const project = await tab.locator(".ph-toggle").count();
      const toggle = tab.locator(project ? ".ph-toggle" : "[data-tab-menu]");
      if (await toggle.isVisible()) {
        await toggle.click();
        const menu = project ? ".ph-nav.open" : ".side.open";
        if (!(await tab.locator(menu).count())) problems.push(["FAIL", "nav-toggle", "menu did not open"]);
        // Open but painted under the page (a lost z-index) still fails. Hit-testing can't tell (the page behind is inert),
        // so compare pixels: hiding the first link must change what's on screen.
        else if (await tab.locator(`${menu} a`).count()) {
          const link = tab.locator(`${menu} a`).first();
          const clip = await link.boundingBox();
          const shot = () => tab.screenshot({ clip, animations: "disabled", caret: "hide" });
          const shown = await shot();
          await link.evaluate((a) => { a.style.visibility = "hidden"; });
          const hidden = await shot();
          await link.evaluate((a) => { a.style.visibility = ""; });
          if (shown.equals(hidden)) problems.push(["FAIL", "nav-toggle", "menu opened but is covered by the page"]);
        }
      } else problems.push(["WARN", "nav-toggle", "menu button not visible at 390px"]);
    }
    if (page === "shop.html" && width === 1280) {
      const before = await tab.locator(".card").count();
      const buttons = tab.locator("[data-filter=type] button");
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
    if (width === 1280 && (await tab.locator("#newsletter-form").count())) {
      await tab.fill("#newsletter-form input[type=email]", "test@example.com");
      await tab.click("#newsletter-form button");
      if (!(await tab.locator("#newsletter-msg").innerText()).trim() && !(await tab.url()).includes("?")) problems.push(["WARN", "newsletter", "submitting showed no message"]);
    }
  } catch (e) {
    problems.push(["FAIL", "checker", String(e.message || e).split("\n")[0]]);
  } finally {
    await tab.close().catch(() => {});
  }
  return problems.map(([level, check, detail]) => line(level, `${check}@${width}`, detail, page));
}

async function browserChecks() {
  let chromium;
  try { ({ chromium } = require("playwright")); }
  catch { return { pages: [line("WARN", "browser", "playwright not found; set NODE_PATH=$(npm root -g). Browser checks skipped")], crawl: [] }; }
  const server = createServer(root);
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined });
  try {
    const jobs = pages.flatMap((page) => [1280, 390].map((width) => () => checkPage(browser, base, page, width)));
    // Crawl from the home page like a search engine that runs scripts: every sitemap URL must be reachable by links.
    const [pageLines, crawl] = await Promise.all([
      pool(jobs, CONCURRENCY),
      process.argv.length <= 2 ? SEO.crawl(browser, base, SITE).then((ps) => ps.map((p) => line(...p))) : [],
    ]);
    return { pages: pageLines.flat(), crawl };
  } finally {
    await browser.close();
    server.close();
  }
}

Promise.all([staticChecks(), browserChecks()])
  .then(([st, br]) => out.push(...st, ...br.pages, ...br.crawl))
  .catch((e) => out.push(line("FAIL", "checker", String(e.message || e).split("\n")[0])))
  .finally(() => {
    const fails = out.filter((l) => l.startsWith("FAIL")), warns = out.filter((l) => l.startsWith("WARN"));
    const uniq = [...new Set(out)];
    console.log(uniq.join("\n") || "PASS all checks");
    console.log(`\n${fails.length ? "FAIL" : warns.length ? "WARN" : "PASS"}: ${fails.length} fail, ${warns.length} warn across ${pages.length} page(s)`);
    process.exit(fails.length ? 1 : 0);
  });
