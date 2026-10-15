// Pack Builder routes (docs/packs.md). The same handlers serve two scopes (access.js): the admin's, on any Pac, and the
// Studio's, on a creator's own products (404 for anything else). A version of a Pac: upload its ZIP in parts, let the
// engine check and store it, review it (edit-routes.js), publish. Creating, publishing, discarding and review decisions
// are audited.
//   admin:  GET  /api/admin/packs/:pacId                      the Pac, its versions, the products that include it
//           POST /api/admin/packs/:pacId/versions             {productId, filename, size, idempotencyKey}
//           the review queue and rejecting: review-routes.js
//   studio: GET  /api/studio/packs/products/:productId        the product's own Pac (made on first use), versions, storage
//           POST /api/studio/packs/products/:productId/versions {filename, size, idempotencyKey}
//   both, under each prefix:
//           PUT  /uploads/:uploadId/parts/:n, POST /uploads/:uploadId/complete
//           GET  /versions/:versionId, POST /versions/:versionId/publish, POST /versions/:versionId/discard
//           GET  /versions/:versionId/download, GET /versions/:versionId/files/:assetId (originals.js)
// Publishing in the Studio follows the automated review: a clean version (or only soft flags for a trusted creator) goes
// live, anything else waits for an admin, who is alerted. An admin may publish any ready or held version.
import { json, fail, readJson, str, id, int } from "../lib/http.js";
import { first, all, parseJson, isGuardFailure } from "../lib/db.js";
import { productsWithPac } from "../catalog/products.js";
import { safeFilename } from "../storage/buckets.js";
import { audit } from "../audit/log.js";
import { alertAdmins } from "../email/alerts.js";
import { filesQuotaOf } from "../creators/policy.js";
import { storageUsed } from "../creators/storage.js";
import { capBytes } from "../usage/usage.js";
import { createVersion, move, getVersion } from "./versions.js";
import { limit } from "../lib/ratelimit.js";
import { startZip, getUpload, putPart, complete, PART_BYTES } from "./uploads.js";
import { startProcess, refresh, discard } from "./process.js";
import { originalRoutes } from "./originals.js";
import { publishVersion } from "./publish.js";
import { clearToPublish } from "./review.js";
import { recordEvent } from "../creators/events.js";
import { ADMIN, STUDIO, ownerOf, uploadFor, studioPacOf, ensureStudioPac } from "./access.js";
import { routes as engineStorage } from "./engine-storage.js";
import { editRoutes } from "./edit-routes.js";
import { cleanCarry } from "./carry.js";
import { routes as carryRoutes } from "./carry-routes.js";
import { routes as reviewRoutes } from "./review-routes.js";
import { versionView } from "./view.js";
import { openAddition } from "./additions.js";
import { refreshedStats, saveStatsStmt } from "./final-review.js";

// Room for a carry list of the most files a version may have.
const CREATE_BYTES = 3 * 1024 * 1024;
const view = (app, versionId) => versionView(app.db, versionId);
const uploadView = (u) => ({ uploadId: u.id, sizeBytes: u.size_bytes, partBytes: PART_BYTES, status: u.status,
  partsDone: [...new Set(parseJson(u.parts, []).map((p) => p.part))].sort((a, b) => a - b) });

async function pacSummary(app, pac) {
  const versions = await all(app.db, "SELECT id, number, status, stats, review_note, published_at, created_at FROM pac_versions WHERE pac_id = ? ORDER BY number DESC LIMIT 20", pac.id);
  return {
    pac: { id: pac.id, title: pac.title, stacclet: pac.stacclet_id, liveVersionId: pac.live_version_id, draftVersionId: pac.draft_version_id },
    versions: versions.map((v) => ({ id: v.id, number: v.number, status: v.status, stats: parseJson(v.stats, {}), note: v.review_note || null,
      publishedAt: v.published_at, createdAt: v.created_at }))
  };
}

// A new version and its upload plan (or the same ones again for the same idempotency key).
async function createFor(app, actor, { pac, product, creator, body }) {
  const filename = safeFilename(str(body.filename, "filename", { max: 160, pattern: /\.zip$/i }));
  // A thin ZIP of a revision lists the files it leaves out (carry.js); checked when the version is imported.
  const carry = cleanCarry(body.carry);
  const size = int(body.size, "size", { min: 22 });
  const key = str(body.idempotencyKey, "idempotencyKey", { min: 16, max: 64, pattern: /^[A-Za-z0-9_-]+$/ });
  const version = await createVersion(app.db, { pacId: pac.id, productId: product.id, ownerScope: await ownerOf(app.db, product), origin: "zip",
    idempotencyKey: key, createdBy: actor.user.id });
  // The same key after the version ended (refused for room, discarded, failed): a new upload needs a new key.
  if (!["draft", "uploading"].includes(version.status)) fail(409, "version_closed", "That upload was stopped. Choose the file again to start over.");
  let upload = await first(app.db, "SELECT id FROM uploads WHERE version_id = ? AND kind = 'zip'", version.id);
  const quota = creator ? { creatorId: creator.id, bytes: filesQuotaOf(creator), capBytes: await capBytes(app.db) } : null;
  let plan = null;
  if (!upload) {
    try {
      plan = await startZip(app, version, { filename, size, quota, carry });
    } catch (e) {
      // No room: the version that was just made goes away again, so the Pac stays free.
      await discard(app, version);
      throw e;
    }
  }
  // Always (a compare-and-set): a retry after a crash between planning the upload and this move still gets here.
  await move(app.db, version.id, ["draft"], "uploading");
  if (plan) await audit(app, "pack.version_created", { targetType: "pac", targetId: pac.id, detail: { versionId: version.id, productId: product.id, sizeBytes: size } });
  upload = await getUpload(app.db, plan ? plan.uploadId : upload.id);
  return json({ version: await view(app, version.id), upload: uploadView(upload) }, plan ? 201 : 200);
}

function shared(scope) {
  const P = scope.prefix;
  return [
    ["PUT", `${P}/uploads/:uploadId/parts/:n`, async (app, { uploadId, n }) => {
      const actor = await scope.actor(app);
      return json(await putPart(app, await uploadFor(app, scope, actor, uploadId), Number(n)));
    }],
    ["POST", `${P}/uploads/:uploadId/complete`, async (app, { uploadId }) => {
      const actor = await scope.actor(app);
      const u = await uploadFor(app, scope, actor, uploadId);
      // An addition's upload completes through its own route (editor-routes.js).
      if (u.addition_id) fail(404, "not_found", "Not found.");
      const done = await complete(app, u);
      if (!done.complete) return json(done, 409);
      const version = await scope.version(app, actor, u.version_id);
      await startProcess(app, version, await getUpload(app.db, u.id));
      return json({ complete: true, version: await view(app, version.id) });
    }],
    ["GET", `${P}/versions/:versionId`, async (app, { versionId }) => {
      const actor = await scope.actor(app);
      const v = await scope.version(app, actor, versionId);
      await refresh(app, v);
      return json({ version: await view(app, v.id) });
    }],
    ["POST", `${P}/versions/:versionId/publish`, async (app, { versionId }) => {
      const actor = await scope.actor(app);
      let v = await scope.version(app, actor, versionId);
      const allowed = actor.admin ? ["ready", "in_review"] : ["ready"];
      if (!allowed.includes(v.status)) fail(409, "not_ready", v.status === "published" ? "Already published." : v.status === "in_review" ? "It's waiting for AutoStacc's review." : "Only a checked, ready version can be published.");
      if (await openAddition(app.db, v.id)) fail(409, "addition_open", "Files are still being added. Wait for them first.");
      // Built in steps or edited since it was checked: its diff and revision risk are taken again first (final-review.js).
      await app.db.batch([saveStatsStmt(app.db, v.id, await refreshedStats(app.db, v))]);
      v = await getVersion(app.db, v.id);
      const stats = parseJson(v.stats, {});
      if (!stats.files) fail(409, "nothing_to_publish", "No file in this version passed the checks.");
      const rv = stats.review || null;
      if (!actor.admin && !clearToPublish(rv, { trusted: Boolean(actor.creator.trusted), alwaysHold: actor.creator.pack_review === "always_hold" })) {
        if (await move(app.db, v.id, ["ready"], "in_review")) {
          if (v.product_id) await recordEvent(app.db, { productId: v.product_id, kind: "pac_version_submitted", actorId: actor.user.id, detail: { versionId: v.id, number: v.number } });
          await audit(app, "pack.version_held", { targetType: "pac", targetId: v.pac_id, detail: { versionId: v.id, flags: (rv ? rv.flags : []).map((f) => f.code) } });
          await alertAdmins(app, { key: `pack:${v.id}`, title: "a creator's Pac version is waiting for review",
            lines: [`${actor.creator.name} (/${actor.creator.slug}) wants to publish version ${v.number} (${stats.files} files).`,
              `Flags: ${(rv && rv.flags.length ? rv.flags.map((f) => f.code).join(", ") : "none (this creator's versions always wait)")}.`, "Approve or reject it in the Control Center, Packs."] });
        }
        return json({ version: await view(app, v.id) }, 202);
      }
      let res;
      try {
        res = await publishVersion(app, v, { reviewedBy: actor.admin ? actor.user.id : null });
      } catch (e) {
        if (isGuardFailure(e)) fail(409, "not_ready", "This version changed meanwhile; reload it.");
        throw e;
      }
      const override = actor.admin && rv && rv.verdict === "hold";
      if (v.product_id) await recordEvent(app.db, { productId: v.product_id, kind: v.status === "in_review" ? "pac_version_approved" : "pac_version_published",
        actorId: actor.user.id, detail: { versionId: v.id, number: v.number, files: res.files } });
      await audit(app, override ? "pack.version_approved" : "pack.version_published", { targetType: "pac", targetId: v.pac_id,
        detail: { versionId: v.id, productId: v.product_id, files: res.files, ...(override ? { flags: rv.flags.map((f) => f.code) } : {}) } });
      return json({ version: await view(app, v.id) });
    }],
    ["POST", `${P}/versions/:versionId/discard`, async (app, { versionId }) => {
      const actor = await scope.actor(app);
      const v = await scope.version(app, actor, versionId);
      if (!(await discard(app, v))) fail(409, "cannot_discard", "Only an unpublished version that isn't being checked can be discarded.");
      await audit(app, "pack.version_discarded", { targetType: "pac", targetId: v.pac_id, detail: { versionId: v.id } });
      return json({ version: await view(app, v.id) });
    }],
    ...editRoutes(scope),
    ...originalRoutes(scope)
  ];
}

const adminRoutes = [
  ["GET", "/api/admin/packs/:pacId", async (app, { pacId }) => {
    await ADMIN.actor(app);
    const pac = await first(app.db, "SELECT * FROM pacs WHERE id = ? AND deleted_at IS NULL", id(pacId, "pacId"));
    if (!pac) fail(404, "not_found", "No such Pac.");
    return json({ ...(await pacSummary(app, pac)), products: await productsWithPac(app.db, pac.id) });
  }],
  ["POST", "/api/admin/packs/:pacId/versions", async (app, { pacId }) => {
    const actor = await ADMIN.actor(app);
    const pac = await first(app.db, "SELECT * FROM pacs WHERE id = ? AND deleted_at IS NULL", id(pacId, "pacId"));
    if (!pac) fail(404, "not_found", "No such Pac.");
    const body = await readJson(app.request, CREATE_BYTES);
    const { product } = await ADMIN.product(app, actor, body.productId, pac.id);
    return createFor(app, actor, { pac, product, creator: null, body });
  }]
];

const studioRoutes = [
  ["GET", "/api/studio/packs/products/:productId", async (app, { productId }) => {
    const actor = await STUDIO.actor(app);
    const { product, creator } = await STUDIO.product(app, actor, productId);
    // Looking never changes anything: the Pac is made by the first upload.
    const pac = await studioPacOf(app.db, product);
    return json({ ...(pac ? await pacSummary(app, pac) : { pac: null, versions: [] }), product: { id: product.id, title: product.title },
      storage: { usedBytes: await storageUsed(app.db, creator.id), quotaBytes: filesQuotaOf(creator) } });
  }],
  ["POST", "/api/studio/packs/products/:productId/versions", async (app, { productId }) => {
    const actor = await STUDIO.actor(app);
    // Each version costs an engine run: a creator's uploads are rate-limited like single files.
    await limit(app, "studio-pack", 20, 3600);
    const { product, creator } = await STUDIO.product(app, actor, productId);
    const body = await readJson(app.request, CREATE_BYTES);
    const pac = await ensureStudioPac(app.db, product);
    return createFor(app, actor, { pac, product, creator, body });
  }]
];

export const routes = [...reviewRoutes, ...carryRoutes, ...adminRoutes, ...shared(ADMIN), ...studioRoutes, ...shared(STUDIO), ...engineStorage];
