// Pack Builder, admin (docs/packs.md, Phase 3; Studio creators follow in Phase 5). A version of a Pac's contents for one
// of the product's Pacs: upload its ZIP in parts, let the engine check and store it, review what it found, publish.
// Every route is the admin's alone (404 to everyone else); creating, publishing and discarding are audited.
//   GET  /api/admin/packs/:pacId                 the Pac, its live and in-progress versions, and the products that include it
//   POST /api/admin/packs/:pacId/versions        {productId, filename, size, idempotencyKey} → version + upload plan
//   PUT  /api/admin/packs/uploads/:uploadId/parts/:n   one part's bytes (Content-Length must match the plan)
//   POST /api/admin/packs/uploads/:uploadId/complete   joins the parts and starts processing (or lists missing parts)
//   GET  /api/admin/packs/versions/:versionId    state; imports the engine's answer once it is in
//   POST /api/admin/packs/versions/:versionId/publish | /discard
import { json, fail, readJson, str, id, int } from "../lib/http.js";
import { first, all, parseJson, isGuardFailure } from "../lib/db.js";
import { requireAdmin } from "../auth/session.js";
import { getProduct, productsWithPac } from "../catalog/products.js";
import { safeFilename } from "../storage/buckets.js";
import { audit } from "../audit/log.js";
import { requireFeature } from "../lib/features.js";
import { createVersion, getVersion, move } from "./versions.js";
import { startZip, getUpload, putPart, complete, PART_BYTES } from "./uploads.js";
import { startProcess, refresh, discard } from "./process.js";
import { publishVersion } from "./publish.js";
import { routes as engineStorage } from "./engine-storage.js";

const OWNER = /^[a-z0-9_]{1,48}$/;

// Whose stored originals a version uses: the project's creator, or AutoStacc for its own catalog. An id that can't be a
// storage scope is refused rather than folded into another owner's (stored originals are never shared across owners).
async function ownerOf(db, product) {
  const p = product.project_id ? await first(db, "SELECT creator_id FROM projects WHERE id = ?", product.project_id) : null;
  if (!p || !p.creator_id) return "autostacc";
  if (!OWNER.test(p.creator_id)) fail(409, "unsupported_owner", "This product's creator can't store pack files yet.");
  return p.creator_id;
}

async function adminVersion(app, versionId) {
  requireFeature(app, "packs.builder");
  await requireAdmin(app);
  const v = await getVersion(app.db, id(versionId, "versionId"));
  if (!v) fail(404, "not_found", "No such version.");
  return v;
}

async function newVersion(app, { pacId }) {
  requireFeature(app, "packs.builder");
  const user = await requireAdmin(app);
  const pac = await first(app.db, "SELECT * FROM pacs WHERE id = ? AND deleted_at IS NULL", id(pacId, "pacId"));
  if (!pac) fail(404, "not_found", "No such Pac.");
  const body = await readJson(app.request);
  const product = await getProduct(app.db, id(body.productId, "productId"));
  if (!product || !parseJson(product.pacs, []).includes(pac.id)) fail(400, "invalid_product", "That product doesn't include this Pac.");
  const filename = safeFilename(str(body.filename, "filename", { max: 160, pattern: /\.zip$/i }));
  const size = int(body.size, "size", { min: 22 });
  const key = str(body.idempotencyKey, "idempotencyKey", { min: 16, max: 64, pattern: /^[A-Za-z0-9_-]+$/ });
  const version = await createVersion(app.db, { pacId: pac.id, productId: product.id, ownerScope: await ownerOf(app.db, product), origin: "zip",
    idempotencyKey: key, createdBy: user.id });
  let upload = await first(app.db, "SELECT id FROM uploads WHERE version_id = ? AND kind = 'zip'", version.id);
  const plan = upload ? null : await startZip(app, version, { filename, size });
  // Always (a compare-and-set): a retry after a crash between planning the upload and this move still gets here.
  await move(app.db, version.id, ["draft"], "uploading");
  if (plan) {
    await audit(app, "pack.version_created", { targetType: "pac", targetId: pac.id, detail: { versionId: version.id, productId: product.id, sizeBytes: size } });
  }
  upload = await getUpload(app.db, plan ? plan.uploadId : upload.id);
  return json({ version: await view(app, version.id), upload: uploadView(upload) }, plan ? 201 : 200);
}

const uploadView = (u) => ({ uploadId: u.id, sizeBytes: u.size_bytes, partBytes: PART_BYTES, status: u.status, partsDone: [...new Set(parseJson(u.parts, []).map((p) => p.part))].sort((a, b) => a - b) });

async function adminUpload(app, uploadId) {
  requireFeature(app, "packs.builder");
  await requireAdmin(app);
  const u = await getUpload(app.db, id(uploadId, "uploadId"));
  if (!u) fail(404, "not_found", "No such upload.");
  return u;
}

async function part(app, { uploadId, n }) {
  const u = await adminUpload(app, uploadId);
  return json(await putPart(app, u, Number(n)));
}

async function finishUpload(app, { uploadId }) {
  const u = await adminUpload(app, uploadId);
  const done = await complete(app, u);
  if (!done.complete) return json(done, 409);
  const version = await getVersion(app.db, u.version_id);
  await startProcess(app, version, await getUpload(app.db, u.id));
  return json({ complete: true, version: await view(app, version.id) });
}

/** A version as the builder shows it: state, totals, problems and (once ready) its files with suggestions. */
async function view(app, versionId) {
  const v = await getVersion(app.db, versionId);
  const out = { id: v.id, pacId: v.pac_id, productId: v.product_id, number: v.number, status: v.status, note: v.review_note || null,
    stats: parseJson(v.stats, {}), engineVersion: v.engine_version || null };
  if (["ready", "published", "superseded"].includes(v.status)) {
    const [files, values] = await Promise.all([
      all(app.db, `SELECT e.asset_id, e.filename, e.original_path, b.size_bytes, b.format, b.sha256 FROM pac_entries e JOIN blobs b ON b.id = e.blob_id
        WHERE e.version_id = ? ORDER BY e.sort LIMIT 5000`, v.id),
      all(app.db, `SELECT v.asset_id, v.field, v.value, v.origin, v.confidence FROM asset_values v JOIN pac_entries e ON e.asset_id = v.asset_id
        WHERE e.version_id = ?`, v.id)
    ]);
    const by = Object.groupBy(values, (x) => x.asset_id);
    out.files = files.map((f) => ({ assetId: f.asset_id, path: f.original_path, filename: f.filename, sizeBytes: f.size_bytes, format: f.format,
      sha256: f.sha256, suggestions: (by[f.asset_id] || []).map(({ field, value, origin, confidence }) => ({ field, value, origin, confidence })) }));
  }
  return out;
}

async function getOne(app, { versionId }) {
  const v = await adminVersion(app, versionId);
  await refresh(app, v);
  return json({ version: await view(app, v.id) });
}

async function publish(app, { versionId }) {
  const v = await adminVersion(app, versionId);
  if (v.status !== "ready") fail(409, "not_ready", v.status === "published" ? "Already published." : "Only a checked, ready version can be published.");
  if (!parseJson(v.stats, {}).files) fail(409, "nothing_to_publish", "No file in this version passed the checks.");
  let res;
  try {
    res = await publishVersion(app, v);
  } catch (e) {
    if (isGuardFailure(e)) fail(409, "not_ready", "This version changed meanwhile; reload it.");
    throw e;
  }
  await audit(app, "pack.version_published", { targetType: "pac", targetId: v.pac_id, detail: { versionId: v.id, productId: v.product_id, files: res.files } });
  return json({ version: await view(app, v.id) });
}

async function drop(app, { versionId }) {
  const v = await adminVersion(app, versionId);
  if (!(await discard(app, v))) fail(409, "cannot_discard", "Only an unpublished version that isn't being processed can be discarded.");
  await audit(app, "pack.version_discarded", { targetType: "pac", targetId: v.pac_id, detail: { versionId: v.id } });
  return json({ version: await view(app, v.id) });
}

async function pacOverview(app, { pacId }) {
  requireFeature(app, "packs.builder");
  await requireAdmin(app);
  const pac = await first(app.db, "SELECT * FROM pacs WHERE id = ? AND deleted_at IS NULL", id(pacId, "pacId"));
  if (!pac) fail(404, "not_found", "No such Pac.");
  const [versions, products] = await Promise.all([
    all(app.db, "SELECT id, number, status, stats, published_at, created_at FROM pac_versions WHERE pac_id = ? ORDER BY number DESC LIMIT 20", pac.id),
    productsWithPac(app.db, pac.id)
  ]);
  return json({
    pac: { id: pac.id, title: pac.title, stacclet: pac.stacclet_id, liveVersionId: pac.live_version_id, draftVersionId: pac.draft_version_id },
    versions: versions.map((v) => ({ id: v.id, number: v.number, status: v.status, stats: parseJson(v.stats, {}), publishedAt: v.published_at, createdAt: v.created_at })),
    products
  });
}

export const routes = [
  ["GET", "/api/admin/packs/:pacId", pacOverview],
  ["POST", "/api/admin/packs/:pacId/versions", newVersion],
  ["PUT", "/api/admin/packs/uploads/:uploadId/parts/:n", part],
  ["POST", "/api/admin/packs/uploads/:uploadId/complete", finishUpload],
  ["GET", "/api/admin/packs/versions/:versionId", getOne],
  ["POST", "/api/admin/packs/versions/:versionId/publish", publish],
  ["POST", "/api/admin/packs/versions/:versionId/discard", drop],
  ...engineStorage
];
