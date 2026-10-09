// Browser and chaos tests for the store, in real Chromium against the local store (mock payments): the full purchase
// on a phone, then everything that tends to break it (double clicks, back button, refresh, offline, slow or failing
// API, cancelled and failed payments, expired sessions and links, unavailable products) plus layout and CSP checks.
// Usage: npm run test:browser  (needs Playwright: preinstalled in cloud sessions, `npm i -g playwright` elsewhere).
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { ROOT, outbox, linkIn, sql, unique } from "../support/client.js";

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
const { startDevServer } = require("../../scripts/dev.js");

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const DESK = { viewport: { width: 1280, height: 900 } };
let server, browser, base, stateDir;

before(async () => {
  stateDir = path.join(ROOT, ".wrangler", "test-browser");
  server = startDevServer({ port: 8803, stateDir, fresh: true, quiet: true, vars: { APP_ENV: "test", ADMIN_EMAILS: "owner@browser.test" } });
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
// Log out the way a visitor does: the account menu in the top bar, then Log out.
async function logOut(page, bar = ".topbar") {
  await page.click(`${bar} .account-button`);
  await page.click(`${bar} .account-panel [data-signout]`);
  await page.waitForURL(base + "/");
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
    await page.goto("/settings/orders");
    await page.waitForSelector("text=No orders yet.");
    sql(stateDir, `UPDATE session SET expiresAt = '2000-01-01T00:00:00.000Z' WHERE userId = (SELECT id FROM "user" WHERE email = '${email}')`);
    await page.goto("/settings/orders");
    await page.waitForURL(/\/login\?next=%2Fsettings%2Forders$/);
    await ctx.close();
  });

  test("settings on a computer: devices, an email switch, the data download, then deleting the account", async () => {
    const { ctx, page } = await open({ ...DESK, acceptDownloads: true });
    const email = unique("settings");
    await signUp(page, email);
    // A second device, signed in elsewhere.
    const other = await browser.newContext({ baseURL: base });
    const tab = await other.newPage();
    await tab.goto("/login");
    await tab.fill("#email", email);
    await tab.fill("#password", "browser-pass-123");
    await tab.click("button[type=submit]");
    await tab.waitForURL(base + "/dashboard");

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
    assert.equal(sql(stateDir, `SELECT COUNT(*) AS n FROM "user" WHERE email = '${email}'`)[0].n, 0);
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
    await page.waitForURL(base + "/settings/profile");
    await page.waitForSelector("[data-form=profile]");
    assert.equal(await page.locator(".settings-nav").isVisible(), false, "one level at a time");
    assert.ok(await page.locator(".crumbs a[href='/settings']").isVisible(), "the way back");
    assert.equal(await page.locator("h1").textContent(), "Profile");
    assert.equal(await page.title(), "Profile · Settings · AutoStacc");
    await page.fill("#name", "Renamed Human");
    await page.click("[data-form=profile] button[type=submit]");
    await page.waitForSelector("[data-form=profile] .msg:has-text('Saved.')");
    await page.goto("/account");
    await page.waitForURL(base + "/settings/orders");
    await page.waitForSelector("text=No orders yet.");
    await page.click(".topbar .account-button");
    assert.ok(await page.locator(".account-panel >> text=Renamed Human").isVisible(), "the menu says who you are");
    await page.click(".topbar .account-panel [data-signout]");
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
    await page.waitForURL(base + "/settings/security");
    await page.waitForSelector("[data-form=password]");
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("signed in: the app's navigation, dashboard, account, settings and Your Stacc; log out returns to the public site", async () => {
    const { ctx, page } = await open(DESK);
    await signUp(page, unique("app"));
    await page.waitForSelector("h1:has-text('Dashboard')");
    await page.waitForSelector("[data-dashboard-stacc] >> text=Nothing in Your Stacc yet.");
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
      ["/settings/privacy", "[data-export-now]"], ["/library", "text=Nothing owned yet."]]) {
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

  test("the signed-in pages fit a phone: no sideways scroll, no tiny buttons, no CSP errors", async () => {
    const { ctx, page } = await open({ viewport: { width: 320, height: 800 }, isMobile: true, hasTouch: true });
    await signUp(page, unique("app-phone"));
    for (const p of ["/dashboard", "/settings", "/settings/security", "/settings/privacy", "/studio", "/library", "/"]) {
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

  test("trust pages: in every footer, each one whole and linked to the others; licences on product pages; terms at sign-up and checkout", async () => {
    const { ctx, page } = await open(DESK);
    const TRUST = ["/help", "/contact", "/security", "/terms", "/privacy", "/refunds", "/license"];
    for (const start of ["/", "/autostacc/glitches-and-stitches"]) {
      await page.goto(start);
      for (const href of start === "/" ? TRUST : ["/help", "/terms", "/privacy", "/refunds"]) {
        assert.ok(await page.locator(`#site-footer a[href='${href}']`).count(), `${start} footer links ${href}`);
      }
    }
    for (const p of TRUST) {
      const res = await page.goto(p);
      assert.equal(res.status(), 200, p);
      assert.equal(await page.locator("h1").count(), 1, `${p} has one h1`);
      assert.ok(await page.locator(".prose h2, .prose h3").count() > 2, `${p} has its sections`);
      assert.ok(await page.locator(".prose-related a").count() >= 5, `${p} links the other trust pages`);
      assert.equal(await page.locator(".prose-notice").count(), 0, `${p} has no unconfirmed text`);
    }
    // The support address is the real one, never a placeholder.
    await page.goto("/contact");
    assert.ok(await page.locator("main a[href='mailto:support@autostacc.com']").count());
    // Each part of the "On this page" list jumps to its section.
    await page.goto("/privacy");
    const first = await page.locator(".prose-toc a").nth(2).getAttribute("href");
    await page.click(`.prose-toc a[href='${first}']`);
    assert.ok(await page.locator(first).isVisible());
    // The product page names its licence and links to the full terms.
    await page.goto("/shop/sample-pack-vol1");
    assert.ok(await page.locator(".license-box strong", { hasText: "Sound licence" }).isVisible());
    assert.ok(await page.locator(".license-box a[href='/license#sounds']").isVisible());
    await page.goto("/license#sounds");
    assert.ok(await page.locator("#sounds >> text=You can't").isVisible());
    await page.goto("/login#signup");
    await page.waitForSelector("[data-form=signup] a[href='/terms']");
    assert.ok(await page.locator("[data-form=signup] a[href='/privacy']").isVisible());
    await page.goto("/shop");
    await setCart(page, [{ productId: "wallpapers", quantity: 1 }]);
    await page.goto("/cart");
    await page.waitForSelector("#checkout-btn");
    for (const href of ["/terms", "/refunds", "/license"]) assert.ok(await page.locator(`main a[href='${href}']`).isVisible(), `cart links ${href}`);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("reduced motion: no looping or long animations, and every page still works", async () => {
    const { ctx, page } = await open({ ...DESK, reducedMotion: "reduce" });
    for (const p of ["/", "/shop", "/about", "/projects", "/privacy", "/autostacc/glitches-and-stitches", "/autostacc/glitches-and-stitches/music/hail", "/no-such-page"]) {
      await page.goto(p);
      await page.waitForTimeout(400);
      const busy = await page.evaluate(() => document.getAnimations().filter((a) => {
        const t = a.effect && a.effect.getComputedTiming();
        return a.playState === "running" && t && (t.iterations === Infinity || t.activeDuration > 1000);
      }).map((a) => `${a.animationName || a.constructor.name} on ${a.effect.target && (a.effect.target.className || a.effect.target.tagName)}`));
      assert.deepEqual(busy, [], `${p} keeps moving under reduced motion`);
      assert.ok(await page.locator("h1").isVisible(), `${p} still shows its heading`);
    }
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  for (const width of [320, 390, 768, 1280]) {
    test(`no sideways scroll, no tiny buttons, no CSP errors at ${width}px`, async () => {
      const { ctx, page } = await open({ viewport: { width, height: 800 }, isMobile: width < 700, hasTouch: width < 700 });
      await page.goto("/shop");
      await setCart(page, [{ productId: "wallpapers", quantity: 1 }, { productId: "dev-paused", quantity: 1 }]);
      for (const p of ["/shop", "/shop/stems-patchwork", "/cart", "/login", "/login#signup", "/library", "/checkout?order=ord_x", "/account", "/projects", "/", "/about", "/autostacc/glitches-and-stitches",
        "/privacy", "/terms", "/refunds", "/license", "/help", "/contact", "/security", "/no-such-page"]) {
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

  test("impersonation: the banner is on every page, names both people, and Exit returns to the Control Center", async () => {
    const shopper = await open(PHONE);
    const customer = unique("imp-shopper");
    await signUp(shopper.page, customer);
    await shopper.ctx.close();
    const { ctx, page } = await open(DESK);
    await signUp(page, "owner@browser.test");
    const id = sql(stateDir, `SELECT id FROM "user" WHERE email = '${customer}'`)[0].id;
    await page.goto("/admin");
    await page.click("#tab-customers");
    await page.click(`[data-preview="${id}"]`);
    await page.waitForSelector(".admin-preview h2");
    page.once("dialog", (d) => d.accept());
    await page.click("[data-impersonate]");
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
    await page.click(`[data-preview="${id}"]`);
    page.once("dialog", (d) => d.accept());
    await page.click("[data-impersonate]");
    await page.waitForURL((u) => u.pathname === "/dashboard");
    sql(stateDir, `UPDATE impersonations SET expires_at = '2000-01-01T00:00:00.000Z' WHERE ended_at IS NULL AND customer_user_id = '${id}'`);
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
    sql(stateDir, `INSERT INTO promotions (id, kind, name, percent_off, scope, scope_ids, starts_at, created_at, updated_at)
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
      assert.deepEqual(sql(stateDir, `SELECT total_cents, discount_cents, promo_code FROM orders WHERE email = '${email}'`),
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
      sql(stateDir, `UPDATE promotions SET ends_at = ${T} WHERE id IN ('promo_browsersale', 'promo_browsercode')`);
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
    const row = sql(stateDir, "SELECT id, price_cents, published FROM products WHERE title = 'Glitch Kit'")[0];
    assert.equal(row.price_cents, 450);
    assert.equal(row.published, 0, "a new product is a draft");
    sql(stateDir, "UPDATE creators SET trusted = 1");
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
