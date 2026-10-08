// Browser and chaos tests for the store, in real Chromium against the local store (mock payments): the full purchase
// on a phone, then everything that tends to break it (double clicks, back button, refresh, offline, slow or failing
// API, cancelled and failed payments, expired sessions and links, unavailable products) plus layout and CSP checks.
// Usage: npm run test:browser  (needs Playwright: preinstalled in cloud sessions, `npm i -g playwright` elsewhere).
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";
import { ROOT, outbox, linkIn, sql, unique } from "../support/client.js";

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
const { startDevServer } = require("../../scripts/dev.js");

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const DESK = { viewport: { width: 1280, height: 900 } };
let server, browser, base, stateDir;

before(async () => {
  stateDir = path.join(ROOT, ".wrangler", "test-browser");
  server = startDevServer({ port: 8803, stateDir, fresh: true, quiet: true, vars: { APP_ENV: "test" } });
  base = await server.ready;
  browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
}, { timeout: 240000 });
after(async () => { if (browser) await browser.close(); if (server) server.child.kill("SIGTERM"); });

// A fresh browser profile; collects console errors (CSP violations show up here) and uncaught exceptions. Each profile
// is its own visitor with its own client IP (as in the API tests), so the store's per-IP rate limits on sign-up and
// login don't make one test fail because of the others. Only requests to the local store carry it.
let visitors = 0;
async function open(device = PHONE) {
  const ctx = await browser.newContext({ ...device, baseURL: base });
  const n = ++visitors;
  await ctx.route((url) => url.href.startsWith(base), (route) =>
    route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": `10.250.${(n >> 8) & 255}.${n & 255}` } }));
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  // Newer Chromium logs an aborted page-change animation (the tests navigate faster than a view transition) as an
  // error; it isn't the page's error, so it doesn't count. Nor do messages from other sites' frames (the YouTube and
  // Deezer players probe features our Permissions-Policy denies). CSP violations and script errors on our pages still do.
  const NOT_OURS = /Failed to load resource|Transition was aborted because of invalid state/;
  const ours = (m) => { const u = m.location().url; return !u || u.startsWith(base) || !/^https?:/.test(u); };
  page.on("console", (m) => { if (m.type() === "error" && ours(m) && !NOT_OURS.test(m.text())) page.errors.push(m.text()); });
  return { ctx, page };
}
const ordersFor = (email) => sql(stateDir, `SELECT id, status FROM orders WHERE email = '${email}'`);
const setCart = (page, items) => page.evaluate((i) => localStorage.setItem("gs:cart", JSON.stringify(i)), items);

async function toMockPay(page, email, productId = "wallpapers") {
  await page.goto(`/shop/${productId}`);
  await page.locator("[data-buy] [data-add-to-cart]").click();
  await page.goto("/cart");
  await page.fill("#cart-email", email);
  await page.click("#checkout-btn");
  await page.waitForURL(/\/checkout\?order=.*mock=/);
  await page.waitForSelector("[data-mock=paid]");
}

async function signUp(page, email, password = "browser-pass-123") {
  await page.goto("/login#signup");
  await page.fill("#name", "Tester");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForSelector("text=Check");
  const mail = (await outbox(base, email)).find((m) => m.kind === "verify-email");
  await page.goto(new URL(linkIn(mail)).pathname + new URL(linkIn(mail)).search);
  await page.waitForURL((u) => u.pathname === "/dashboard");
}

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
    for (let i = 0; i < 3; i++) { await page.locator(".has-problem [data-remove]").first().click(); await page.waitForTimeout(300); }
    await page.waitForSelector("#checkout-btn:not([disabled])");
    // An unpublished product has no page at all.
    assert.equal((await page.goto("/shop/dev-unpublished")).status(), 404);
    await ctx.close();
  });

  test("Your Stacc on a phone: follow with Auto-Stacc, browse both views, download a selection", async () => {
    const { ctx, page } = await open(PHONE);
    await signUp(page, unique("stacc"));
    await page.goto("/library");
    await page.waitForSelector("text=Nothing owned yet.");
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
    await page.waitForSelector("text=Nothing owned yet.");
    await ctx.close();
  });

  test("an expired session sends account pages back to login", async () => {
    const { ctx, page } = await open(DESK);
    const email = unique("expiry");
    await signUp(page, email);
    await page.goto("/account");
    await page.waitForSelector("text=Orders");
    sql(stateDir, `UPDATE session SET expiresAt = '2000-01-01T00:00:00.000Z' WHERE userId = (SELECT id FROM "user" WHERE email = '${email}')`);
    await page.goto("/account");
    await page.waitForURL(/\/login\?next=%2Faccount$/);
    await ctx.close();
  });

  test("settings: rename, then log out from the account page", async () => {
    const { ctx, page } = await open(PHONE);
    await signUp(page, unique("account"));
    await page.goto("/settings");
    await page.fill("#name", "Renamed Human");
    await page.click("[data-form=profile] button[type=submit]");
    await page.waitForSelector("[data-form=profile] .msg:has-text('Saved.')");
    await page.goto("/account");
    await page.click("#account-app [data-signout]");
    await page.waitForURL(base + "/");
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
    await page.click(".menu-toggle");
    await page.waitForSelector(".side.open");
    assert.equal(await page.evaluate(() => document.activeElement.className), "side-close");
    assert.equal(await page.evaluate(() => document.querySelector("main").inert), true);
    await page.keyboard.press("Tab");
    assert.ok(await page.evaluate(() => Boolean(document.activeElement.closest(".side"))), "Tab stays in the drawer");
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => document.activeElement.className), "menu-toggle");
    assert.equal(await page.evaluate(() => document.querySelector(".side").inert && !document.querySelector("main").inert), true);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("a project's own menu on a phone: opens below its header, the page behind is inert, Escape closes and returns focus", async () => {
    const { ctx, page } = await open(PHONE);
    await page.goto("/projects/glitches-and-stitches/music");
    assert.equal(await page.locator(".side").count(), 0, "no AutoStacc sidebar inside a project");
    assert.equal(await page.getAttribute(".as-home", "href"), "/", "the AutoStacc logo goes to the home page");
    assert.equal(await page.getAttribute(".ph-logo", "href"), "/projects/glitches-and-stitches", "the project's logo goes to its home");
    assert.equal(await page.locator(".ph-logo .ph-mark").count(), 1);
    assert.equal(await page.locator(".ph-nav").isVisible(), false);
    await page.click(".ph-toggle");
    await page.waitForSelector(".ph-nav.open");
    assert.equal(await page.getAttribute(".ph-toggle", "aria-expanded"), "true");
    assert.equal(await page.evaluate(() => document.querySelector("main").inert), true);
    assert.equal(await page.getAttribute(".ph-nav a[aria-current]", "href"), "/projects/glitches-and-stitches/music");
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
    assert.equal(await page.locator(".topbar [data-signout]").isVisible(), false, "no Log out for a stranger");
    assert.equal(await page.locator(".side a[href='/dashboard']").isVisible(), false, "no app links for a stranger");
    assert.ok(await page.locator("[data-shop] .card").count() > 0, "featured products from the catalog");
    assert.deepEqual(privateCalls, [], "the cover asks nothing about the visitor's things");
    for (const p of ["/dashboard", "/account", "/settings"]) {
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
    await page.click(".topbar [data-signout]");
    await page.waitForURL(base + "/");
    await page.goto("/settings");
    await page.waitForURL(/\/login\?next=%2Fsettings$/);
    await page.fill("#email", email);
    await page.fill("#password", "browser-pass-123");
    await page.click("button[type=submit]");
    await page.waitForURL(base + "/settings");
    await page.waitForSelector("[data-form=profile]");
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("signed in: the app's navigation, dashboard, account, settings and Your Stacc; log out returns to the public site", async () => {
    const { ctx, page } = await open(DESK);
    await signUp(page, unique("app"));
    await page.waitForSelector("h1:has-text('Dashboard')");
    await page.waitForSelector("[data-dashboard-stacc] >> text=Nothing in Your Stacc yet.");
    assert.ok(await page.locator(".side a[href='/dashboard'][aria-current=page]").isVisible(), "the app group in the sidebar");
    assert.ok(await page.locator(".side a[href='/settings']").isVisible());
    assert.equal(await page.locator(".topbar a[href='/login']").isVisible(), false, "no Log in once signed in");
    assert.ok(await page.locator(".topbar [data-signout]").isVisible());
    await page.goto("/");
    assert.ok(await page.locator("main a[href='/dashboard']").first().isVisible(), "the cover offers the dashboard");
    assert.equal(await page.locator("main a[href='/login#signup']").first().isVisible(), false);
    for (const [p, ready] of [["/account", "text=Orders"], ["/settings", "[data-form=password]"], ["/library", "text=Nothing owned yet."]]) {
      await page.goto(p);
      await page.waitForSelector(ready);
      assert.equal(new URL(page.url()).pathname, p);
    }
    await page.click(".topbar [data-signout]");
    await page.waitForURL(base + "/");
    await page.waitForSelector(".topbar a[href='/login']:visible");
    await page.goto("/dashboard");
    await page.waitForURL(/\/login\?next=%2Fdashboard$/);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("the signed-in pages fit a phone: no sideways scroll, no tiny buttons, no CSP errors", async () => {
    const { ctx, page } = await open({ viewport: { width: 320, height: 800 }, isMobile: true, hasTouch: true });
    await signUp(page, unique("app-phone"));
    for (const p of ["/dashboard", "/account", "/settings", "/library", "/"]) {
      await page.goto(p);
      await page.waitForTimeout(700);
      const facts = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        small: [...document.querySelectorAll("main a, main button, main input, .topbar a, .topbar button")].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width && r.height && getComputedStyle(el).display !== "inline" && (r.height < 24 || r.width < 24);
        }).map((el) => el.outerHTML.slice(0, 80))
      }));
      assert.ok(facts.overflow <= 0, `${p} overflows by ${facts.overflow}px`);
      assert.deepEqual(facts.small, [], `${p} has small targets`);
    }
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  for (const width of [320, 390, 768, 1280]) {
    test(`no sideways scroll, no tiny buttons, no CSP errors at ${width}px`, async () => {
      const { ctx, page } = await open({ viewport: { width, height: 800 }, isMobile: width < 700, hasTouch: width < 700 });
      await page.goto("/shop");
      await setCart(page, [{ productId: "wallpapers", quantity: 1 }, { productId: "dev-paused", quantity: 1 }]);
      for (const p of ["/shop", "/shop/stems-patchwork", "/cart", "/login", "/login#signup", "/library", "/checkout?order=ord_x", "/account", "/projects", "/", "/about", "/projects/glitches-and-stitches"]) {
        await page.goto(p);
        await page.waitForTimeout(700);
        const facts = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - innerWidth,
          small: [...document.querySelectorAll("main a, main button, main input, main select")].filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width && r.height && getComputedStyle(el).display !== "inline" && (r.height < 24 || r.width < 24);
          }).map((el) => el.outerHTML.slice(0, 80))
        }));
        assert.ok(facts.overflow <= 0, `${p} overflows by ${facts.overflow}px`);
        assert.deepEqual(facts.small, [], `${p} has small targets`);
      }
      assert.deepEqual(page.errors, []);
      await ctx.close();
    });
  }
});
