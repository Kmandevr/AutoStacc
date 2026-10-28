// Layout and CSP sweeps in real Chromium against its own local store: every public and store page at 320, 390, 768 and
// 1280px, with no sideways scroll, no tiny buttons and no console errors; the signed-in pages on a phone; the trust
// pages and their links; the sidebar's links; reduced motion. Usage: npm run test:browser.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { unique } from "../support/client.js";
import { browserStore, DESK, settle } from "../support/browser.js";

const t = browserStore({ name: "layout", port: 8805 });
const { open, setCart, signUp } = t;

// Each test has its own browser profile and its own account (if any), so they run side by side against the one store.
describe("layout in the browser", { concurrency: true }, () => {
  for (const width of [320, 390, 768, 1280]) {
    test(`no sideways scroll, no tiny buttons, no CSP errors at ${width}px`, async () => {
      const { ctx, page } = await open({ viewport: { width, height: 800 }, isMobile: width < 700, hasTouch: width < 700 });
      await page.goto("/shop");
      await setCart(page, [{ productId: "wallpapers", quantity: 1 }, { productId: "dev-paused", quantity: 1 }]);
      for (const p of ["/shop", "/product?p=stems-patchwork", "/cart", "/login", "/login#signup", "/library", "/checkout?order=ord_x", "/account", "/discover", "/discover?tab=projects", "/", "/about", "/autostacc/glitches-and-stitches",
        "/privacy", "/terms", "/refunds", "/license", "/help", "/contact", "/security", "/no-such-page"]) {
        await page.goto(p);
        await settle(page);
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

  test("sidebar: the four hubs, Home, Store, Discover and Community; New & upcoming is Discover's tab; the footer links Discover and About", async () => {
    const { ctx, page } = await open(DESK);
    await page.goto("/discover?tab=projects");
    const names = (sel) => page.locator(`${sel} a`).evaluateAll((els) => els.map((el) => [el.getAttribute("href"), el.textContent.trim()]));
    assert.deepEqual(await names("[aria-labelledby=side-platform]"), [["/", "Home"], ["/shop", "Store"], ["/discover", "Discover"], ["/community", "Community"]]);
    assert.equal(await page.locator(".side-nav a[aria-current]").textContent(), "Discover");
    await page.goto("/discover/explore");
    assert.equal(await page.locator(".side-nav a[aria-current]").textContent(), "Discover", "New & upcoming sits in Discover");
    assert.equal(await page.locator(".discover-tabs a[aria-current]").textContent(), "New & upcoming");
    assert.ok(await page.locator("#site-footer a[href='/discover']").count(), "the footer links Discover");
    assert.ok(await page.locator("#site-footer a[href='/about']").count(), "the footer links About");
    await page.goto("/community");
    assert.equal(await page.locator(".side-nav a[aria-current]").getAttribute("href"), "/community", "community pages light up Community");
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  test("the signed-in pages fit a phone: no sideways scroll, no tiny buttons, no CSP errors", async () => {
    const { ctx, page } = await open({ viewport: { width: 320, height: 800 }, isMobile: true, hasTouch: true });
    await page.goto("/shop");
    const bar = () => page.locator(".tabbar > a:visible, .tabbar > button:visible").evaluateAll((els) => els.map((el) => el.textContent.trim()));
    assert.deepEqual(await bar(), ["Home", "Store", "Discover", "Community", "Log in"], "signed out");
    await signUp(page, unique("app-phone"));
    await page.goto("/shop");
    assert.deepEqual(await bar(), ["Home", "Store", "Discover", "Community", "You"], "signed in");
    await page.click(".tabbar [data-tab-menu]");
    assert.ok(await page.locator("#side.open a[href='/library']").isVisible(), "You opens Your Stacc and the rest");
    assert.equal(await page.locator("#side a[href='/studio']").isVisible(), false, "no Studio for someone who isn't a creator");
    for (const p of ["/dashboard", "/settings", "/settings/security", "/settings/privacy", "/studio", "/library", "/"]) {
      await page.goto(p);
      await settle(page);
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
    // The product page links to the licence and the terms the buyer accepts.
    await page.goto("/product?p=sample-pack-vol1");
    await page.waitForSelector("#product-app .product-info");
    for (const href of ["/license", "/terms", "/refunds"]) assert.ok(await page.locator(`#product-app a[href='${href}']`).isVisible(), `product page links ${href}`);
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
    for (const p of ["/", "/shop", "/about", "/discover", "/privacy", "/autostacc/glitches-and-stitches", "/autostacc/glitches-and-stitches/music/hail", "/no-such-page"]) {
      await page.goto(p);
      await settle(page);
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
});
