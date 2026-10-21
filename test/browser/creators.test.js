// The creators page (/creators, js/creators-browse.js) in real Chromium against its own local store: AutoStacc and
// visible Studio creators as cards (never a suspended one), search held in the address, placeholders in the cards'
// own slots while loading, the built list when the store is offline, and no sideways scroll on a small phone.
// Usage: npm run test:browser.
import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import { sql } from "../support/client.js";
import { browserStore, DESK, settle } from "../support/browser.js";

const t = browserStore({ name: "creators", port: 8834 });
const { open } = t;
const T = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const creator = (id, name, status) => `INSERT INTO creators (id, slug, name, source, status, trusted, published, created_at, updated_at)
  VALUES ('${id}', '${id}', '${name}', 'studio', '${status}', 0, 1, ${T}, ${T});
  INSERT INTO projects (id, name, features, published, creator_id, slug, source, created_at, updated_at)
  VALUES ('${id}-p', '${name} Work', '[]', 1, '${id}', 'work', 'studio', ${T}, ${T});`;

describe("creators page in the browser", { concurrency: true }, () => {
  before(() => sql(t.stateDir, creator("cbrowse-seen", "Seen Maker", "active") + creator("cbrowse-gone", "Gone Maker", "suspended")));

  test("creators are listed as cards with their projects; search is held in the address", async () => {
    const { ctx, page } = await open(DESK);
    await page.goto("/creators");
    await page.waitForSelector(".cgrid .ccard");
    await settle(page);
    const grid = page.locator(".cgrid");
    assert.notEqual(await grid.getAttribute("aria-busy"), "true");
    const names = await page.locator(".ccard-name").allInnerTexts();
    assert.ok(names.includes("AutoStacc") && names.includes("Seen Maker"), names.join());
    assert.ok(!names.includes("Gone Maker"), "a suspended creator is never shown");
    const seen = page.locator(".ccard", { hasText: "Seen Maker" });
    assert.equal(await seen.locator(".ccard-name a").getAttribute("href"), "/cbrowse-seen");
    assert.equal(await seen.locator(".ccard-projects a").getAttribute("href"), "/cbrowse-seen/work");
    assert.equal(await seen.locator(".tag.unverified").count(), 1);
    assert.equal(await page.locator(".ccard", { hasText: "AutoStacc" }).locator(".tag.unverified").count(), 0);
    assert.equal(await page.locator(".ccard", { hasText: "AutoStacc" }).locator(".ccard-bio").count(), 1, "first-party bio from data/creators.js");

    await page.fill("#creators-q", "seen maker");
    await page.press("#creators-q", "Enter");
    await page.waitForURL((u) => u.search === "?q=seen+maker");
    await page.waitForFunction(() => document.querySelectorAll(".cgrid .ccard").length === 1);
    assert.deepEqual(await page.locator(".ccard-name").allInnerTexts(), ["Seen Maker"]);
    await page.goBack();
    await page.waitForFunction(() => document.querySelectorAll(".cgrid .ccard").length >= 2);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("placeholders fill the cards' own slots and the region is busy while loading", async () => {
    const { ctx, page } = await open(DESK);
    let release;
    const held = new Promise((r) => { release = r; });
    await page.route("**/api/creators*", async (route) => { await held; await route.continue(); });
    await page.goto("/creators");
    await page.waitForSelector(".cgrid .sk");
    assert.equal(await page.locator(".cgrid").getAttribute("aria-busy"), "true");
    const sk = await page.locator(".cgrid > .sk").first().boundingBox();
    release();
    await page.waitForSelector(".cgrid .ccard");
    const card = await page.locator(".cgrid > .ccard").first().boundingBox();
    assert.ok(Math.abs(sk.x - card.x) < 1 && Math.abs(sk.width - card.width) < 1, "same slot");
    assert.ok(sk.height >= 140, "a placeholder is card-sized");
    assert.notEqual(await page.locator(".cgrid").getAttribute("aria-busy"), "true");
    assert.equal(await page.locator(".cgrid .sk").count(), 0);
    await ctx.close();
  });

  test("offline: the built list of AutoStacc's creators stays, and a small phone never scrolls sideways", async () => {
    const { ctx, page } = await open({ viewport: { width: 320, height: 800 }, isMobile: true, hasTouch: true });
    await page.route("**/api/creators*", (route) => route.abort());
    await page.goto("/creators");
    await page.waitForSelector(".cgrid .ccard-static a[href='/autostacc']");
    assert.match(await page.locator(".browse-count").innerText(), /offline/i);
    assert.notEqual(await page.locator(".cgrid").getAttribute("aria-busy"), "true");
    await page.unroute("**/api/creators*");
    await page.goto("/creators");
    await page.waitForSelector(".cgrid .ccard");
    await settle(page);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scroll at 320px");
    await ctx.close();
  });
});
