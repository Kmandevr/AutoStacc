// The community's parts of every page's frame in real Chromium, against its own local store with the community on
// (the other groups run with it off): the top-bar bell. Usage: npm run test:browser.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { unique, sql } from "../support/client.js";
import { browserStore, DESK } from "../support/browser.js";

const t = browserStore({ name: "community", port: 8836, vars: { FEATURES_ON: "community.forum" } });
const { open, signUp } = t;

describe("the community in the frame", () => {
  // The bell: what waits on you, with a link to each place. A founder with a held post in their community sees it
  // counted and opens the list; Escape closes it and gives focus back.
  test("the bell counts what waits on you and lists where", async () => {
    const { ctx, page } = await open(DESK);
    await signUp(page, unique("bell"));
    const call = (p, method, body) => page.evaluate(async ([p, method, body]) => (await fetch(p, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json(), [p, method, body]);
    await call("/api/community/me", "PUT", { displayName: `Bell ${Date.now().toString(36)}`, ageConfirmed: true });
    const { space } = await call("/api/community/spaces", "POST", { name: `Bell Space ${Date.now().toString(36)}` });
    sql(t.stateDir, `INSERT INTO community_holds (target_type, target_id, space_id, rule, reason, created_at) VALUES ('post', 'pst_bell', '${space.id}', 'links', 'A link', '2026-10-27T00:00:00.000Z')`);
    await page.goto("/shop");
    await page.waitForSelector(".topbar .bell-link .bell-count");
    assert.equal(await page.locator(".topbar .bell-link .bell-count").textContent(), "1");
    await page.click(".topbar .bell-link");
    assert.equal(await page.getAttribute(".topbar .bell-link", "aria-expanded"), "true");
    assert.equal(await page.getAttribute(`.bell-panel a[href="${space.manage}"]`, "href"), space.manage);
    await page.keyboard.press("Escape");
    assert.ok(await page.locator(".bell-panel").isHidden());
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains("bell-link")), true);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });
});
