// Browser group for the Pack Builder (Control Center → Packs), against its own store and the mock engine: choose a Pac,
// pick a ZIP (previewed in the browser by the engine's WebAssembly build), upload, wait for the check, then review: set
// a value on selected files and see where each value comes from. And a Studio creator doing the same for their own
// product, whose clean pack publishes at once. No console errors throughout.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { after } from "node:test";
import { browserStore, DESK, ADMIN_EMAIL } from "../support/browser.js";
import { ROOT, unique } from "../support/client.js";
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

test("a Studio creator uploads their product's pack, and a clean pack publishes at once", { timeout: 120000 }, async () => {
  const { page } = await store.open(DESK);
  await store.signUp(page, unique("packer"));
  await page.goto("/studio");
  const post = (url, body) => page.evaluate(async ([u, b]) => (await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).json(), [url, body]);
  const { creator } = await post("/api/studio/creators", { name: "Packer", slug: `packer-${Date.now().toString(36)}` });
  const { project } = await post(`/api/studio/creators/${creator.id}/projects`, { name: "Kits", slug: "kits" });
  await post(`/api/studio/projects/${project.id}/products`, { title: "Drum Kit", type: "sample-pack", priceCents: 900, description: "Drums.", includes: ["kicks"] });
  await page.goto("/studio");
  await page.click("[data-products]");
  await page.click(".studio-product [data-act=packs]");
  await page.waitForSelector("[data-pack-form]");
  assert.match(await page.locator(".studio-packs").innerText(), /0\.0 MB of 500 MB/);
  await page.setInputFiles("#spk-file", path.join(ROOT, "engine/conformance/cases/pack-basic.zip"));
  await page.click("[data-pack-form] button[type=submit]");
  await page.waitForSelector("[data-pack-publish]", { timeout: 60000 });
  assert.match(await page.locator("[data-pack-version]").innerText(), /nothing flagged/);
  page.once("dialog", (d) => d.accept());
  await page.click("[data-pack-publish]");
  await page.waitForSelector("[data-pack-version] >> text=Published");
  await page.click("[data-act=back]");
  await page.waitForSelector(".studio-product >> text=from your pack");
  assert.deepEqual(page.errors, []);
});
