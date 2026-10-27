// Browser group for the Product Studio (docs/studio.md) against its own local store: from the Creator Dashboard's
// product list, make a product, land in the workspace at the Pac Builder, edit the Store Page (autosave, live preview),
// set the price, see Release refuse to publish without a file, and use the sidebar; on a phone, the sections drawer
// (Escape closes it, focus returns) with nothing scrolling sideways; a project's Events editor (title, date, time, time
// zone, place, tags) publishes an event and Music has tags, with no News editor and no "become the owner" offer.
// Usage: npm run test:browser.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { sql, unique } from "../support/client.js";
import { browserStore, PHONE, DESK } from "../support/browser.js";

const t = browserStore({ name: "studio", port: 8824 });
const { open, signUp } = t;
let productId = "";
let account = "";
async function logIn(page) {
  await page.goto("/login");
  await page.fill("#email", account);
  await page.fill("#password", "browser-pass-123");
  await page.click("button[type=submit]");
  await page.waitForURL((u) => u.pathname === "/" || u.pathname === "/dashboard");
}

describe("the Product Studio in the browser", () => {
  test("dashboard → product list → new product opens the Pac Builder; Store Page autosaves and previews; Pricing; Release blocks; sidebar", async () => {
    const { ctx, page } = await open(DESK);
    account = unique("studio-ps");
    await signUp(page, account);
    await page.goto("/studio");
    await page.fill("#cr-name", `PS Creator ${Date.now().toString(36)}`);
    await page.click("form[data-form=creator] button[type=submit]");
    await page.fill("#pr-name", "Studio Kits");
    await page.click("form[data-form=project] button[type=submit]");
    await page.waitForSelector(".bx-bar");
    await page.goto("/studio");
    await page.click("[data-products]");
    await page.waitForSelector("form[data-form=new]");
    assert.equal(await page.locator(".sp-card").count(), 0);
    await page.fill("form[data-form=new] [name=title]", "Night Drums");
    await page.selectOption("form[data-form=new] [name=type]", "sample-pack");
    await page.fill("form[data-form=new] [name=price]", "6");
    await page.click("form[data-form=new] button[type=submit]");

    // The new draft opens in the workspace at the Pac Builder, the main creation step.
    await page.waitForSelector('[data-ws-item="pacs"][aria-current="page"]');
    const row = sql(t.stateDir, "SELECT id, price_cents, published FROM products WHERE title = 'Night Drums'")[0];
    productId = row.id;
    assert.deepEqual([row.price_cents, row.published], [600, 0]);
    assert.match(page.url(), new RegExp(`#product=${row.id}&section=pacs$`));
    assert.equal(await page.locator("[data-ws-title]").innerText(), "Night Drums");
    assert.equal(await page.locator("[data-ws-status]").innerText(), "Draft");
    assert.equal(await page.locator(".sw-heading").innerText(), "Pac Builder");
    assert.equal(await page.locator("nav.ws-nav").getAttribute("aria-label"), "Product Studio sections");
    assert.equal(await page.locator("[data-ws-item]").count(), 6, "six sections; Team isn't shown yet");

    // Store Page: focus lands on its heading, the preview follows typing, and the edit autosaves.
    await page.click('[data-ws-item="store"]');
    await page.waitForSelector("#ss-title");
    assert.equal(await page.evaluate(() => document.activeElement.id), "sw-h", "focus moves to the section heading");
    assert.match(page.url(), /&section=store$/);
    await page.fill("#ss-title", "Night Drums Vol. 1");
    assert.equal(await page.locator(".sp-preview-title").innerText(), "Night Drums Vol. 1", "the preview reflects the title at once");
    assert.equal(await page.locator(".sp-preview-frame [data-buy], .sp-preview-frame [data-claim], .sp-preview-frame [data-wish]").count(), 0, "the preview can't sell");
    assert.equal(await page.locator(".sp-preview-frame button:not([disabled])").count(), 0, "every preview button is disabled");
    await page.waitForSelector("[data-ws-save]:text('All changes saved')", { timeout: 10000 });
    assert.equal(sql(t.stateDir, `SELECT title FROM products WHERE id = '${row.id}'`)[0].title, "Night Drums Vol. 1");
    await page.waitForSelector("[data-ws-title]:text('Night Drums Vol. 1')");
    // A value the server refuses says so, and the header says it couldn't save.
    await page.fill("#ss-title", "No");
    await page.waitForSelector("[data-ws-save]:text(\"Couldn't save\")", { timeout: 10000 });
    assert.equal(await page.locator("[data-ss-error]").isVisible(), true);
    assert.equal(sql(t.stateDir, `SELECT title FROM products WHERE id = '${row.id}'`)[0].title, "Night Drums Vol. 1");
    await page.fill("#ss-title", "Night Drums Vol. 1");
    await page.waitForSelector("[data-ws-save]:text('All changes saved')", { timeout: 10000 });

    // Pricing: the base price is saved by the server.
    await page.click('[data-ws-item="pricing"]');
    await page.fill("#pr-price", "7.50");
    await page.click("[data-pr-price] button[type=submit]");
    await page.waitForSelector("[data-pr-price] .msg:text('Price saved.')");
    assert.equal(sql(t.stateDir, `SELECT price_cents FROM products WHERE id = '${row.id}'`)[0].price_cents, 750);

    // Release: no file yet blocks publishing, on the page and on the server.
    await page.click('[data-ws-item="release"]');
    await page.waitForSelector(".sk-list[data-kind=blocking] li");
    assert.equal(await page.locator('[data-ws-item="release"] [data-ws-badge]').isVisible(), true, "the sidebar counts what blocks release");
    await page.click("[data-sw-release=publish]");
    await page.waitForSelector("[data-sw-note].error");
    assert.equal(sql(t.stateDir, `SELECT published FROM products WHERE id = '${row.id}'`)[0].published, 0);
    assert.equal(await page.locator("[data-ws-status]").innerText(), "Draft");

    // The sidebar reaches every section; a reload lands on the open one.
    for (const key of ["overview", "insights", "pacs"]) {
      await page.click(`[data-ws-item="${key}"]`);
      assert.equal(await page.getAttribute(`[data-ws-item="${key}"]`, "aria-current"), "page");
    }
    await page.reload();
    await page.waitForSelector('[data-ws-item="pacs"][aria-current="page"]');
    // Settings → Back to project returns to the product list, where the card opens it again.
    await page.click("[data-ws-menu]");
    await page.click("[role=menuitem]:text('Back to project')");
    await page.waitForSelector(".sp-card");
    assert.match(await page.locator(".sp-card").innerText(), /Night Drums Vol\. 1[\s\S]*\$7\.50[\s\S]*Draft/);
    await page.click(".sp-card a:text('Open')");
    await page.waitForSelector('[data-ws-item="overview"][aria-current="page"]');
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("on a phone the sections are a drawer: it opens, traps focus, closes with Escape, and nothing scrolls sideways", async () => {
    const { ctx, page } = await open(PHONE);
    await logIn(page);
    await page.goto(`/studio#product=${productId}&section=overview`);
    await page.waitForSelector("[data-ws-open]");
    assert.equal(await page.locator('[data-ws-item="store"]').isVisible(), false, "the sidebar starts closed");
    await page.click("[data-ws-open]");
    await page.waitForSelector('.ws-drawer-open [data-ws-item="store"]', { state: "visible" });
    assert.equal(await page.evaluate(() => document.activeElement.closest(".ws-nav") !== null), true, "focus moves into the drawer");
    for (let i = 0; i < 9; i++) await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.closest(".ws-nav") !== null), true, "focus stays inside the open drawer");
    await page.keyboard.press("Escape");
    await page.waitForSelector('[data-ws-item="store"]', { state: "hidden" });
    assert.equal(await page.evaluate(() => document.activeElement.hasAttribute("data-ws-open")), true, "focus returns to the Sections button");
    await page.click("[data-ws-open]");
    await page.click('[data-ws-item="store"]');
    await page.waitForSelector("#ss-title");
    await page.waitForSelector('[data-ws-item="store"]', { state: "hidden" }); // choosing a section closes the drawer
    assert.equal(await page.getAttribute("[data-ws-open]", "aria-expanded"), "false");
    for (const key of ["store", "pricing", "release", "overview"]) {
      await page.goto(`/studio#product=${productId}&section=${key}`);
      await page.waitForSelector(`[data-ws-item="${key}"][aria-current="page"]`, { state: "attached" });
      await page.waitForTimeout(300);
      const wide = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
      assert.ok(wide <= 0, `${key} overflows by ${wide}px at 390px`);
    }
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("Events: a new event with time, zone, place and tags is published; Music has tags; no News and no claim offer", async () => {
    const { ctx, page } = await open(DESK);
    await logIn(page);
    await page.goto("/studio");
    await page.waitForSelector("[data-content][data-kind=events]");
    assert.equal(await page.locator("[data-kind=news], [data-kind=shows], [data-claim]").count(), 0);
    await page.click("[data-content][data-kind=events]");
    await page.click("[data-act=open][data-id=new]");
    await page.fill("#cx-title", "Warehouse Night");
    await page.fill("#cx-date", "2030-06-12");
    await page.fill("#cx-time", "21:30");
    await page.fill("#cx-timeZone", "Europe/Berlin");
    await page.fill("#cx-city", "Berlin");
    await page.fill("#cx-country", "de");
    await page.fill("#cx-tags", "techno, Live-Set");
    await page.click("button[data-publish=true]");
    await page.waitForSelector("form[data-cx] .msg:text('Published.')");
    const ev = sql(t.stateDir, "SELECT event_date, start_time, time_zone, city, country, tags, published FROM project_events WHERE title = 'Warehouse Night'")[0];
    assert.deepEqual(ev, { event_date: "2030-06-12", start_time: "21:30", time_zone: "Europe/Berlin", city: "Berlin", country: "DE", tags: '["techno","live-set"]', published: 1 });
    await page.click("[data-act=list]");
    assert.match(await page.locator(".cx-item").innerText(), /Warehouse Night[\s\S]*Berlin, DE[\s\S]*techno/);
    await page.click(".cx-tabs a:text('Music')");
    await page.click("[data-act=open][data-id=new]");
    await page.waitForSelector("#cx-tags");
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });
});
