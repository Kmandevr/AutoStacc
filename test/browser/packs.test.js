// Browser group for the Pack Builder (Control Center → Packs), against its own store and the mock engine: choose a Pac,
// pick a ZIP (previewed in the browser by the engine's WebAssembly build), upload, wait for the check, then review: set
// a value on selected files and see where each value comes from. No console errors throughout.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { after } from "node:test";
import { browserStore, DESK, ADMIN_EMAIL } from "../support/browser.js";
import { ROOT } from "../support/client.js";
import { startMockEngine } from "../mock-engine/server.js";

const PORT = 8809;
const engine = await startMockEngine(8819, { storage: `http://localhost:${PORT}/api/internal/engine-storage` });
after(() => engine.close());
const store = browserStore({ name: "packs", port: PORT, vars: { ENGINE_URL: engine.url } });

test("an admin uploads a Pac's ZIP, sees the preview and the engine's findings, and reviews values", { timeout: 120000 }, async () => {
  const { page } = await store.open(DESK);
  await store.signUp(page, ADMIN_EMAIL);
  await page.goto("/admin#packs");
  await page.selectOption("[data-pack-pac]", "frayed-signals-loops");
  await page.waitForSelector("[data-pack-form]");
  await page.setInputFiles("#pack-file", path.join(ROOT, "engine/conformance/cases/pack-names.zip"));
  // The preview, in the browser, before anything uploads.
  await page.waitForSelector("[data-pack-preview] >> text=10 files");
  await page.click("[data-pack-form] button[type=submit]");
  // Uploaded, checked by the (mock) engine, and shown for review.
  await page.waitForSelector("[data-review-tools]", { timeout: 60000 });
  const rows = page.locator("[data-pack-version] tbody tr");
  assert.equal(await rows.count(), 10);
  // Set a value on one selected file: it becomes "yours".
  const row = rows.filter({ hasText: "808 Sub C.wav" });
  await row.locator("[data-pick]").check();
  await page.selectOption("#rv-field", "kind");
  await page.fill("#rv-value", "loops");
  await page.click("[data-review-set]");
  await page.waitForSelector("[data-pack-version] tbody tr:has-text('808 Sub C.wav') >> text=yours");
  // A move preview says what inherited values would change before anything moves.
  await page.locator("[data-pack-version] tbody tr:has-text('808 Sub C.wav') [data-pick]").check();
  await page.selectOption("#rv-move", { index: 1 });
  assert.match(await page.locator("[data-move-preview]").innerText(), /change|Nothing inherited changes/);
  assert.deepEqual(page.errors, []);
});
