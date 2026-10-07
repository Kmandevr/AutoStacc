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

// A fresh browser profile; collects console errors (CSP violations show up here) and uncaught exceptions.
async function open(device = PHONE) {
  const ctx = await browser.newContext({ ...device, baseURL: base });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
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
  await page.waitForURL(/\/library/);
}

describe("store in the browser", () => {
  test("phone: browse, add, pay as a guest, see it owned, download it", async () => {
    const { ctx, page } = await open(PHONE);
    const email = unique("phone-buyer");
    await toMockPay(page, email, "stems-patchwork");
    await page.click("[data-mock=paid]");
    await page.waitForSelector("text=CINCHED.");
    assert.equal(await page.evaluate(() => localStorage.getItem("gs:cart")), "[]");
    // Refresh after success: still paid, nothing doubled.
    await page.reload();
    await page.waitForSelector("text=CINCHED.");
    assert.deepEqual(ordersFor(email).map((o) => o.status), ["paid"]);
    await page.goto("/shop/stems-patchwork");
    await page.waitForSelector("[data-buy] .owned-badge");
    await page.goto("/library");
    await page.waitForSelector(".vault-item");
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
    await page.waitForSelector("text=CHECKOUT CANCELLED");
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
    await page.waitForSelector("text=PAYMENT FAILED");
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
    await page.waitForSelector("text=Signal lost");
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

  test("empty states: cart, library when logged out, library with nothing in it", async () => {
    const { ctx, page } = await open(PHONE);
    await page.goto("/cart");
    await page.waitForSelector("text=Nothing stitched in here yet.");
    await page.goto("/library");
    await page.waitForSelector("text=Locked");
    await signUp(page, unique("empty"));
    await page.waitForSelector("text=Nothing owned yet.");
    await page.waitForSelector("text=Email confirmed");
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
    await page.waitForURL(/\/login\?next=\/account/);
    await ctx.close();
  });

  test("account: rename, then log out", async () => {
    const { ctx, page } = await open(PHONE);
    await signUp(page, unique("account"));
    await page.goto("/account");
    await page.fill("#name", "Renamed Human");
    await page.click("[data-form=profile] button[type=submit]");
    await page.waitForSelector("[data-form=profile] .msg:has-text('Saved.')");
    await page.click("[data-signout]");
    await page.waitForURL(base + "/");
    await page.goto("/library");
    await page.waitForSelector("text=Locked");
    await ctx.close();
  });

  test("an expired download link explains itself", async () => {
    const { ctx, page } = await open(PHONE);
    await page.goto("/api/downloads/eyJmIjoicGZfeCIsIngiOjF9.bad");
    await page.waitForURL(/\/library\?download=denied/);
    await page.waitForSelector("text=isn't yours or no longer works");
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

  for (const width of [320, 390, 768, 1280]) {
    test(`no sideways scroll, no tiny buttons, no CSP errors at ${width}px`, async () => {
      const { ctx, page } = await open({ viewport: { width, height: 800 }, isMobile: width < 700, hasTouch: width < 700 });
      await page.goto("/shop");
      await setCart(page, [{ productId: "wallpapers", quantity: 1 }, { productId: "dev-paused", quantity: 1 }]);
      for (const p of ["/shop", "/shop/stems-patchwork", "/cart", "/login", "/login#signup", "/library", "/checkout?order=ord_x", "/account"]) {
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
