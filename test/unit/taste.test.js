// The store's on-device history (js/taste.js): one event schema, the counting policy (a refresh isn't a second view,
// an impression counts once a day, 90 days and 400 events at most), the summary sent with recommendations, and off
// meaning nothing kept and nothing recorded.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

const source = fs.readFileSync(path.resolve(import.meta.dirname, "../../js/taste.js"), "utf8");

// A fresh browser at a chosen time: its own storage (or one that throws), a cart, and no page to record from.
function load({ blocked = false, cart = [] } = {}) {
  const store = new Map();
  let now = Date.parse("2026-10-09T12:00:00Z");
  const localStorage = {
    getItem: (k) => { if (blocked) throw new Error("blocked"); return store.has(k) ? store.get(k) : null; },
    setItem: (k, v) => { if (blocked) throw new Error("blocked"); store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); }
  };
  class FakeDate extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const window = { GS: { cart: { items: () => cart.map((productId) => ({ productId })) } } };
  vm.runInNewContext(source, { window, localStorage, Date: FakeDate, Math, JSON, document: { querySelector: () => null, addEventListener() {} } });
  return { taste: window.GS.taste, store, later: (ms) => { now += ms; } };
}

test("a refresh isn't a second view; an impression counts once a day; the summary adds up what's left", () => {
  const { taste, later } = load({ cart: ["in-cart"] });
  assert.equal(taste.record("view", { id: "a" }), true);
  assert.equal(taste.record("view", { id: "a" }), false, "within 30 minutes");
  later(31 * 60000);
  assert.equal(taste.record("view", { id: "a" }), true);
  taste.record("impression", { id: "b" });
  assert.equal(taste.record("impression", { id: "b" }), false, "same day");
  taste.record("impression", { id: "c" });
  taste.record("click", { id: "c" });
  taste.record("wishlist", { id: "w" });
  taste.record("wishlist", { id: "x" });
  taste.record("unwishlist", { id: "x" });
  taste.record("filter", { facet: "genre", value: "house" });
  taste.record("search", { q: "dark techno" });
  taste.record("dismiss", { id: "d" });
  taste.record("purchase", { id: "never" });
  const p = JSON.parse(JSON.stringify(taste.profile()));
  assert.equal(p.personalize, true);
  assert.deepEqual(p.interactions.find((i) => i.id === "a"), { id: "a", kind: "view", n: 2 });
  assert.ok(p.interactions.some((i) => i.id === "w" && i.kind === "wishlist"));
  assert.ok(!p.interactions.some((i) => i.id === "x"), "un-saved again");
  assert.ok(!p.interactions.some((i) => i.id === "never"), "purchases aren't recorded here");
  assert.deepEqual(p.shown, { b: 1 }, "opened products aren't 'shown and passed over'");
  assert.deepEqual(p.filters, { genre: { house: 1 } });
  assert.deepEqual(p.searches, ["dark techno"]);
  assert.deepEqual(p.dismissed, ["d"]);
  assert.deepEqual(p.cart, ["in-cart"]);
});

test("events older than 90 days are dropped", () => {
  const { taste, later } = load();
  taste.record("click", { id: "old" });
  later(91 * 86400000);
  taste.record("click", { id: "new" });
  assert.deepEqual(JSON.parse(JSON.stringify(taste.profile().interactions)).map((i) => i.id), ["new"]);
});

test("preferences are explicit and editable", () => {
  const { taste } = load();
  taste.setPref("genre", ["house", "house", "techno"]);
  assert.deepEqual(JSON.parse(JSON.stringify(taste.prefs())), { genre: ["house", "techno"] });
  taste.setPref("genre", []);
  assert.deepEqual(JSON.parse(JSON.stringify(taste.prefs())), {});
});

test("off: everything forgotten, nothing recorded, only the cart and the off switch are sent; on starts empty", () => {
  const { taste, store } = load({ cart: ["k"] });
  taste.record("click", { id: "a" });
  taste.setPref("genre", ["house"]);
  taste.set(false);
  assert.equal(store.get("gs:taste:v2"), undefined);
  assert.equal(taste.record("click", { id: "b" }), false);
  assert.deepEqual(JSON.parse(JSON.stringify(taste.profile())), { personalize: false, cart: ["k"] });
  taste.set(true);
  assert.equal(taste.enabled(), true);
  assert.equal(taste.signals(), 0);
});

test("blocked storage never breaks the store", () => {
  const { taste } = load({ blocked: true });
  taste.record("view", { id: "a" });
  assert.equal(taste.profile().personalize, true);
});
