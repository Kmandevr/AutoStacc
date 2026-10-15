// The Pac editor's routes (docs/packs.md, "Pac editor"; owner, 2026-10-15), under each scope's prefix (access.js: the
// admin's on any Pac, a creator's on their own products' only; anyone else gets 404). Switch packs.editor.
//   POST   /api/admin/packs/:pacId/drafts {productId, idempotencyKey}      a draft copied from the live version
//   POST   /api/studio/packs/products/:productId/drafts {idempotencyKey}   (or empty when there is none, or empty: true)
//   POST   …/versions/:versionId/additions {filename, size, folderId, idempotencyKey}  files to add, sent as a ZIP
//   POST   …/additions/:additionId/complete   once its parts are up (PUT …/uploads/:uploadId/parts/:n, routes.js)
//   GET    …/additions/:additionId            its state (merged into the version when checked)
//   DELETE …/additions/:additionId            given up while still uploading (its upload stopped), so the next can start
//   POST   …/versions/:versionId/folders {parentId, name}   a new folder
//   DELETE …/versions/:versionId/folders/:folderId            a folder and everything in it
//   POST   …/versions/:versionId/remove {assetIds}            files out of the version
//   PUT    …/versions/:versionId/readme {text, filename, folderId}   a read me written here, as a text file
// Each change answers the version (and the addition); audited, never with file contents.
import { json, fail, readJson, str, int } from "../lib/http.js";
import { first } from "../lib/db.js";
import { audit } from "../audit/log.js";
import { limit } from "../lib/ratelimit.js";
import { requireFeature } from "../lib/features.js";
import { filesQuotaOf } from "../creators/policy.js";
import { capBytes } from "../usage/usage.js";
import { safeFilename } from "../storage/buckets.js";
import { ADMIN, STUDIO, ownerOf, ensureStudioPac } from "./access.js";
import { startDraft } from "./copy.js";
import { startAddition, sendAddition, refreshAddition, getAddition, additionView, failAddition } from "./additions.js";
import { getUpload, complete, PART_BYTES } from "./uploads.js";
import { newFolder, removeFiles, removeFolder, writeReadme } from "./tree-edits.js";
import { versionView } from "./view.js";

const KEY = { min: 16, max: 64, pattern: /^[A-Za-z0-9_-]+$/ };
const folderParam = (v) => (v === null || v === undefined ? null : str(v, "folderId", { max: 40, pattern: /^fo_[a-z2-7]+$/ }));
const plan = (u) => ({ uploadId: u.id, sizeBytes: u.size_bytes, partBytes: PART_BYTES, parts: Math.max(1, Math.ceil(u.size_bytes / PART_BYTES)) });

async function draftFor(app, actor, { pac, product, body }) {
  const v = await startDraft(app, { pac, product, ownerScope: await ownerOf(app.db, product), idempotencyKey: str(body.idempotencyKey, "idempotencyKey", KEY), createdBy: actor.user.id, empty: body.empty === true });
  await audit(app, "pack.draft_started", { targetType: "pac", targetId: pac.id, detail: { versionId: v.id, from: v.base_version_id || null, empty: body.empty === true } });
  return json({ version: await versionView(app.db, v.id) }, 201);
}

function shared(scope) {
  const P = scope.prefix;
  const actorOf = async (app) => (requireFeature(app, "packs.editor"), scope.actor(app));
  // A version change: checked through the scope, audited, answered with the version.
  const change = (action, run) => async (app, params) => {
    const actor = await actorOf(app);
    if (!actor.admin) await limit(app, "studio-pack-edit", 600, 3600);
    const v = await scope.version(app, actor, params.versionId);
    const body = app.request.method === "DELETE" ? {} : await readJson(app.request, 96 * 1024);
    const detail = await run(app, v, body, params, actor);
    await audit(app, `pack.${action}`, { targetType: "pac", targetId: v.pac_id, detail: { versionId: v.id, ...detail } });
    return json({ version: await versionView(app.db, v.id) });
  };
  const addition = async (app, actor, additionId) => {
    const a = await getAddition(app.db, str(additionId, "additionId", { max: 40, pattern: /^pa_[a-z2-7]+$/ }));
    if (!a) fail(404, "not_found", "Not found.");
    await scope.version(app, actor, a.version_id); // 404 unless the version is reachable
    return a;
  };
  return [
    ["POST", `${P}/versions/:versionId/additions`, async (app, { versionId }) => {
      const actor = await actorOf(app);
      // Each addition costs an engine run: rate-limited like a creator's whole uploads.
      if (!actor.admin) await limit(app, "studio-pack-add", 60, 3600);
      const v = await scope.version(app, actor, versionId);
      const body = await readJson(app.request, 4096);
      const creator = actor.admin ? null : actor.creator;
      const quota = creator ? { creatorId: creator.id, bytes: filesQuotaOf(creator), capBytes: await capBytes(app.db) } : null;
      const { addition: a, upload } = await startAddition(app, v, { folderId: folderParam(body.folderId), filename: safeFilename(str(body.filename, "filename", { max: 160, pattern: /\.zip$/i })),
        size: int(body.size, "size", { min: 22 }), idempotencyKey: str(body.idempotencyKey, "idempotencyKey", KEY), createdBy: actor.user.id, quota });
      if (!upload || a.status === "failed") fail(409, "addition_failed", "Those files couldn't be added. Try again.");
      return json({ addition: additionView(a), upload: plan(upload) }, 201);
    }],
    ["POST", `${P}/additions/:additionId/complete`, async (app, { additionId }) => {
      const actor = await actorOf(app);
      const a = await addition(app, actor, additionId);
      const row = await first(app.db, "SELECT id FROM uploads WHERE addition_id = ?", a.id);
      if (!row) fail(404, "not_found", "Not found.");
      if (a.status !== "uploading") return json({ addition: additionView(a), version: await versionView(app.db, a.version_id) });
      const u = await getUpload(app.db, row.id);
      const done = await complete(app, u);
      if (!done.complete) return json(done, 409);
      const next = await sendAddition(app, a, await getUpload(app.db, u.id));
      return json({ addition: additionView(next), version: await versionView(app.db, a.version_id) });
    }],
    ["GET", `${P}/additions/:additionId`, async (app, { additionId }) => {
      const actor = await actorOf(app);
      const a = await refreshAddition(app, await addition(app, actor, additionId));
      return json({ addition: additionView(a), version: await versionView(app.db, a.version_id) });
    }],
    ["DELETE", `${P}/additions/:additionId`, async (app, { additionId }) => {
      const actor = await actorOf(app);
      let a = await addition(app, actor, additionId);
      if (a.status === "uploading") {
        await failAddition(app, a, "cancelled");
        await audit(app, "pack.addition_cancelled", { targetType: "pac", targetId: (await first(app.db, "SELECT pac_id FROM pac_versions WHERE id = ?", a.version_id)).pac_id, detail: { additionId: a.id } });
        a = await getAddition(app.db, a.id);
      }
      return json({ addition: additionView(a), version: await versionView(app.db, a.version_id) });
    }],
    ["POST", `${P}/versions/:versionId/folders`, change("folder_created", async (app, v, b) => {
      const id = await newFolder(app, v, { parentId: folderParam(b.parentId), name: b.name });
      return { folderId: id };
    })],
    ["DELETE", `${P}/versions/:versionId/folders/:folderId`, change("folder_removed", async (app, v, _b, p) => {
      return { folderId: p.folderId, files: await removeFolder(app, v, { folderId: p.folderId }) };
    })],
    ["POST", `${P}/versions/:versionId/remove`, change("files_removed", async (app, v, b) => {
      await removeFiles(app, v, { assetIds: b.assetIds });
      return { files: Array.isArray(b.assetIds) ? b.assetIds.length : 0 };
    })],
    ["PUT", `${P}/versions/:versionId/readme`, change("readme_written", async (app, v, b) => {
      const asset = await writeReadme(app, v, { text: b.text, filename: b.filename === undefined ? undefined : b.filename, folderId: folderParam(b.folderId) });
      return { assetId: asset };
    })]
  ];
}

export const routes = [
  ["POST", "/api/admin/packs/:pacId/drafts", async (app, { pacId }) => {
    requireFeature(app, "packs.editor");
    const actor = await ADMIN.actor(app);
    const pac = await first(app.db, "SELECT * FROM pacs WHERE id = ? AND deleted_at IS NULL", str(pacId, "pacId", { max: 80 }));
    if (!pac) fail(404, "not_found", "No such Pac.");
    const body = await readJson(app.request, 4096);
    const { product } = await ADMIN.product(app, actor, body.productId, pac.id);
    return draftFor(app, actor, { pac, product, body });
  }],
  ["POST", "/api/studio/packs/products/:productId/drafts", async (app, { productId }) => {
    requireFeature(app, "packs.editor");
    const actor = await STUDIO.actor(app);
    await limit(app, "studio-pack", 20, 3600);
    const { product } = await STUDIO.product(app, actor, productId);
    const body = await readJson(app.request, 4096);
    return draftFor(app, actor, { pac: await ensureStudioPac(app.db, product), product, body });
  }],
  ...shared(ADMIN),
  ...shared(STUDIO)
];
