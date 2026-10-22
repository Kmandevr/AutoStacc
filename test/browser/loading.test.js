// Loading placeholders (js/skeleton.js, css/skeleton.css) in real Chromium against its own local store: a region is
// aria-busy with one spoken "Loading…" while it loads and not after; placeholders take the region's own slots and keep
// their size; a busy button keeps its size and label; nothing moves under reduced motion. Usage: npm run test:browser.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { browserStore, DESK, settle } from "../support/browser.js";

const t = browserStore({ name: "loading", port: 8832 });
const { open } = t;

// A store page (it loads js/util.js) with the helper and its sheet added, and an empty test region in <main>.
async function withHelper(device = DESK, reducedMotion = "no-preference") {
  const { ctx, page } = await open(device);
  await page.emulateMedia({ reducedMotion });
  await page.goto("/discover?tab=projects");
  await settle(page);
  await page.addStyleTag({ url: "/css/skeleton.css" });
  await page.addScriptTag({ url: "/js/skeleton.js" });
  await page.evaluate(() => {
    const box = document.createElement("section");
    box.innerHTML = `<div id="sk-grid"></div><ul id="sk-list"></ul><button id="sk-btn" class="btn" type="button">Log in</button>`;
    Object.assign(box.firstElementChild.style, { display: "grid", gridTemplateColumns: "repeat(3, 200px)", gap: "16px" });
    document.querySelector("main").append(box);
  });
  return { ctx, page };
}

describe("loading placeholders in the browser", { concurrency: true }, () => {
  test("a loading region is busy, spoken once and hidden shapes; done() clears both", async () => {
    const { ctx, page } = await withHelper();
    const busy = await page.evaluate(() => {
      const grid = window.GS.skeleton.show(document.getElementById("sk-grid"), "card", 3);
      return {
        busy: grid.getAttribute("aria-busy"),
        cards: grid.querySelectorAll(":scope > .sk.sk-card[aria-hidden=true]").length,
        spoken: [...grid.children].filter((c) => c.getAttribute("aria-hidden") !== "true").map((c) => c.textContent),
        list: window.GS.skeleton.show(document.getElementById("sk-list"), "row", 2).querySelectorAll(":scope > li.sk-row").length
      };
    });
    assert.deepEqual(busy, { busy: "true", cards: 3, spoken: ["Loading…"], list: 2 });
    const after = await page.evaluate(() => {
      const grid = window.GS.skeleton.done(document.getElementById("sk-grid"));
      return { busy: grid.hasAttribute("aria-busy"), left: grid.children.length };
    });
    assert.deepEqual(after, { busy: false, left: 0 });
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("pending() clears itself once the region is first drawn", async () => {
    const { ctx, page } = await withHelper();
    const seen = await page.evaluate(async () => {
      const grid = window.GS.skeleton.pending(document.getElementById("sk-grid"), "panel", 2);
      const before = { busy: grid.getAttribute("aria-busy"), panels: grid.querySelectorAll(":scope > .sk-panel").length };
      grid.innerHTML = "<p>Drawn</p>";
      await new Promise((r) => setTimeout(r, 0));
      return { before, busy: grid.hasAttribute("aria-busy"), html: grid.innerHTML };
    });
    assert.deepEqual(seen, { before: { busy: "true", panels: 2 }, busy: false, html: "<p>Drawn</p>" });
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("no layout shift: placeholders fill the region's own slots and keep their size while they shimmer", async () => {
    const { ctx, page } = await withHelper();
    const rects = () => page.evaluate(() => [...document.querySelectorAll("#sk-grid > .sk")].map((el) => {
      const r = el.getBoundingClientRect();
      return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    }));
    await page.evaluate(() => window.GS.skeleton.show(document.getElementById("sk-grid"), "card", 3));
    const first = await rects();
    assert.equal(first.length, 3);
    for (const [, , w, h] of first) { assert.equal(w, 200, "a card takes its grid column"); assert.ok(h > 200, "a card has a cover and lines"); }
    await page.waitForTimeout(400);
    assert.deepEqual(await rects(), first, "placeholders moved while loading");
    // A busy button: disabled, aria-busy, spinner, same size, same label; off undoes it.
    const btn = await page.evaluate(() => {
      const b = document.getElementById("sk-btn");
      const size = () => [b.offsetWidth, b.offsetHeight];
      const before = size();
      window.GS.skeleton.busy(b, true);
      const on = { size: size(), disabled: b.disabled, busy: b.getAttribute("aria-busy"), spin: b.querySelectorAll(".spin[aria-hidden=true]").length, label: b.textContent.trim() };
      window.GS.skeleton.busy(b, false);
      return { before, on, off: { disabled: b.disabled, busy: b.hasAttribute("aria-busy"), spin: b.querySelectorAll(".spin").length } };
    });
    assert.deepEqual(btn.on, { size: btn.before, disabled: true, busy: "true", spin: 1, label: "Log in" });
    assert.deepEqual(btn.off, { disabled: false, busy: false, spin: 0 });
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  for (const reducedMotion of ["no-preference", "reduce"]) {
    test(`shimmer and spinner ${reducedMotion === "reduce" ? "stay still with" : "move without"} reduced motion`, async () => {
      const { ctx, page } = await withHelper(DESK, reducedMotion);
      const moving = await page.evaluate(() => {
        const sk = window.GS.skeleton;
        sk.show(document.getElementById("sk-grid"), "card", 2);
        sk.busy(document.getElementById("sk-btn"), true);
        const animated = (sel) => [...document.querySelectorAll(sel)].some((el) =>
          getComputedStyle(el, "::after").animationName !== "none" || getComputedStyle(el).animationName !== "none");
        return { shimmer: animated("#sk-grid > .sk"), spin: animated("#sk-btn .spin") };
      });
      const on = reducedMotion !== "reduce";
      assert.deepEqual(moving, { shimmer: on, spin: on });
      assert.deepEqual(page.errors, []);
      await ctx.close();
    });
  }
});
