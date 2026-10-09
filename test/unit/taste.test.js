// The store's personal picks (js/taste.js): ranked from this browser's own history, never repeating what you've
// seen while something new is left, always one pick from a kind you haven't looked at, and nothing kept once off.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

const source = fs.readFileSync(path.resolve(import.meta.dirname, "../../js/taste.js"), "utf8");

// A fresh browser: its own storage (or one that throws, like a blocked one) and no page to record from.
function load({ blocked = false } = {}) {
  const store = new Map();
  const localStorage = {
    getItem: (k) => { if (blocked) throw new Error("blocked"); return store.has(k) ? store.get(k) : null; },
    setItem: (k, v) => { if (blocked) throw new Error("blocked"); store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); }
  };
  const window = { GS: {} };
  vm.runInNewContext(source, { window, localStorage, document: { querySelector: () => null, addEventListener() {} } });
  return { taste: window.GS.taste, store };
}

const P = (id, type, extra = {}) => ({ id, title: id, type, project: "gs", tags: [], formats: [], ...extra });
const catalog = [
  P("bass-presets", "presets", { tags: ["serum"] }), P("lead-presets", "presets", { tags: ["serum"] }),
  P("drum-pack", "sample-pack", { formats: ["WAV"] }), P("ep", "music", { formats: ["WAV"] }),
  P("loops", "vj-loops"), P("wallpapers", "visuals")
];
const typeLabel = (p) => p.type;

test("no picks without history, then unseen items close to what you opened, plus one different kind", () => {
  const { taste } = load();
  assert.equal(taste.picks(catalog, 3, { typeLabel }).length, 0);
  taste.record("views", "bass-presets");
  taste.record("adds", "bass-presets");
  const picks = taste.picks(catalog, 3, { typeLabel });
  assert.equal(picks.length, 3);
  assert.equal(picks[0].p.id, "lead-presets", "the same kind first");
  assert.equal(picks[0].reason, "Because you looked at bass-presets");
  assert.ok(!picks.some((x) => x.p.id === "bass-presets"), "not what you've already seen");
  assert.ok(picks.some((x) => x.reason === "Something different to try" && x.p.type !== "presets"), "one outside your habit");
  assert.equal(taste.rank(catalog, typeLabel)[0].id, "lead-presets");
});

test("items to skip (in your cart) are never picked", () => {
  const { taste } = load();
  taste.record("views", "bass-presets");
  taste.record("views", "drum-pack");
  const picks = taste.picks(catalog, 3, { typeLabel, skip: (p) => p.id === "lead-presets" });
  assert.ok(!picks.some((x) => x.p.id === "lead-presets"));
});

test("turning it off forgets everything and records nothing; turning it on starts empty", () => {
  const { taste, store } = load();
  taste.record("views", "bass-presets");
  taste.record("views", "ep");
  taste.set(false);
  assert.equal(store.get("gs:taste"), undefined, "history removed from storage");
  taste.record("views", "ep");
  taste.record("views", "loops");
  assert.equal(taste.signals(), 0);
  assert.equal(taste.picks(catalog, 3, { typeLabel }).length, 0);
  assert.deepEqual(taste.rank(catalog, typeLabel).map((p) => p.id), catalog.map((p) => p.id), "catalog order when off");
  taste.set(true);
  assert.equal(taste.enabled(), true);
  assert.equal(taste.signals(), 0);
});

test("blocked storage never breaks the store", () => {
  const { taste } = load({ blocked: true });
  taste.record("views", "ep");
  assert.equal(taste.rank(catalog, typeLabel).length, catalog.length);
});
