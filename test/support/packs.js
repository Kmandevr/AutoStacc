// Shared helpers for the Pack Builder API suites (test/api/packs-*.suite.js): a Studio creator with products, and a
// version built through the Studio routes (create, upload the archive as one part, complete, wait for the check).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT } from "./client.js";
import { newBuyer } from "./flows.js";

export const S = "/api/studio/packs";
export const caseZip = (name) => fs.readFileSync(path.join(ROOT, "engine/conformance/cases", `${name}.zip`));
export const expected = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "engine/conformance/expected", `${name}.inspect.json`), "utf8"));
const slug = (tag) => `${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function creatorWithProducts(base, tag, n = 1) {
  const { c, user } = await newBuyer(base, tag);
  const cr = await c.post("/api/studio/creators", { name: `Packer ${tag}`, slug: slug(tag) });
  assert.equal(cr.status, 201, JSON.stringify(cr.data));
  const pr = await c.post(`/api/studio/creators/${cr.data.creator.id}/projects`, { name: "Kits", slug: "kits" });
  const products = [];
  for (let i = 0; i < n; i++) {
    const made = await c.post(`/api/studio/projects/${pr.data.project.id}/products`, { title: `Kit ${i + 1}`, type: "sample-pack", priceCents: 1500, description: "Drums.", includes: ["kicks"] });
    assert.equal(made.status, 201, JSON.stringify(made.data));
    products.push(made.data.product);
  }
  return { c, user, creator: cr.data.creator, products };
}

export const create = (c, productId, zip, extra = {}) =>
  c.post(`${S}/products/${productId}/versions`, { filename: "kit.zip", size: zip.length, idempotencyKey: crypto.randomUUID(), ...extra });

/** extra: more of the create request (a carry list). */
export async function build(c, productId, zip, extra = {}) {
  const created = await create(c, productId, zip, extra);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const { version, upload } = created.data;
  const put = await c.req("PUT", `${S}/uploads/${upload.uploadId}/parts/1`, { raw: zip, headers: { "Content-Type": "application/octet-stream" } });
  assert.equal(put.status, 200, JSON.stringify(put.data));
  const done = await c.post(`${S}/uploads/${upload.uploadId}/complete`, {});
  assert.equal(done.status, 200, JSON.stringify(done.data));
  let v = done.data.version;
  for (let i = 0; i < 60 && v.status === "processing"; i++) {
    await wait(250);
    v = (await c.get(`${S}/versions/${version.id}`)).data.version;
  }
  return { version: v, upload };
}
