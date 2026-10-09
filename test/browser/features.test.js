// Browser tests for staff and creator features against its own local store: impersonation, sales and promo codes, the
// Studio (pages and selling), the Control Center on a phone, the phone quick-links bar, Settings › Orders, the skinned
// project card and guest refunds. Tests run in order: the Control Center test signs in as the admin the impersonation
// test created. Usage: npm run test:browser.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { sql, unique } from "../support/client.js";
import { browserStore, PHONE, DESK } from "../support/browser.js";

const t = browserStore({ name: "features", port: 8806 });
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
    await page.goto("/admin");
    await page.click("#tab-customers");
    await startImpersonating(page, id);
    await page.waitForURL((u) => u.pathname === "/dashboard");
    for (const path of ["/dashboard", "/library", "/shop/wallpapers", "/autostacc/glitches-and-stitches"]) {
      await page.goto(path);
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
    await page.waitForURL((u) => u.pathname === "/admin");
    await page.waitForSelector("#tab-overview");
    assert.equal(await page.locator("#impersonation-bar").count(), 0);

    // Ended elsewhere (here: its time limit): the page says so instead of quietly turning back into the admin.
    await page.click("#tab-customers");
    await startImpersonating(page, id);
    await page.waitForURL((u) => u.pathname === "/dashboard");
    sql(t.stateDir, `UPDATE impersonations SET expires_at = '2000-01-01T00:00:00.000Z' WHERE ended_at IS NULL AND customer_user_id = '${id}'`);
    await page.goto("/library");
    await page.waitForSelector("#impersonation-bar.imp-ended");
    assert.match(await page.title(), /^\[IMPERSONATION ENDED\]/);
    await page.click("[data-imp-exit]");
    await page.waitForURL((u) => u.pathname === "/admin");
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
      await page.goto("/shop/vj-loops");
      await page.waitForSelector("[data-price] .price-was");
      assert.match(await page.locator("[data-price]").first().innerText(), /\$14\.99.*\$7\.50.*Browser sale/s);
      await page.locator("[data-buy] [data-add-to-cart]").click();
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

  test("Studio on a phone: claim a name, build a two-page site from blocks, publish it, and it is live without any script", async () => {
    const { ctx, page } = await open();
    await signUp(page, unique("studio"));
    await page.goto("/studio");
    const name = `Phone Creator ${Date.now().toString(36)}`;
    await page.fill("#cr-name", name);
    const slug = await page.inputValue("#cr-slug");
    assert.match(slug, /^phone-creator-/, "the address is suggested from the name");
    await page.click("form[data-form=creator] button[type=submit]");
    await page.fill("#pr-name", "Night Shift");
    await page.click("form[data-form=project] button[type=submit]");
    await page.waitForSelector(".studio-bar");
    await page.selectOption("#st-add", "text");
    await page.click("[data-action=add]");
    await page.fill("textarea[data-path$='.text']", "Hello from **the Studio**");
    await page.click("[data-action=page-add]");
    await page.fill("#st-title", "Events");
    await page.fill("#st-slug", "events");
    await page.selectOption("#st-add", "events");
    await page.click("[data-action=add]");
    await page.click("[data-action=list-add]");
    await page.fill("input[type=date]", "2027-03-04");
    await page.fill("input[data-path$='.items.0.title']", "Warehouse set");
    await page.click("[data-action=publish]");
    await page.waitForSelector("text=Published at");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 0, `the editor overflows by ${overflow}px`);
    const live = await page.goto(`/${slug}/night-shift`);
    assert.equal(live.status(), 200);
    assert.match(live.headers()["content-security-policy"], /script-src 'none'/);
    assert.equal(await page.locator("main strong").first().textContent(), "the Studio");
    assert.equal(await page.locator("script").count(), 0);
    await page.click(".cs-nav a:text('Events')");
    await page.waitForURL((u) => u.pathname === `/${slug}/night-shift/events`);
    await page.waitForSelector("text=Warehouse set");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "the live page fits a phone");
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("a customer's preview opens even while the Control Center's product list is still loading", async () => {
    const { ctx, page } = await open(DESK);
    await page.goto("/login");
    await page.fill("#email", "owner@browser.test");
    await page.fill("#password", "browser-pass-123");
    await page.click("button[type=submit]");
    await page.waitForURL((u) => u.pathname === "/dashboard");
    // The product list answers late (a slow network); the customers list is drawn without waiting for it.
    let release;
    const held = new Promise((r) => (release = r));
    await ctx.route((url) => url.pathname === "/api/admin/products", async (route) => { await held; await route.continue(); });
    await page.goto("/admin");
    await page.click("#tab-customers");
    const id = sql(t.stateDir, `SELECT id FROM "user" WHERE email = 'owner@browser.test'`)[0].id;
    await page.click(`[data-preview="${id}"]`);
    release();
    await page.waitForSelector(".admin-preview h2", { timeout: 10000 });
    assert.match(await page.locator(".admin-preview h2").innerText(), /owner@browser\.test/);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });
  test("the Control Center works on a phone: a section picker, tables as cards, nothing sideways, big enough buttons", async () => {
    const { ctx, page } = await open(PHONE);
    await page.goto("/login");
    await page.fill("#email", "owner@browser.test");
    await page.fill("#password", "browser-pass-123");
    await page.click("button[type=submit]");
    await page.waitForURL((u) => u.pathname === "/dashboard");
    await page.goto("/admin");
    await page.waitForSelector("[data-section]");
    assert.equal(await page.locator(".admin-tabs").isVisible(), false, "the tab strip is replaced by the picker on a phone");
    await page.selectOption("[data-section]", "customers");
    await page.waitForSelector("#admin-customers td[data-label]");
    assert.equal(await page.locator("#admin-customers").isVisible(), true);
    assert.equal(await page.locator("#admin-products").isVisible(), false);
    const facts = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      cellsLabelled: [...document.querySelectorAll("#admin-customers tbody td")].filter((td) => td.colSpan === 1 && document.querySelectorAll("#admin-customers thead th")[td.cellIndex].textContent.trim()).every((td) => td.dataset.label),
      picker: document.querySelector("[data-section]").getBoundingClientRect().height,
      small: [...document.querySelectorAll("#admin-customers button, #admin-customers .link-btn")].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 40).length
    }));
    assert.ok(facts.overflow <= 0, `the Control Center overflows by ${facts.overflow}px`);
    assert.ok(facts.cellsLabelled, "every table cell carries its column name");
    assert.ok(facts.picker >= 44, "the picker is easy to tap");
    assert.equal(facts.small, 0, "buttons are big enough to tap");
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("Studio selling on a phone: make a product, upload its file, put it on sale, and the product page sells it", async () => {
    const { ctx, page } = await open();
    await signUp(page, unique("seller"));
    await page.goto("/studio");
    await page.fill("#cr-name", `Seller ${Date.now().toString(36)}`);
    await page.click("form[data-form=creator] button[type=submit]");
    await page.fill("#pr-name", "Sound Shop");
    await page.click("form[data-form=project] button[type=submit]");
    await page.waitForSelector(".studio-bar");
    await page.goto("/studio");
    await page.click("[data-products]");
    await page.waitForSelector("form[data-form=new]");
    await page.fill("form[data-form=new] [name=title]", "Glitch Kit");
    await page.fill("form[data-form=new] [name=description]", "Drums and textures.");
    await page.selectOption("form[data-form=new] [name=type]", "sample-pack");
    await page.fill("form[data-form=new] [name=price]", "4.50");
    await page.fill("form[data-form=new] [name=includes]", "20 drum hits\n5 textures");
    await page.click("form[data-form=new] button[type=submit]");
    await page.waitForSelector(".studio-product h3:text('Glitch Kit')");
    const row = sql(t.stateDir, "SELECT id, price_cents, published FROM products WHERE title = 'Glitch Kit'")[0];
    assert.equal(row.price_cents, 450);
    assert.equal(row.published, 0, "a new product is a draft");
    sql(t.stateDir, "UPDATE creators SET trusted = 1");
    const zip = Buffer.concat([Buffer.from("PK\x03\x04"), Buffer.alloc(60, 1)]);
    await page.setInputFiles("[data-upload]", { name: "kit.zip", mimeType: "application/zip", buffer: zip });
    await page.waitForSelector("text=Uploaded kit.zip");
    await page.click("[data-act=publish]");
    await page.waitForSelector(".studio-product .tag:text('On sale')");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 0, `the products screen overflows by ${overflow}px`);
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
});
