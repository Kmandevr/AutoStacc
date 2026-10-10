// What customers can get from published packs: a retired file only for 30 days and only to people who had access
// before it was retired (server/files/files.js stillDelivered, docs/packs.md H8), and bundle names that can't escape
// the folder they are unzipped into or collide on Windows and macOS (server/downloads/bundle.js layout).
import { test } from "node:test";
import assert from "node:assert/strict";
import { stillDelivered } from "../../server/files/files.js";
import { layout } from "../../server/downloads/bundle.js";

const day = 86400000;
const iso = (ms) => new Date(ms).toISOString();

test("retired files: earlier buyers for 30 days, nobody else", () => {
  const now = Date.parse("2026-10-10T12:00:00Z");
  const retired = { retired_at: iso(now - 5 * day) };
  assert.equal(stillDelivered({ retired_at: null }, iso(now)), true, "current files are for everyone");
  assert.equal(stillDelivered(retired, iso(now - 10 * day), now), true, "bought before, within 30 days");
  assert.equal(stillDelivered(retired, iso(now - 1 * day), now), false, "bought after it was retired");
  assert.equal(stillDelivered({ retired_at: iso(now - 31 * day) }, iso(now - 60 * day), now), false, "after 30 days");
  assert.equal(stillDelivered(retired, null, now), false);
});

test("bundle names stay inside the archive and never collide", () => {
  const f = (filename, folder_path, extra = {}) => ({ product_id: "p1", pac_id: "pac", product_title: "Pack", pac_title: "Pac", filename, folder_path, ...extra });
  const names = layout([
    f("Kick.wav", "Drums/Kicks"),
    f("kick.wav", "Drums/Kicks"),
    f("../../etc/passwd", "../.."),
    f("CON.wav", "a\\b"),
    f("x:y.wav", "C:")
  ]);
  assert.deepEqual(names.slice(0, 2), ["Drums/Kicks/Kick.wav", "Drums/Kicks/kick (2).wav"]);
  for (const n of names) {
    assert.ok(!n.startsWith("/") && !n.split("/").some((s) => s === ".." || s === "." || s === ""), n);
    assert.ok(!/[\\:]/.test(n), n);
    assert.ok(!n.split("/").some((s) => /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(s)), n);
  }
  const two = layout([f("a.wav", ""), { ...f("b.wav", ""), product_id: "p2", product_title: "Other" }]);
  assert.deepEqual(two, ["Pack/a.wav", "Other/b.wav"], "product folders when a bundle spans products");
});
