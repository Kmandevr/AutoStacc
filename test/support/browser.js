// Browser test helpers: each test file starts its own local store (mock payments) and Chromium with browserStore(),
// so the groups in test/browser/ run in parallel without sharing a database. The site must be built first
// (npm run test:browser does it); stores here never rebuild dist/.
import { before, after } from "node:test";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";
import { ROOT, outbox, linkIn, sql } from "./client.js";

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
const { startDevServer } = require("../../scripts/dev.js");

export const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
export const DESK = { viewport: { width: 1280, height: 900 } };
export const ADMIN_EMAIL = "owner@browser.test";

// Registers the file's before/after hooks and returns its helpers; `base`, `stateDir` and `browser` are getters, set
// once the store is up.
export function browserStore({ name, port }) {
  let server, browser, base;
  const stateDir = path.join(ROOT, ".wrangler", `test-browser-${name}`);
  before(async () => {
    server = startDevServer({ port, stateDir, fresh: true, quiet: true, build: false, vars: { APP_ENV: "test", ADMIN_EMAILS: ADMIN_EMAIL } });
    base = await server.ready;
    browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  }, { timeout: 240000 });
  after(async () => { if (browser) await browser.close(); if (server) server.stop(); });

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

  // Opens a customer's preview in the Control Center and starts impersonating them. If the button never shows, the error
  // says what the preview showed instead (it once failed only in CI, and a bare timeout said nothing).
  async function startImpersonating(page, id) {
    await page.click(`[data-preview="${id}"]`);
    await page.waitForSelector(".admin-preview h2");
    page.once("dialog", (d) => d.accept());
    try {
      await page.click("[data-impersonate]", { timeout: 15000 });
    } catch (e) {
      throw new Error("no Impersonate button; the preview shows: " + (await page.locator("#customer-preview").innerText()).replace(/\s+/g, " ").slice(0, 500));
    }
  }

  return { get base() { return base; }, get browser() { return browser; }, stateDir, open, logOut, ordersFor, setCart, toMockPay, signUp, startImpersonating };
}
