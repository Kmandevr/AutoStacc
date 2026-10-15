// Browser group for the Pack Builder (Control Center → Packs), against its own store and the mock engine: choose a Pac,
// pick a ZIP (previewed in the browser by the engine's WebAssembly build), upload, wait for the check, then review: set
// a value on selected files and see where each value comes from. And a Studio creator doing the same for their own
// product in the Product Studio's Pac Builder section, whose clean pack publishes at once and whose next version
// uploads only the files the store doesn't have (a thin ZIP, js/packs-thin.js). And a creator's single file checked into
// their Pac, then the Pac editor. No console errors throughout.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { after } from "node:test";
import { browserStore, DESK, ADMIN_EMAIL } from "../support/browser.js";
import fs from "node:fs";
import { ROOT, unique, sql } from "../support/client.js";
import { startMockEngine, entries } from "../mock-engine/server.js";

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

test("a Studio creator uploads their product's pack, a clean pack publishes at once, and its next version uploads only what changed", { timeout: 120000 }, async () => {
  const { page } = await store.open(DESK);
  await store.signUp(page, unique("packer"));
  await page.goto("/studio");
  const post = (url, body) => page.evaluate(async ([u, b]) => (await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).json(), [url, body]);
  const { creator } = await post("/api/studio/creators", { name: "Packer", slug: `packer-${Date.now().toString(36)}` });
  const { project } = await post(`/api/studio/creators/${creator.id}/projects`, { name: "Kits", slug: "kits" });
  const { product } = await post(`/api/studio/projects/${project.id}/products`, { title: "Drum Kit", type: "sample-pack", priceCents: 900, description: "Drums.", includes: ["kicks"] });
  await page.goto("/studio");
  await page.click("[data-products]");
  await page.click(`.sp-card[data-id="${product.id}"] a`);
  await page.waitForSelector('[data-ws-item="overview"][aria-current="page"]');
  await page.click('[data-ws-item="pacs"]');
  await page.waitForSelector("[data-pack-form]");
  assert.equal(await page.locator("[data-pack-back]").isVisible(), false, "inside the Product Studio the sidebar replaces the Pack Builder's own back bar");
  assert.match(await page.locator(".studio-packs").innerText(), /0\.0 MB of 500 MB/);
  await page.setInputFiles("#spk-file", path.join(ROOT, "engine/conformance/cases/pack-basic.zip"));
  await page.click("[data-pack-form] button[type=submit]");
  await page.waitForSelector("[data-pack-publish]", { timeout: 60000 });
  assert.match(await page.locator("[data-pack-version]").innerText(), /nothing flagged/);
  page.once("dialog", (d) => d.accept());
  await page.click("[data-pack-publish]");
  await page.waitForSelector("[data-pack-version] >> text=Published");
  // The section's file list counts the published pack, and Release no longer blocks for want of a file.
  await page.waitForSelector(".spc-list >> text=from your Pac", { timeout: 15000 });
  await page.click('[data-ws-item="release"]');
  await page.waitForSelector(".sk-ok");

  // Version 2: the browser checks the ZIP, the store already has five of its files, and only the rest uploads.
  await page.click('[data-ws-item="pacs"]');
  await page.waitForSelector("[data-pack-form]");
  await page.setInputFiles("#spk-file", path.join(ROOT, "engine/conformance/cases/pack-revision.zip"));
  await page.click("[data-pack-form] button[type=submit]");
  await page.waitForSelector("[data-pack-publish]", { timeout: 60000 });
  assert.match(await page.locator("[data-pack-version]").innerText(), /4 unchanged, 1 moved or renamed, 1 replaced, 1 new, 1 removed/);
  const up = sql(store.stateDir, `SELECT u.size_bytes, u.carry FROM uploads u JOIN pac_versions v ON v.id = u.version_id WHERE v.product_id = '${product.id}' AND v.number = 2`)[0];
  assert.equal(JSON.parse(up.carry).length, 5, "five files weren't uploaded again");
  assert.ok(up.size_bytes < fs.statSync(path.join(ROOT, "engine/conformance/cases/pack-revision.zip")).size / 10);

  // On sale, its page says what's inside: version 1's files (version 2 isn't published), by folder.
  const sale = await page.evaluate(async (id) => (await fetch(`/api/studio/products/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ published: true }) })).status, product.id);
  assert.equal(sale, 200);
  await page.goto(`/product?p=${product.id}`);
  await page.waitForSelector("[data-product-contents] >> text=What's inside");
  const inside = await page.locator("[data-product-contents]").innerText();
  assert.match(inside, /7 files/);
  assert.match(inside, /Drums › Kicks/);
  assert.match(inside, /sample rate/i);
  assert.ok(!/Changelog/.test(inside), "an unpublished version shows nothing");
  assert.deepEqual(page.errors, []);
});

test("a creator's single file is checked into their Pac and goes live; the Pac editor makes folders, writes a read me and removes files", { timeout: 120000 }, async () => {
  const { page } = await store.open(DESK);
  await store.signUp(page, unique("editor"));
  await page.goto("/studio");
  const post = (url, body) => page.evaluate(async ([u, b]) => (await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).json(), [url, body]);
  const { creator } = await post("/api/studio/creators", { name: "Editor", slug: `editor-${Date.now().toString(36)}` });
  const { project } = await post(`/api/studio/creators/${creator.id}/projects`, { name: "Kits", slug: "kits" });
  const { product } = await post(`/api/studio/projects/${project.id}/products`, { title: "One Kick", type: "sample-pack", priceCents: 300, description: "A kick.", includes: ["kicks"] });
  // The file as the creator has it: the one inside the Pac editor's conformance case (js/zip-make.js makes the same archive).
  const kick = path.join(store.stateDir, "Kick 07.wav");
  fs.writeFileSync(kick, entries(fs.readFileSync(path.join(ROOT, "engine/conformance/cases/editor-file.zip"))).get("Kick 07.wav")());
  await page.goto("/studio");
  await page.click("[data-products]");
  await page.click(`.sp-card[data-id="${product.id}"] a`);
  await page.click('[data-ws-item="pacs"]');
  await page.waitForSelector("[data-spc-upload]", { state: "attached" });
  await page.setInputFiles("[data-spc-upload]", kick);
  await page.waitForSelector(".spc-files >> text=is checked and live", { timeout: 60000 });
  assert.equal(sql(store.stateDir, `SELECT COUNT(*) AS n FROM product_files WHERE product_id = '${product.id}' AND active = 1 AND status = 'published' AND blob_id IS NOT NULL`)[0].n, 1);

  // The Pac editor: a draft copied from the live version, then a folder, a read me, and a removal.
  await page.waitForSelector("[data-pe-draft]");
  await page.click("[data-pe-draft]");
  await page.waitForSelector(".pe-tree >> text=Kick 07.wav");
  page.once("dialog", (d) => d.accept("Extras"));
  await page.click("[data-pe-newfolder]");
  await page.waitForSelector(".pe-tree >> text=Extras");
  await page.click("[data-pe-readme]");
  await page.fill("#pe-readme-text", "One kick, tuned to C.");
  await page.click("[data-pe-readme-form] button[type=submit]");
  await page.waitForSelector(".pe-tree >> text=Read me.txt");
  page.once("dialog", (d) => d.accept());
  await page.click(".pe-file:has-text('Kick 07.wav') [data-pe-rmfile]");
  await page.waitForFunction(() => !document.querySelector(".pe-tree").innerText.includes("Kick 07.wav"));
  // The previews panel is there for the Pac.
  await page.waitForSelector("[data-pac-previews] >> text=Previews");
  assert.deepEqual(page.errors, []);
});
