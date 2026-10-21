// Browser tests for staff and creator features against its own local store: impersonation, sales and promo codes, the
// Studio (pages and selling), the Control Center on a phone, the phone quick-links bar, Settings › Orders, the skinned
// project card, guest refunds, drop-in modules placed twice on one page, the discovery pages (projects, Your Stacc search, explore, home, dashboard) and the home banner. Tests run in order: the Control Center test signs in as the admin the impersonation
// test created. Usage: npm run test:browser.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { sql, unique } from "../support/client.js";
import { browserStore, PHONE, DESK } from "../support/browser.js";
import path from "node:path";
import { after } from "node:test";
import { startMockEngine } from "../mock-engine/server.js";
const ROOT = path.resolve(import.meta.dirname, "../..");
// The mock engine checks what the Product Studio's drop zone sends (the Pack Builder's flow, test/browser/packs.test.js).
const engine = await startMockEngine(8827, { storage: "http://localhost:8806/api/internal/engine-storage" });
after(() => engine.close());

const t = browserStore({ name: "features", port: 8806, vars: { ENGINE_URL: engine.url } });
const { open, ordersFor, toMockPay, signUp, startImpersonating } = t;

describe("features in the browser", () => {
  test("impersonation: the banner is on every page, names both people, and Exit returns to the Control Center", async () => {
    const shopper = await open(PHONE);
    const customer = unique("imp-shopper");
    await signUp(shopper.page, customer);
    await shopper.ctx.close();
    const { ctx, page } = await open(DESK);
    await signUp(page, "owner@browser.test");
    const id = sql(t.stateDir, `SELECT id FROM "user" WHERE email = '${customer}'`)[0].id;
    await page.goto("/admin/daily");
    await page.click('[data-ws-item="customers"]');
    await startImpersonating(page, id);
    await page.waitForURL((u) => u.pathname === "/dashboard");
    for (const path of ["/dashboard", "/library", "/product?p=wallpapers", "/autostacc/glitches-and-stitches"]) {
      await page.goto(path);
      // A product page sets its title once the product arrives; the marker must survive that.
      if (path.startsWith("/product")) await page.waitForSelector("#product-app .product-info");
      const bar = page.locator("#impersonation-bar.imp-active");
      await bar.waitFor();
      assert.match(await bar.innerText(), new RegExp(customer.replace(/[.]/g, "\\.")), path);
      assert.match(await bar.innerText(), /owner@browser\.test/, path);
      assert.match(await page.title(), /^\[IMPERSONATING\]/, path);
      // Nothing on the page sits under the bar.
      const top = await page.evaluate(() => document.querySelector("main").getBoundingClientRect().top + scrollY);
      assert.ok(top >= await bar.evaluate((b) => b.offsetHeight), path);
    }
    await page.click("[data-imp-exit]");
    await page.waitForURL((u) => u.pathname === "/admin/daily");
    await page.waitForSelector('[data-ws-item="customers"][aria-current="page"]');
    assert.equal(await page.locator("#impersonation-bar").count(), 0);

    // Ended elsewhere (here: its time limit): the page says so instead of quietly turning back into the admin.
    await page.click('[data-ws-item="customers"]');
    await startImpersonating(page, id);
    await page.waitForURL((u) => u.pathname === "/dashboard");
    sql(t.stateDir, `UPDATE impersonations SET expires_at = '2000-01-01T00:00:00.000Z' WHERE ended_at IS NULL AND customer_user_id = '${id}'`);
    await page.goto("/library");
    await page.waitForSelector("#impersonation-bar.imp-ended");
    assert.match(await page.title(), /^\[IMPERSONATION ENDED\]/);
    await page.click("[data-imp-exit]");
    await page.waitForURL((u) => u.pathname === "/admin/daily");
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("sales and promo codes: the struck-through price on the page, the code in the cart, and checkout charges the discounted total", async () => {
    const T = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
    sql(t.stateDir, `INSERT INTO promotions (id, kind, name, percent_off, scope, scope_ids, starts_at, created_at, updated_at)
      VALUES ('promo_browsersale', 'sale', 'Browser sale', 50, 'products', '["vj-loops"]', ${T}, ${T}, ${T});
      INSERT INTO promotions (id, kind, name, code, percent_off, scope, starts_at, created_at, updated_at)
      VALUES ('promo_browsercode', 'code', 'Browser code', 'BROWSER10', 10, 'all', ${T}, ${T}, ${T});`);
    try {
      const { ctx, page } = await open(PHONE);
      await page.goto("/product?p=vj-loops");
      await page.waitForSelector("#product-app .product-price s");
      assert.match(await page.locator("#product-app .product-price").innerText(), /\$7\.50.*\$14\.99/s);
      await page.locator("#product-app [data-buy]").click();
      await page.goto("/cart");
      await page.waitForSelector(".cart-line .price-sale");
      await page.fill("#promo-code", "browser10");
      await page.click(".cart-promo button[type=submit]");
      await page.waitForSelector("text=Discount (BROWSER10)");
      assert.match(await page.locator(".cart-totals .price").innerText(), /\$6\.75/);
      const email = unique("promo-browser");
      await page.fill("#cart-email", email);
      await page.click("#checkout-btn");
      await page.waitForURL(/\/checkout\?order=.*mock=/);
      assert.deepEqual(sql(t.stateDir, `SELECT total_cents, discount_cents, promo_code FROM orders WHERE email = '${email}'`),
        [{ total_cents: 675, discount_cents: 75, promo_code: "BROWSER10" }]);
      // A code that doesn't exist says so and holds checkout back.
      await page.goto("/cart");
      await page.click("[data-promo-remove]");
      await page.fill("#promo-code", "NOPE-NOT-A-CODE");
      await page.click(".cart-promo button[type=submit]");
      await page.waitForSelector("text=That code doesn't exist.");
      assert.equal(await page.locator("#checkout-btn").isDisabled(), true);
      assert.deepEqual(page.errors, []);
      await ctx.close();
    } finally {
      sql(t.stateDir, `UPDATE promotions SET ends_at = ${T} WHERE id IN ('promo_browsersale', 'promo_browsercode')`);
    }
  });

  test("Studio on a phone: claim a name, build a two-page site in the visual builder, publish it, and it runs only AutoStacc's script", async () => {
    const { page } = await open();
    await signUp(page, unique("studio"));
    await page.goto("/studio");
    const name = `Phone Creator ${Date.now().toString(36)}`;
    await page.fill("#cr-name", name);
    const slug = await page.inputValue("#cr-slug");
    assert.match(slug, /^phone-creator-/, "the address is suggested from the name");
    await page.click("form[data-form=creator] button[type=submit]");
    await page.fill("#pr-name", "Night Shift");
    await page.click("form[data-form=project] button[type=submit]");
    await page.waitForSelector(".bx-bar");
    // A new site opens on Add.
    await page.click('[data-action="add-element"][data-type="text"]');
    await page.fill(".bx-panel-body textarea[data-path$='.text']", "Hello from **the Studio**");
    await page.click("[data-action=page-add]");
    await page.click('.bx-tabs [data-tab="edit"]');
    await page.fill("input[data-path='pages.1.title']", "Events");
    await page.fill("input[data-path='pages.1.slug']", "events");
    await page.click('.bx-tabs [data-tab="add"]');
    await page.click('[data-action="add-element"][data-type="events"]');
    await page.click(".bx-panel-body [data-action=list-add]");
    await page.fill(".bx-panel-body input[type=date]", "2027-03-04");
    await page.fill("input[data-path$='.items.0.title']", "Warehouse set");
    await page.click("[data-action=publish]");
    await page.waitForSelector("text=Published at");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 0, `the editor overflows by ${overflow}px`);
    const live = await page.goto(`/${slug}/night-shift`);
    assert.equal(live.status(), 200);
    assert.match(live.headers()["content-security-policy"], /script-src [^;]*\/js\/site-runtime\.js;/);
    assert.equal(await page.locator("main strong").first().textContent(), "the Studio");
    assert.deepEqual(await page.evaluate(() => [...document.scripts].map((s) => new URL(s.src).pathname)), ["/js/site-runtime.js"]);
    await page.click(".cs-nav a:text('Events')");
    await page.waitForURL((u) => u.pathname === `/${slug}/night-shift/events`);
    await page.waitForSelector("text=Warehouse set");
  });

  test("Studio selling on a phone: make a product, upload its file in the Product Studio, put it on sale, and the product page sells it", async () => {
    const { ctx, page } = await open();
    await signUp(page, unique("seller"));
    await page.goto("/studio");
    await page.fill("#cr-name", `Seller ${Date.now().toString(36)}`);
    await page.click("form[data-form=creator] button[type=submit]");
    await page.fill("#pr-name", "Sound Shop");
    await page.click("form[data-form=project] button[type=submit]");
    await page.waitForSelector(".bx-bar");
    await page.goto("/studio");
    await page.click("[data-products]");
    await page.waitForSelector("form[data-form=new]");
    await page.fill("form[data-form=new] [name=title]", "Glitch Kit");
    await page.selectOption("form[data-form=new] [name=type]", "sample-pack");
    await page.fill("form[data-form=new] [name=price]", "4.50");
    await page.click("form[data-form=new] button[type=submit]");
    // A new product opens in the Product Studio at the Pac Builder.
    await page.waitForSelector('[data-ws-item="pacs"][aria-current="page"]', { state: "attached" });
    const row = sql(t.stateDir, "SELECT id, price_cents, published FROM products WHERE title = 'Glitch Kit'")[0];
    assert.equal(row.price_cents, 450);
    assert.equal(row.published, 0, "a new product is a draft");
    assert.match(page.url(), new RegExp(`#product=${row.id}&section=pacs$`));
    // The store page's words: autosaved, then on the product page.
    await page.click("[data-ws-open]");
    await page.click('[data-ws-item="store"]');
    await page.fill("#ss-desc", "Drums and textures.");
    await page.fill("#ss-inc", "20 drum hits\n5 textures");
    await page.waitForSelector("[data-ws-save]:text('All changes saved')", { timeout: 10000 });
    sql(t.stateDir, "UPDATE creators SET trusted = 1");
    await page.click("[data-ws-open]");
    await page.click('[data-ws-item="pacs"]');
    // The one drop zone: a whole Pac (the conformance case the mock engine knows) opens in the builder, then Publish.
    await page.setInputFiles("[data-pd-files]", path.join(ROOT, "engine/conformance/cases/editor-file.zip"));
    await page.waitForSelector("[data-pack-publish]", { timeout: 60000 });
    page.once("dialog", (d) => d.accept());
    await page.click("[data-pack-publish]");
    await page.waitForSelector("[data-pack-version] >> text=Published");
    await page.click("[data-ws-open]");
    await page.click('[data-ws-item="release"]');
    await page.click("[data-sw-release=publish]");
    await page.waitForSelector("[data-ws-status]:text('On sale')");
    assert.equal(sql(t.stateDir, `SELECT published FROM products WHERE id = '${row.id}'`)[0].published, 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 0, `the Product Studio overflows by ${overflow}px`);
    await page.goto(`/product?p=${row.id}`);
    await page.waitForSelector(".product-price");
    assert.match(await page.textContent(".product-price"), /\$4\.50/);
    assert.match(await page.textContent("main"), /20 drum hits/);
    await page.click("[data-buy]");
    await page.waitForSelector("text=Go to your cart");
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("phone quick-links bar: Store, Projects, Log in and Menu are within reach; Menu opens the drawer and Escape closes it", async () => {
    const { ctx, page } = await open(PHONE);
    await page.goto("/shop");
    const bar = page.locator(".tabbar");
    assert.equal(await bar.isVisible(), true);
    const names = await bar.locator("a:visible, button:visible").allTextContents();
    assert.deepEqual(names.map((t) => t.trim()), ["Store", "Projects", "Log in", "Menu"]);
    assert.equal(await bar.locator("a[aria-current]").textContent(), "Store");
    const small = await bar.locator("a:visible, button:visible").evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 44).length);
    assert.equal(small, 0, "every quick link is at least 44px tall");
    await bar.locator("[data-tab-menu]").click();
    await page.waitForSelector(".side.open");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".side:not(.open)");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "nothing scrolls sideways");
    assert.deepEqual(page.errors, []);
    await ctx.close();
    const wide = await open(DESK);
    await wide.page.goto("/shop");
    assert.equal(await wide.page.locator(".tabbar").isVisible(), false, "no quick-links bar on a computer");
    await wide.ctx.close();
  });

  test("Orders: finished orders are tidy rows, failed and cancelled ones are folded away with a plain reason", async () => {
    const { ctx, page } = await open(PHONE);
    await signUp(page, unique("orders"));
    await page.evaluate(async () => {
      const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      for (const [productId, outcome] of [["wallpapers", "paid"], ["vj-loops", "failed"], ["serum-presets", "expired"]]) {
        const co = await post("/api/checkout", { items: [{ productId }] });
        await post("/api/dev/mock-payment", { orderId: co.orderId, sessionId: new URL(co.url).searchParams.get("mock"), outcome });
      }
    });
    await page.goto("/settings/orders");
    await page.waitForSelector(".orders .order");
    assert.equal(await page.locator(".orders:not(.orders-other .orders) > .order").count(), 1, "one finished order in the main list");
    assert.match(await page.textContent(".order .order-chip"), /Paid/);
    const folded = page.locator(".orders-other");
    assert.match(await folded.locator("summary").textContent(), /Failed or cancelled \(2\)/);
    assert.equal(await folded.locator(".order-reason").first().isVisible(), false, "reasons stay folded until opened");
    await folded.locator("summary").click();
    const reasons = await folded.locator(".order-reason").allTextContents();
    assert.ok(reasons.some((t) => /payment didn't go through/.test(t)) && reasons.some((t) => /left before paying/.test(t)), reasons.join(" | "));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "nothing scrolls sideways");
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("a skinned project is a rounded, shadowed card with soft gray on light pages and stays full-bleed black in dark mode", async () => {
    const probe = (page) => page.evaluate(() => {
      const card = document.querySelector(".project-card");
      const cs = getComputedStyle(card);
      return { has: Boolean(card), radius: parseFloat(cs.borderTopLeftRadius), shadow: cs.boxShadow, bg: getComputedStyle(document.querySelector("main")).backgroundColor,
        over: document.documentElement.scrollWidth - innerWidth, headerInCard: card.contains(document.querySelector(".project-header")), footerInCard: card.contains(document.querySelector(".project-footer")) };
    });
    const light = await open({ ...PHONE, colorScheme: "light" });
    await light.page.goto("/autostacc/glitches-and-stitches");
    await light.page.waitForSelector(".project-card");
    const l = await probe(light.page);
    assert.ok(l.has && l.headerInCard && l.footerInCard, "header, page and footer are in the card");
    assert.ok(l.radius >= 12 && l.shadow !== "none", `light: rounded (${l.radius}px) with a shadow`);
    assert.notEqual(l.bg, "rgb(0, 0, 0)", "light: the black is a soft gray");
    assert.ok(l.over <= 0, "nothing scrolls sideways");
    assert.deepEqual(light.page.errors, []);
    await light.ctx.close();
    const dark = await open({ ...DESK, colorScheme: "dark" });
    await dark.page.goto("/autostacc/glitches-and-stitches");
    await dark.page.waitForSelector(".project-card");
    const d = await probe(dark.page);
    assert.equal(d.radius, 0, "dark: full-bleed");
    assert.equal(d.shadow, "none");
    assert.equal(d.bg, "rgb(0, 0, 0)", "dark: true black");
    assert.deepEqual(dark.page.errors, []);
    await dark.ctx.close();
  });

  test("a guest can refund an unused order from the confirmation page; after a download they can't", async () => {
    const { ctx, page } = await open(PHONE);
    const email = unique("guest-refund");
    await toMockPay(page, email, "wallpapers");
    await page.click("[data-mock=paid]");
    await page.waitForSelector("text=Payment confirmed");
    await page.waitForSelector("[data-refund]");
    page.once("dialog", (d) => d.accept());
    await page.click("[data-refund]");
    await page.waitForSelector("text=This order was refunded");
    assert.deepEqual(ordersFor(email).map((o) => o.status), ["refunded"]);
    // A second order, downloaded from first: no refund offered.
    await toMockPay(page, email, "stems-patchwork");
    await page.click("[data-mock=paid]");
    await page.waitForSelector("text=Payment confirmed");
    await page.waitForSelector("[data-refund]");
    await page.goto("/library");
    await page.waitForSelector(".stacc-asset");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("[data-download]")]);
    assert.ok(download.suggestedFilename());
    await page.goBack();
    await page.reload();
    await page.waitForSelector("text=Payment confirmed");
    await page.waitForTimeout(500);
    assert.equal(await page.locator("[data-refund]").count(), 0, "no refund once something was downloaded");
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("Your Stacc on a phone: put files in a new collection, tag them, filter by both and save the search", async () => {
    const { ctx, page } = await open(PHONE);
    // Bought as a guest, then an account with the same email: the purchase joins it.
    const email = unique("organizer");
    await toMockPay(page, email, "serum-presets");
    await page.click("[data-mock=paid]");
    await page.waitForSelector("text=Payment confirmed");
    await signUp(page, email);
    await page.goto("/library");
    await page.waitForSelector(".stacc-asset");
    const boxes = page.locator("[data-select]");
    const n = Math.min(2, await boxes.count());
    for (let i = 0; i < n; i++) await boxes.nth(i).check();
    await page.fill('[data-personal="collect"] [name="name"]', "Favorites");
    await page.click('[data-personal="collect"] button[type=submit]');
    await page.waitForFunction((label) => [...document.querySelectorAll('[data-filter="collection"] option')].some((o) => o.textContent === label), `Favorites (${n})`);
    await boxes.first().check();
    await page.fill('[data-personal="tag"] [name="tag"]', "Dark");
    await page.click('[data-personal="tag"] button[type=submit]');
    await page.waitForSelector(".stacc-asset .chip >> text=dark");
    await page.selectOption('[data-filter="tag"]', "dark");
    await page.waitForFunction(() => new URLSearchParams(location.search).get("tag") === "dark");
    assert.equal(await page.locator(".stacc-asset").count(), 1, "only the tagged file");
    await page.fill('[data-personal="search"] [name="name"]', "Dark ones");
    await page.click('[data-personal="search"] button[type=submit]');
    await page.waitForSelector(".stacc-saved a >> text=Dark ones");
    assert.equal(await page.locator(".stacc-saved a").getAttribute("href"), "/library?tag=dark");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 0, `Your Stacc overflows by ${overflow}px`);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("drop-in modules: a second Listen player and newsletter sign-up on the same page each render and work on their own", async () => {
    const { ctx, page } = await open(DESK);
    // A copy of each module, placed by attributes alone (the newsletter one empty, so it draws the standard form).
    const copies = `<section data-copies><div class="wrap"><div class="listen" data-listen data-links data-project="glitches-and-stitches"></div>
      <div data-newsletter data-project="glitches-and-stitches"></div></div></section></main>`;
    await page.route((url) => url.pathname === "/autostacc/glitches-and-stitches", async (route) => {
      const res = await route.fetch();
      route.fulfill({ response: res, body: (await res.text()).replace("</main>", copies) });
    });
    await page.goto("/autostacc/glitches-and-stitches");
    assert.equal(await page.locator("[data-listen]").count(), 2);
    assert.equal(await page.locator("[data-newsletter]").count(), 2);
    for (const box of await page.locator("[data-listen]").all()) {
      await box.locator(".listen-player > *").first().waitFor();
      assert.ok(await box.locator(".platforms a[href='/autostacc/glitches-and-stitches/music/hail']").count(), "each player lists its release's links");
    }
    for (const box of await page.locator("[data-newsletter]").all()) assert.equal(await box.locator("form input[type=email]").count(), 1);
    // Signing up in the copy answers in the copy only.
    await page.fill("[data-copies] [data-newsletter] input[type=email]", unique("modules"));
    await page.click("[data-copies] [data-newsletter] button[type=submit]");
    await page.waitForFunction(() => {
      const text = document.querySelector("[data-copies] [data-newsletter] .form-msg").textContent;
      return text && text !== "Signing you up…";
    });
    assert.equal(await page.locator("#newsletter [data-newsletter] .form-msg").innerText(), "");
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("discovery pages: filter and follow on /projects, Your Stacc search, /explore views, the home hub and dashboard sections", async () => {
    const { ctx, page } = await open(DESK);
    await signUp(page, unique("discover"));
    await page.goto("/projects");
    const gs = page.locator(".pcard[data-project='glitches-and-stitches']");
    await gs.waitFor();
    assert.equal(await gs.locator("text=Unverified creator").count(), 0, "AutoStacc's own project is verified");
    await page.check("[data-f=genre][data-v=electronic]");
    await page.waitForURL(/genre=electronic/);
    await page.waitForSelector("[data-chip=genre]");
    await page.click("[data-chip=genre]");
    await page.waitForURL((u) => !u.search.includes("genre"));
    await gs.locator("[data-follow='glitches-and-stitches']").click();
    await page.check("[data-auto='glitches-and-stitches']");
    await page.waitForSelector("text=Auto-Stacc on.");
    await page.check("[data-followed='1']");
    await page.waitForURL(/followed=1/);
    await page.waitForFunction(() => [...document.querySelectorAll(".pgrid .pcard")].every((c) => c.dataset.project === "glitches-and-stitches"));

    // Your Stacc: search narrows as you type and lives in the address.
    await page.goto("/library");
    await page.waitForSelector(".stacc-asset");
    const all = await page.locator(".stacc-asset").count();
    const word = (await page.locator(".stacc-asset").first().innerText()).trim().split(/[\s._-]+/)[0];
    await page.goto(`/library?q=${encodeURIComponent(word)}`);
    await page.waitForSelector(".stacc-found:has-text('match')");
    const found = await page.locator(".stacc-asset").count();
    assert.ok(found > 0 && found <= all, `${word}: ${found} of ${all}`);
    await page.fill("[data-filter=q]", "zz-nothing-zz");
    await page.waitForSelector("text=Nothing matches those filters.");
    assert.match(page.url(), /q=zz-nothing-zz/);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.filter), "q", "typing keeps focus in the box");
    await page.click("[data-clear-filters]");
    await page.waitForFunction(() => !location.search.includes("q="));

    // /explore: views as tabs, filters and chips in the address, drafts never shown.
    await page.goto("/explore");
    await page.waitForSelector(".ex-item");
    await page.click("[data-view=news]");
    await page.waitForURL(/view=news/);
    await page.waitForSelector("[data-view=news][aria-selected=true]");
    await page.check("[data-f=project][data-v=glitches-and-stitches]");
    await page.waitForURL(/project=glitches-and-stitches/);
    assert.ok(await page.locator(".ex-item").count() > 0);
    await page.focus("[data-view=news]");
    await page.keyboard.press("ArrowRight");
    await page.waitForURL(/view=shows/);
    await page.waitForSelector("[data-view=shows][aria-selected=true]");

    // Home and dashboard: the latest lists, followed projects first, and the projects you follow.
    await page.goto("/");
    await page.waitForSelector("[data-latest] .latest-list li");
    await page.goto("/dashboard");
    await page.waitForSelector("[data-picks=following] .pcard[data-project='glitches-and-stitches']");
    assert.equal(await page.locator("[data-project-picks]:not([data-picks]) .pcard[data-project='glitches-and-stitches']").count(), 0, "no suggesting what you already follow");
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("home banner: a DAW backdrop fixed behind the page, the hero most of the screen, still once scrolled past or for less motion", async () => {
    const { ctx, page } = await open({ ...DESK, reducedMotion: "no-preference" });
    await page.goto("/");
    await page.waitForSelector(".daw-stage .daw-clip");
    const facts = () => page.evaluate(() => {
      const stage = document.querySelector(".daw-stage"), hero = document.querySelector("[data-daw-hero]");
      return { position: getComputedStyle(stage).position, top: stage.getBoundingClientRect().top, hidden: stage.getAttribute("aria-hidden"),
        hero: hero.getBoundingClientRect().height / innerHeight, still: stage.classList.contains("is-still"),
        moving: document.querySelector(".daw-strip").getAnimations().filter((a) => a.playState === "running").length };
    });
    const first = await facts();
    assert.equal(first.position, "fixed");
    assert.equal(first.hidden, "true", "decorative: hidden from screen readers");
    assert.ok(first.hero >= 0.75, `the hero takes most of the screen (${first.hero})`);
    assert.ok(first.moving > 0, "the arrangement scrolls past the playhead");
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await page.waitForFunction(() => document.querySelector(".daw-stage").classList.contains("is-still"));
    const end = await facts();
    assert.equal(end.top, 0, "still in place at the very bottom");
    assert.equal(end.moving, 0, "nothing moves behind the page once the hero is gone");
    assert.ok(await page.evaluate(() => !document.elementFromPoint(innerWidth / 2, innerHeight - 20).closest(".daw-stage")), "the page covers it");
    assert.deepEqual(page.errors, []);
    await ctx.close();

    const calm = await open({ ...PHONE, reducedMotion: "reduce" });
    await calm.page.goto("/");
    await calm.page.waitForSelector(".daw-stage .daw-clip");
    assert.equal(await calm.page.evaluate(() => document.querySelector(".daw-stage").getAnimations({ subtree: true }).length), 0, "no motion when asked for less");
    assert.ok(await calm.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scroll on a phone");
    await calm.ctx.close();
  });
  test("Your Stacc on a phone: a Pac's nested folders, its previews and read me, with no sideways scroll", async () => {
    const { ctx, page } = await open(PHONE);
    const f = (id, folderPath) => ({ id, filename: `${id}.wav`, label: "", sizeBytes: 2048, pacId: "pc_t", kind: "", folderPath, bundleable: true });
    const library = { signedIn: false, items: [{ productId: "sp_tree", title: "Tree Kit", projectId: null, projectName: null, path: "/shop/sp_tree", pacs: ["pc_t"], sources: ["purchase"],
      readme: "<b>Thanks</b> for buying.\nA very-long-unbroken-line-".concat("x".repeat(200)), previews: [{ pacId: "pc_t", title: "Groove <i>", url: "/media/previews/t.mp3" }],
      files: [f("pf_top", ""), f("pf_k1", "Drums/Kicks"), f("pf_k2", "Drums/Kicks"), f("pf_c", "Drums")] }] };
    await page.route((url) => url.pathname === "/api/library", (route) => route.fulfill({ json: library }));
    await page.goto("/library");
    await page.waitForSelector(".stacc-folder");
    assert.equal(await page.locator(".stacc-folder .stacc-folder .stacc-asset").count(), 2, "Kicks sits inside Drums");
    assert.equal(await page.locator(".stacc-folder").first().locator("[data-bundle]").first().getAttribute("data-bundle"), "pf_c pf_k1 pf_k2", "a folder's ZIP covers its subfolders");
    assert.equal(await page.locator(".pac-previews audio[preload=none][controls]").count(), 1);
    assert.equal(await page.locator(".pac-preview-title").innerText(), "Groove <i>", "titles are text");
    assert.equal(await page.locator(".pac-readme").getAttribute("open"), null, "the read me starts folded");
    await page.click(".pac-readme summary");
    await page.locator(".pac-readme pre").waitFor();
    assert.match(await page.locator(".pac-readme pre").textContent(), /^<b>Thanks<\/b> for buying\./, "the read me is plain text");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scroll on a phone");
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });
});
