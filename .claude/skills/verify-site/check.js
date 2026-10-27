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
const { loadData, contentAddress } = require(path.join(root, "scripts/lib/data.js"));
const htmlUnder = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [])
  .flatMap((d) => (d.isDirectory() ? htmlUnder(`${dir}/${d.name}`) : d.name.endsWith(".html") ? [`${dir}/${d.name}`] : []));
const { SITE, projects, creators } = loadData(root);
// Root pages, the discover/ hub folder (New & upcoming) and every first-party creator's folder (its projects' pages), as
// in scripts/seo-test.js. Product, release and event pages are rendered by the store API (server/shop/,
// server/content/), so there are no files for them.
const allPages = [...fs.readdirSync(root).filter((f) => f.endsWith(".html")), ...htmlUnder("discover"), ...creators.flatMap((c) => htmlUnder(c.id))];
const pages = process.argv.length > 2 ? process.argv.slice(2) : allPages;
const urlOf = (f) => (f === "index.html" ? "/" : f === "404.html" ? "/this-address-does-not-exist" : "/" + f.replace(/\.html$/, ""));
// Account and store pages are private: noindex, no canonical (same list as scripts/seo-test.js and robots.txt).
const PRIVATE = /^\/(dashboard|account|settings|studio|login|library|admin|checkout|cart)(\/|$)/;
const out = [];
const line = (level, check, detail, file) => `${level} ${check} - ${detail}${file ? ` (${file})` : ""}`;
// Products, releases and events are Studio content from the store API, not data files, so they have no entry here.
const DATA_GLOBALS = { SITE: "data/site.js", PROJECTS: "data/projects.js" };

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
      const used = [...new Set([...fs.readFileSync(s, "utf8").matchAll(/window\.(SITE)\b/g)].map((m) => m[1]))];
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
    if (width === 1280) for (const p of await SEO.checkHead(tab, { SITE, projects, page, path: urlOf(page), noindex: page === "404.html" || PRIVATE.test(urlOf(page)) })) problems.push(p);
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
          // The drawer slides in: measure only once its finite animations are done, and only a link fully on screen.
          await link.evaluate(() => Promise.all(document.getAnimations().filter((x) => x.effect?.getTiming().iterations !== Infinity).map((x) => x.finished.catch(() => {}))));
          const clip = await link.boundingBox();
          const vp = tab.viewportSize();
          if (clip && clip.width >= 1 && clip.height >= 1 && clip.x >= 0 && clip.y >= 0 && clip.x + clip.width <= vp.width && clip.y + clip.height <= vp.height) {
            const shot = () => tab.screenshot({ clip, animations: "disabled", caret: "hide" });
            const shown = await shot();
            await link.evaluate((a) => { a.style.visibility = "hidden"; });
            const hidden = await shot();
            await link.evaluate((a) => { a.style.visibility = ""; });
            if (shown.equals(hidden)) problems.push(["FAIL", "nav-toggle", "menu opened but is covered by the page"]);
          }
        }
      } else problems.push(["WARN", "nav-toggle", "menu button not visible at 390px"]);
    }
    // The store page with the store API offline (this checker serves static files): it must still draw its grid (or its
    // empty state: products are Studio content in the store database) and say that search and filters are offline.
    // Filters and search themselves are tested against a real store by test/browser/flows.test.js.
    if (page === "shop.html" && width === 1280) {
      await tab.waitForSelector(".browse-grid .card, .browse-grid .empty", { timeout: 5000 }).catch(() => {});
      const drawn = await tab.locator(".browse-grid .card, .browse-grid .empty").count();
      if (!drawn) problems.push(["FAIL", "shop-offline", "the store showed neither products nor its empty state with its API offline"]);
      const note = await tab.locator(".browse-count").innerText().catch(() => "");
      if (!/offline/i.test(note)) problems.push(["WARN", "shop-offline", "no note that search and filters are offline"]);
    }
    if (width === 1280 && (await tab.locator("[data-newsletter] form").count())) {
      await tab.fill("[data-newsletter] input[type=email]", "test@example.com");
      await tab.click("[data-newsletter] button");
      if (!(await tab.locator("[data-newsletter] .form-msg").innerText()).trim() && !(await tab.url()).includes("?")) problems.push(["WARN", "newsletter", "submitting showed no message"]);
    }
  } catch (e) {
    problems.push(["FAIL", "checker", String(e.message || e).split("\n")[0]]);
  } finally {
    await tab.close().catch(() => {});
  }
  return problems.map(([level, check, detail]) => line(level, `${check}@${width}`, detail, page));
}

// Product pages (/shop/<id>), release and event pages (scripts/lib/data.js contentAddress) and the /events calendar are
// rendered by the store API from the database, which is offline here, so a link to one can't load: a note, not a broken
// link. Their own tests are in test/api/ (store-check); seo-test.js checks each recorded address still has a home.
// A project's community space (/<creator>/<project>/community) is the community's own page, from the store too.
const SERVED = /^\/(shop\/[^/?#]+|events|[a-z0-9-]+\/[a-z0-9-]+\/community)\/?(?:[?#]|$)/;
const offlineContent = (p) => {
  const m = p[1] === "broken-link" && /^(\S+) returned 404$/.exec(p[2]);
  return m && (SERVED.test(m[1]) || contentAddress(m[1])) ? ["WARN", "content-offline", `${m[1]} is served by the store API (offline here)`, p[3]] : p;
};

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
      process.argv.length <= 2 ? SEO.crawl(browser, base, SITE).then((ps) => ps.map(offlineContent).map((p) => line(...p))) : [],
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
