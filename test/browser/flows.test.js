// Browser and chaos tests for the store, in real Chromium against its own local store (mock payments): the full purchase
// on a phone, then everything that tends to break it (double clicks, back button, refresh, offline, slow or failing
// API, cancelled and failed payments, expired sessions and links, unavailable products), settings, navigation, keyboard
// use. (Trust pages, reduced motion and the signed-in phone fit are in layout.test.js.) Usage: npm run test:browser (runs beside layout.test.js and features.test.js).
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sql, unique } from "../support/client.js";
import { browserStore, PHONE, DESK } from "../support/browser.js";

const t = browserStore({ name: "flows", port: 8803 });
const { open, logOut, ordersFor, setCart, toMockPay, signUp } = t;

describe("store in the browser", () => {
  test("phone: browse, add, pay as a guest, see it owned, download it", async () => {
    const { ctx, page } = await open(PHONE);
    const email = unique("phone-buyer");
    await toMockPay(page, email, "stems-patchwork");
    await page.click("[data-mock=paid]");
    await page.waitForSelector("text=Payment confirmed");
    assert.equal(await page.evaluate(() => localStorage.getItem("gs:cart")), "[]");
    // Refresh after success: still paid, nothing doubled.
    await page.reload();
    await page.waitForSelector("text=Payment confirmed");
    assert.deepEqual(ordersFor(email).map((o) => o.status), ["paid"]);
    await page.goto("/shop/stems-patchwork");
    await page.waitForSelector("[data-buy] .owned-badge");
    await page.goto("/library");
    await page.waitForSelector(".stacc-asset");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("[data-download]")]);
    assert.match(download.suggestedFilename(), /stems-patchwork/);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("hammering the checkout button opens one order", async () => {
    const { ctx, page } = await open(DESK);
    const email = unique("hammer");
    await page.goto("/shop/vj-loops");
    await page.click("[data-buy] [data-add-to-cart]");
    await page.goto("/cart");
    await page.fill("#cart-email", email);
    // Slow network: the button must lock on the first click.
    await page.route("**/api/checkout", async (r) => { await new Promise((x) => setTimeout(x, 1500)); r.continue(); });
    const btn = page.locator("#checkout-btn");
    await btn.click();
    for (let i = 0; i < 4; i++) await btn.click({ force: true, timeout: 500 }).catch(() => {});
    await page.waitForURL(/\/checkout\?order=/);
    assert.equal(ordersFor(email).length, 1);
    await ctx.close();
  });

  test("back button from the payment page, then checkout again: same order", async () => {
    const { ctx, page } = await open(PHONE);
    const email = unique("back");
    await toMockPay(page, email);
    await page.goBack();
    await page.waitForSelector("#checkout-btn:not([disabled])");
    await page.click("#checkout-btn");
    await page.waitForURL(/\/checkout\?order=.*mock=/);
    assert.equal(ordersFor(email).length, 1);
    await ctx.close();
  });

  test("refresh on the payment page keeps the order; cancelling keeps the cart", async () => {
    const { ctx, page } = await open(PHONE);
    const email = unique("cancel");
    await toMockPay(page, email);
    await page.reload();
    await page.click("[data-mock=expired]");
    await page.waitForSelector("text=Checkout cancelled");
    assert.equal(ordersFor(email)[0].status, "cancelled");
    await page.click("text=Back to cart");
    await page.waitForSelector(".cart-line");
    await ctx.close();
  });

  test("a declined card says so and charges nothing", async () => {
    const { ctx, page } = await open(PHONE);
    const email = unique("declined");
    await toMockPay(page, email);
    await page.click("[data-mock=failed]");
    await page.waitForSelector("text=Payment didn't go through");
    assert.equal(ordersFor(email)[0].status, "failed");
    const lib = await page.request.get("/api/library");
    assert.equal((await lib.json()).items.length, 0);
    await ctx.close();
  });

  test("losing the connection at checkout fails gently and recovers", async () => {
    const { ctx, page } = await open(PHONE);
    const email = unique("offline");
    await page.goto("/shop/serum-presets");
    await page.click("[data-buy] [data-add-to-cart]");
    await page.goto("/cart");
    await page.fill("#cart-email", email);
    await ctx.setOffline(true);
    await page.click("#checkout-btn");
    await page.waitForSelector("text=We couldn't reach the store");
    assert.equal(ordersFor(email).length, 0);
    await ctx.setOffline(false);
    await page.click("#checkout-btn");
    await page.waitForURL(/\/checkout\?order=/);
    await ctx.close();
  });

  test("a failing or offline API shows a retry, not a broken page", async () => {
    const { ctx, page } = await open(PHONE);
    await page.goto("/shop");
    await setCart(page, [{ productId: "wallpapers", quantity: 1 }]);
    await page.route("**/api/cart/price", (r) => r.fulfill({ status: 500, body: "{}", contentType: "application/json" }));
    await page.goto("/cart");
    await page.waitForSelector("[data-retry]");
    await page.unroute("**/api/cart/price");
    await page.click("[data-retry]");
    await page.waitForSelector(".cart-line");
    // Store down entirely: product pages keep their static buttons, the cart says so.
    await page.route("**/api/**", (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "store_offline", message: "offline" } }) }));
    await page.goto("/shop/wallpapers");
    // The static fallback stays (this product is a draft in data/, so it reads "Coming soon").
    await page.waitForSelector("[data-buy] .btn");
    await page.goto("/cart");
    await page.waitForSelector("text=offline for maintenance");
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("unavailable, unpublished and deleted products in a cart block checkout until removed", async () => {
    const { ctx, page } = await open(DESK);
    await page.goto("/shop");
    await setCart(page, [{ productId: "dev-paused", quantity: 1 }, { productId: "dev-unpublished", quantity: 1 }, { productId: "gone-forever", quantity: 1 }, { productId: "wallpapers", quantity: 1 }]);
    await page.goto("/cart");
    await page.waitForSelector(".cart-problem");
    assert.equal(await page.locator(".cart-line.has-problem").count(), 3);
    assert.ok(await page.locator("#checkout-btn").isDisabled());
    for (let i = 0; i < 3; i++) {
      await page.locator(".has-problem [data-remove]").first().click();
      await page.waitForFunction((n) => document.querySelectorAll(".cart-line.has-problem").length === n, 2 - i);
    }
    await page.waitForSelector("#checkout-btn:not([disabled])");
    // An unpublished product has no page at all.
    assert.equal((await page.goto("/shop/dev-unpublished")).status(), 404);
    await ctx.close();
  });

  test("Your Stacc on a phone: follow with Auto-Stacc, browse both views, download a selection", async () => {
    const { ctx, page } = await open(PHONE);
    await signUp(page, unique("stacc"));
    await page.goto("/library");
    await page.waitForSelector("text=Nothing Stacc'd yet.");
    await page.goto("/projects");
    await page.click("[data-follow='glitches-and-stitches']");
    await page.check("[data-auto='glitches-and-stitches']");
    await page.waitForSelector("text=Auto-Stacc on.");
    await page.goto("/library");
    await page.waitForSelector(".stacc-project h2:has-text('Glitches & Stitches')");
    await page.waitForSelector(".stacc-asset:has-text('auto-stacc')");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scroll");
    await page.click("[data-view=kinds]");
    await page.waitForSelector("[data-view=kinds][aria-pressed=true]");
    await page.check(".stacc-group [data-select-group]");
    await page.waitForSelector("text=1 item selected");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("[data-download-selected]")]);
    assert.match(download.suggestedFilename(), /dev-free/);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  // Signs up, follows Glitches & Stitches with Auto-Stacc (so a free item is owned), then opens Your Stacc.
  async function ownedStacc(page) {
    await signUp(page, unique("worker"));
    await page.goto("/projects");
    await page.click("[data-follow='glitches-and-stitches']");
    await page.check("[data-auto='glitches-and-stitches']");
    await page.waitForSelector("text=Auto-Stacc on.");
  }

  // Filters by the first format listed: the view redraws, the box keeps focus and the owned file still shows.
  async function filterKeepsFocus(page) {
    const format = await page.locator("[data-filter=format] option:not([value=''])").first().getAttribute("value");
    await page.selectOption("[data-filter=format]", format);
    await page.waitForFunction((f) => document.activeElement?.dataset.filter === "format" && document.activeElement.value === f, format);
    await page.waitForSelector(".stacc-asset:has-text('auto-stacc')");
    await page.click("[data-view=kinds]");
    await page.waitForSelector("[data-view=kinds][aria-pressed=true]");
    await page.waitForSelector(".stacc-group .stacc-asset:has-text('auto-stacc')");
  }

  test("Your Stacc's model runs on a background thread (a Web Worker) and the page draws from its answers", async () => {
    const { ctx, page } = await open(DESK);
    await ownedStacc(page);
    const started = page.waitForEvent("worker");
    await page.goto("/library");
    const worker = await started;
    assert.match(worker.url(), /\/js\/stacc-worker\.js$/);
    await page.waitForSelector(".stacc-project h2:has-text('Glitches & Stitches')");
    await page.waitForSelector(".stacc-asset:has-text('auto-stacc')");
    assert.equal(await worker.evaluate(() => typeof self.GS.stacc.answer), "function");
    await filterKeepsFocus(page);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("Your Stacc falls back to the page when Worker is missing or its script fails to load", async () => {
    const { ctx, page } = await open(DESK);
    await ownedStacc(page);
    // No Worker at all (old browsers, file:// previews).
    const bare = await ctx.newPage();
    bare.errors = [];
    bare.on("pageerror", (e) => bare.errors.push(e.message));
    await bare.addInitScript(() => Object.defineProperty(window, "Worker", { value: undefined }));
    await bare.goto("/library");
    await bare.waitForSelector(".stacc-asset:has-text('auto-stacc')");
    assert.equal(bare.workers().length, 0);
    await filterKeepsFocus(bare);
    assert.deepEqual(bare.errors, []);
    // A worker that can't load: the same model runs on the page.
    await page.route("**/js/stacc-worker.js", (r) => r.fulfill({ status: 404, body: "" }));
    await page.goto("/library");
    await page.waitForSelector(".stacc-asset:has-text('auto-stacc')");
    await filterKeepsFocus(page);
    assert.deepEqual(page.errors.filter((m) => !/404|Failed to load/.test(m)), []);
    await ctx.close();
  });

  test("empty states: cart, library when logged out, library with nothing in it", async () => {
    const { ctx, page } = await open(PHONE);
    await page.goto("/cart");
    await page.waitForSelector("text=Your cart is empty");
    await page.goto("/library");
    await page.waitForSelector("text=Locked");
    await signUp(page, unique("empty"));
    await page.waitForSelector("text=Email confirmed");
    await page.waitForSelector("text=Nothing in Your Stacc yet.");
    await page.goto("/library");
    await page.waitForSelector("text=Nothing Stacc'd yet.");
    await ctx.close();
  });

  test("an expired session sends account pages back to login", async () => {
    const { ctx, page } = await open(DESK);
    const email = unique("expiry");
    await signUp(page, email);
    await page.goto("/settings/orders");
    await page.waitForSelector("text=No orders yet.");
    sql(t.stateDir, `UPDATE session SET expiresAt = '2000-01-01T00:00:00.000Z' WHERE userId = (SELECT id FROM "user" WHERE email = '${email}')`);
    await page.goto("/settings/orders");
    await page.waitForURL(/\/login\?next=%2Fsettings%2Forders$/);
    await ctx.close();
  });

  test("settings on a computer: devices, an email switch, the data download, then deleting the account", async () => {
    const { ctx, page } = await open({ ...DESK, acceptDownloads: true });
    const email = unique("settings");
    await signUp(page, email);
    // A second device, signed in elsewhere.
    const other = await t.browser.newContext({ baseURL: t.base });
    const tab = await other.newPage();
    await tab.goto("/login");
    await tab.fill("#email", email);
    await tab.fill("#password", "browser-pass-123");
    await tab.click("button[type=submit]");
    await tab.waitForURL(t.base + "/dashboard");

    await page.goto("/settings/security");
    await page.waitForSelector(".device-here");
    assert.equal(await page.locator(".device").count(), 2);
    await page.click("[data-sign-out-others]");
    await page.waitForSelector("[data-devices] .msg:has-text('Every other device is signed out.')");
    assert.equal(await page.locator(".device").count(), 1);
    await tab.goto("/settings");
    await tab.waitForURL(/\/login\?next=%2Fsettings$/);
    await other.close();

    await page.goto("/settings/email");
    const sw = page.locator("#pref-newReleases");
    assert.equal(await sw.isChecked(), false, "off until you turn it on");
    await sw.click();
    await page.waitForSelector(".panel .msg:has-text('Saved.')");
    await page.reload();
    await page.waitForSelector("#pref-newReleases");
    assert.equal(await page.locator("#pref-newReleases").isChecked(), true, "and it stays on");

    await page.goto("/settings/privacy");
    const [file] = await Promise.all([page.waitForEvent("download"), page.click("[data-export-now]")]);
    assert.match(file.suggestedFilename(), /^autostacc-data-\d{4}-\d\d-\d\d\.json$/);
    const data = JSON.parse(fs.readFileSync(await file.path(), "utf8"));
    assert.equal(data.account.email, email);
    assert.equal(data.emailPreferences.newReleases, true);

    // The danger zone: closed, then the button only wakes once the email typed matches.
    assert.equal(await page.locator("[data-form=delete]").isVisible(), false);
    await page.click("[data-delete-start]");
    const go = page.locator("[data-form=delete] button[type=submit]");
    await page.fill("#delete-password", "browser-pass-123");
    await page.fill("#delete-email", "someone@else.dev");
    assert.equal(await go.isDisabled(), true);
    await page.fill("#delete-email", email);
    await page.fill("#delete-password", "wrong-password-9");
    await go.click();
    await page.waitForSelector("[data-delete] .msg.error:has-text(\"That password isn't right.\")");
    await page.fill("#delete-password", "browser-pass-123");
    await go.click();
    await page.waitForSelector("h2:has-text('Your account is deleted')");
    await page.goto("/settings");
    await page.waitForURL(/\/login\?next=%2Fsettings$/);
    assert.equal(sql(t.stateDir, `SELECT COUNT(*) AS n FROM "user" WHERE email = '${email}'`)[0].n, 0);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("settings on a phone: the list, one section at a time with the way back, rename, log out from the account menu", async () => {
    const { ctx, page } = await open(PHONE);
    await signUp(page, unique("account"));
    await page.goto("/settings");
    assert.ok(await page.locator(".settings-nav a[href='/settings/security']").isVisible(), "the list of sections");
    assert.equal(await page.locator("#settings-app").isVisible(), false, "no section yet");
    assert.equal(new URL(page.url()).pathname, "/settings");
    await page.click(".settings-nav a[href='/settings/profile']");
    await page.waitForURL(t.base + "/settings/profile");
    await page.waitForSelector("[data-form=profile]");
    assert.equal(await page.locator(".settings-nav").isVisible(), false, "one level at a time");
    assert.ok(await page.locator(".crumbs a[href='/settings']").isVisible(), "the way back");
    assert.equal(await page.locator("h1").textContent(), "Profile");
    assert.equal(await page.title(), "Profile · Settings · AutoStacc");
    await page.fill("#name", "Renamed Human");
    await page.click("[data-form=profile] button[type=submit]");
    await page.waitForSelector("[data-form=profile] .msg:has-text('Saved.')");
    await page.goto("/account");
    await page.waitForURL(t.base + "/settings/orders");
    await page.waitForSelector("text=No orders yet.");
    await page.click(".topbar .account-button");
    assert.ok(await page.locator(".account-panel >> text=Renamed Human").isVisible(), "the menu says who you are");
    await page.click(".topbar .account-panel [data-signout]");
    await page.waitForURL(t.base + "/");
    await page.goto("/library");
    await page.waitForSelector("text=Locked");
    await ctx.close();
  });

  test("an aborted page-change animation is never an uncaught error; real errors still are", async () => {
    const { ctx, page } = await open(PHONE);
    await page.goto("/");
    await page.evaluate(() => { Promise.reject(new DOMException("Transition was aborted because of invalid state. ViewTransition opt-in disabled", "InvalidStateError")); });
    await page.waitForTimeout(200);
    assert.deepEqual(page.errors, []);
    await page.evaluate(() => { Promise.reject(new Error("a real bug")); });
    await page.waitForTimeout(200);
    assert.deepEqual(page.errors, ["a real bug"]);
    await ctx.close();
  });

  test("an expired download link explains itself", async () => {
    const { ctx, page } = await open(PHONE);
    await page.goto("/api/downloads/eyJmIjoicGZfeCIsIngiOjF9.bad");
    await page.waitForURL(/\/library\?download=denied/);
    await page.waitForSelector("text=isn't yours or no longer works");
    await ctx.close();
  });

  test("phone menu: the closed drawer can't be tabbed into; opening moves focus in; Escape closes and returns focus", async () => {
    const { ctx, page } = await open(PHONE);
    await page.goto("/");
    assert.equal(await page.evaluate(() => document.querySelector(".side").inert), true);
    await page.click("[data-tab-menu]");
    await page.waitForSelector(".side.open");
    assert.equal(await page.evaluate(() => document.activeElement.className), "side-close");
    assert.equal(await page.evaluate(() => document.querySelector("main").inert), true);
    await page.keyboard.press("Tab");
    assert.ok(await page.evaluate(() => Boolean(document.activeElement.closest(".side"))), "Tab stays in the drawer");
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => document.activeElement.hasAttribute("data-tab-menu")), true, "focus returns to the Menu button");
    assert.equal(await page.locator(".menu-toggle").isVisible(), false, "no second menu button in the top bar");
    assert.equal(await page.locator(".topbar-brand").isVisible(), true, "the logo is there instead");
    assert.equal(await page.evaluate(() => document.querySelector(".side").inert && !document.querySelector("main").inert), true);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("a project's own menu on a phone: opens below its header, the page behind is inert, Escape closes and returns focus", async () => {
    const { ctx, page } = await open(PHONE);
    await page.goto("/autostacc/glitches-and-stitches/music");
    assert.equal(await page.locator(".side").count(), 0, "no AutoStacc sidebar inside a project");
    assert.equal(await page.getAttribute(".as-home", "href"), "/", "the AutoStacc logo goes to the home page");
    assert.equal(await page.getAttribute(".ph-logo", "href"), "/autostacc/glitches-and-stitches", "the project's logo goes to its home");
    assert.equal(await page.locator(".ph-logo .ph-mark").count(), 1);
    assert.equal(await page.locator(".ph-nav").isVisible(), false);
    await page.click(".ph-toggle");
    await page.waitForSelector(".ph-nav.open");
    assert.equal(await page.getAttribute(".ph-toggle", "aria-expanded"), "true");
    assert.equal(await page.evaluate(() => document.querySelector("main").inert), true);
    assert.equal(await page.getAttribute(".ph-nav a[aria-current]", "href"), "/autostacc/glitches-and-stitches/music");
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => document.activeElement.className), "ph-toggle");
    assert.equal(await page.evaluate(() => !document.querySelector(".ph-nav.open") && !document.querySelector("main").inert), true);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("computer sidebar: an icon rail that expands, and the choice is remembered", async () => {
    const { ctx, page } = await open(DESK);
    await page.goto("/about");
    const width = () => page.evaluate(() => document.querySelector(".side").getBoundingClientRect().width);
    assert.ok((await width()) < 100, "starts as a rail");
    assert.equal(await page.getAttribute(".side-collapse", "aria-expanded"), "false");
    await page.click(".side-collapse");
    await page.waitForFunction(() => document.querySelector(".side").getBoundingClientRect().width > 200);
    await page.goto("/shop");
    assert.ok((await width()) > 200, "stays expanded on the next page");
    assert.equal(await page.getAttribute(".side-collapse", "aria-expanded"), "true");
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("store browser: a card opens its project's items with it selected; the address keeps the state; Back undoes it", async () => {
    const { ctx, page } = await open(DESK);
    await page.goto("/shop");
    const first = await page.locator(".grid .card").count();
    await page.click('.grid .card [data-select="serum-presets"]');
    await page.waitForSelector('.shop-selected .card[data-product="serum-presets"]');
    assert.match(page.url(), /\/shop\?project=glitches-and-stitches&item=serum-presets$/);
    assert.ok((await page.getAttribute(".shop-selected .card", "class")).includes("look-glitches-and-stitches"), "wears its project's look");
    assert.equal(await page.evaluate(() => document.activeElement.dataset.select), "serum-presets");
    assert.equal(await page.locator('[data-filter=project] [aria-pressed=true]').innerText(), "Glitches & Stitches");
    await page.reload();
    await page.waitForSelector('.shop-selected .card[data-product="serum-presets"]');
    await page.goBack();
    await page.waitForFunction(() => !document.querySelector(".shop-selected .card"));
    assert.equal(await page.locator(".grid .card").count(), first);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("keyboard only: add to cart and reach checkout", async () => {
    const { ctx, page } = await open(DESK);
    await page.goto("/shop/sample-pack-vol1");
    await page.locator("[data-buy] [data-add-to-cart]").focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector("[data-buy] .in-cart:focus");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/cart/);
    await ctx.close();
  });

  test("removing a cart line by keyboard keeps focus in the cart and announces it", async () => {
    const { ctx, page } = await open(DESK);
    await page.goto("/shop");
    await setCart(page, [{ productId: "wallpapers", quantity: 1 }, { productId: "vj-loops", quantity: 1 }]);
    await page.goto("/cart");
    await page.locator("[data-remove]").first().focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelectorAll(".cart-line").length === 1);
    assert.equal(await page.evaluate(() => document.activeElement.matches("[data-remove], #checkout-btn")), true);
    await page.waitForFunction(() => [...document.querySelectorAll("[role=status]")].some((el) => /Removed/.test(el.textContent)));
    await ctx.close();
  });

  test("the payment-waiting screen is drawn once, not on every poll", async () => {
    const { ctx, page } = await open(PHONE);
    await toMockPay(page, unique("waiting"));
    const url = new URL(page.url());
    // Never pay: the page polls a pending order. The status element must survive the polls.
    await page.goto(`/checkout?order=${url.searchParams.get("order")}`);
    await page.waitForSelector("[data-waiting]");
    await page.evaluate(() => (document.querySelector("[data-waiting]").dataset.mark = "same"));
    await page.waitForTimeout(4000);
    assert.equal(await page.evaluate(() => document.querySelector("[data-waiting]") && document.querySelector("[data-waiting]").dataset.mark), "same");
    await ctx.close();
  });

  test("anonymous: the home page is a public cover; the app sends you to log in, then back where you were going", async () => {
    const { ctx, page } = await open(DESK);
    const privateCalls = [];
    page.on("request", (r) => { if (/\/api\/(library|orders|projects)/.test(r.url())) privateCalls.push(r.url()); });
    await page.goto("/");
    await page.waitForSelector("main >> text=straight from the artists");
    assert.ok(await page.locator("main a[href='/login#signup']").first().isVisible(), "Create account on the cover");
    assert.ok(await page.locator(".topbar a[href='/login']").isVisible(), "Log in in the top bar");
    assert.equal(await page.locator(".topbar .account-button").isVisible(), false, "no account menu for a stranger");
    assert.equal(await page.locator(".side a[href='/dashboard']").isVisible(), false, "no app links for a stranger");
    assert.ok(await page.locator("[data-shop] .card").count() > 0, "featured products from the catalog");
    assert.deepEqual(privateCalls, [], "the cover asks nothing about the visitor's things");
    for (const p of ["/dashboard", "/settings", "/settings/security"]) {
      await page.goto(p);
      await page.waitForURL(new RegExp(`/login\\?next=${encodeURIComponent(p)}$`));
      await page.waitForSelector("[data-form=signin]");
    }
    for (const p of ["/projects", "/shop", "/about"]) {
      await page.goto(p);
      assert.equal(new URL(page.url()).pathname, p, `${p} stays public`);
    }
    // An account, signed out, then back in through the gate: login returns to the page that asked.
    const email = unique("gate");
    await signUp(page, email);
    await logOut(page);
    await page.goto("/settings/security");
    await page.waitForURL(/\/login\?next=%2Fsettings%2Fsecurity$/);
    await page.fill("#email", email);
    await page.fill("#password", "browser-pass-123");
    await page.click("button[type=submit]");
    await page.waitForURL(t.base + "/settings/security");
    await page.waitForSelector("[data-form=password]");
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("signed in: the app's navigation, dashboard, account, settings and Your Stacc; log out returns to the public site", async () => {
    const { ctx, page } = await open(DESK);
    await signUp(page, unique("app"));
    await page.waitForSelector("h1:has-text('Dashboard')");
    await page.waitForSelector("[data-stacc-glance] >> text=Nothing in Your Stacc yet.");
    assert.ok(await page.locator(".side a[href='/dashboard'][aria-current=page]").isVisible(), "the app group in the sidebar");
    assert.ok(await page.locator(".side a[href='/library']").isVisible());
    assert.equal(await page.locator(".topbar a[href='/login']").isVisible(), false, "no Log in once signed in");
    // The account menu: closed until asked, then every account destination (no Control Center for a customer).
    const menu = page.locator(".topbar .account-panel");
    assert.equal(await menu.isVisible(), false);
    await page.click(".topbar .account-button");
    assert.equal(await page.getAttribute(".topbar .account-button", "aria-expanded"), "true");
    for (const href of ["/dashboard", "/library", "/studio", "/settings"]) assert.ok(await menu.locator(`a[href='${href}']`).isVisible(), href);
    assert.equal(await menu.locator("a[href='/admin']").count(), 0);
    assert.ok(await menu.locator("a[href='/dashboard'][aria-current=page]").isVisible(), "the menu marks where you are");
    await page.keyboard.press("Escape");
    assert.equal(await menu.isVisible(), false, "Escape closes it");
    assert.equal(await page.evaluate(() => document.activeElement.className), "account-button", "and gives focus back");
    await page.click(".topbar .account-button");
    await page.click("main h1");
    assert.equal(await menu.isVisible(), false, "a click elsewhere closes it");
    await page.goto("/");
    assert.ok(await page.locator("main a[href='/dashboard']").first().isVisible(), "the cover offers the dashboard");
    assert.equal(await page.locator("main a[href='/login#signup']").first().isVisible(), false);
    for (const [p, ready] of [["/settings/orders", "text=No orders yet."], ["/settings/security", "[data-form=password]"], ["/settings/email", ".switch"],
      ["/settings/privacy", "[data-export-now]"], ["/library", "text=Nothing Stacc'd yet."]]) {
      await page.goto(p);
      await page.waitForSelector(ready);
      assert.equal(new URL(page.url()).pathname, p);
    }
    // On a computer, Settings opens Profile beside the list, at Profile's own address.
    await page.goto("/settings");
    await page.waitForSelector("[data-form=profile]");
    assert.equal(new URL(page.url()).pathname, "/settings/profile");
    assert.ok(await page.locator(".settings-nav a[href='/settings/profile'][aria-current=page]").isVisible());
    await logOut(page);
    await page.waitForSelector(".topbar a[href='/login']:visible");
    await page.goto("/dashboard");
    await page.waitForURL(/\/login\?next=%2Fdashboard$/);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

});
