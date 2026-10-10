// Pack Builder review routes (admin; docs/packs.md Phase 4), on a version that is checked and not yet published:
//   PUT   …/versions/:versionId/values                {assetIds, field, value}  the creator's value ("" = none, null = inherit)
//   POST  …/versions/:versionId/suggestions           {assetIds, field, value, accept}
//   PUT   …/versions/:versionId/folders/:folderId/values {field, value}       a folder default (null removes it)
//   POST  …/versions/:versionId/move                  {assetIds, folderId}     (folderId null: the top)
//   PATCH …/versions/:versionId/files/:assetId        {filename}
//   PATCH …/versions/:versionId/folders/:folderId     {name}
// Each answers the updated version. 404 to everyone but admins; audited (counts, never values of other people).
import { json, readJson, id, fail } from "../lib/http.js";
import { getVersion } from "./versions.js";
import { requireFeature } from "../lib/features.js";
import { requireAdmin } from "../auth/session.js";
import { audit } from "../audit/log.js";
import { versionView } from "./view.js";
import * as edits from "./edits.js";

const BASE = "/api/admin/packs/versions/:versionId";

function handler(action, run) {
  return async (app, params) => {
    requireFeature(app, "packs.builder");
    const user = await requireAdmin(app);
    const version = await getVersion(app.db, id(params.versionId, "versionId"));
    if (!version) fail(404, "not_found", "No such version.");
    const body = await readJson(app.request, 256 * 1024);
    const detail = await run(app, version, body, params, user.id);
    await audit(app, `pack.${action}`, { targetType: "pac", targetId: version.pac_id, detail: { versionId: version.id, ...detail } });
    return json({ version: await versionView(app.db, version.id) });
  };
}

const count = (ids) => (Array.isArray(ids) ? ids.length : 0);

export const routes = [
  ["PUT", `${BASE}/values`, handler("values_set", async (app, v, b, _p, by) => {
    await edits.setValues(app, v, { assetIds: b.assetIds, field: b.field, value: b.value === undefined ? null : b.value, by });
    return { field: b.field, files: count(b.assetIds) };
  })],
  ["POST", `${BASE}/suggestions`, handler("suggestions_decided", async (app, v, b, _p, by) => {
    await edits.decideSuggestion(app, v, { assetIds: b.assetIds, field: b.field, value: b.value, accept: b.accept, by });
    return { field: b.field, accept: b.accept === true, files: count(b.assetIds) };
  })],
  ["PUT", `${BASE}/folders/:folderId/values`, handler("folder_default_set", async (app, v, b, p, by) => {
    await edits.setFolderValue(app, v, { folderId: p.folderId, field: b.field, value: b.value === undefined ? null : b.value, by });
    return { field: b.field, folderId: p.folderId };
  })],
  ["POST", `${BASE}/move`, handler("files_moved", async (app, v, b) => {
    await edits.moveEntries(app, v, { assetIds: b.assetIds, folderId: b.folderId === undefined ? null : b.folderId });
    return { files: count(b.assetIds) };
  })],
  ["PATCH", `${BASE}/files/:assetId`, handler("file_renamed", async (app, v, b, p) => {
    await edits.renameEntry(app, v, { assetId: p.assetId, filename: b.filename });
    return {};
  })],
  ["PATCH", `${BASE}/folders/:folderId`, handler("folder_renamed", async (app, v, b, p) => {
    await edits.renameFolder(app, v, { folderId: p.folderId, name: b.name });
    return {};
  })]
];
