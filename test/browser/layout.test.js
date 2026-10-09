// Layout and CSP sweeps in real Chromium against its own local store: every public and store page at 320, 390, 768 and
// 1280px, with no sideways scroll, no tiny buttons and no console errors. Usage: npm run test:browser.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { browserStore } from "../support/browser.js";

const t = browserStore({ name: "layout", port: 8805 });
const { open, setCart } = t;

// The sweeps only read pages, each in its own browser profile, so they run side by side against the one store.
describe("layout in the browser", { concurrency: true }, () => {
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
});
