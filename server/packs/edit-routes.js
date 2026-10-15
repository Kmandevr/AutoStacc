// Pack Builder review routes (docs/packs.md Phase 4), on a version that is checked and not yet published, under each
// scope's prefix (access.js: the admin's on any version, a creator's on their own products' versions only):
//   PUT   …/versions/:versionId/values                {assetIds, field, value}  the creator's value ("" = none, null = inherit)
//   POST  …/versions/:versionId/suggestions           {assetIds, field, value, accept}
//   PUT   …/versions/:versionId/folders/:folderId/values {field, value}       a folder default (null removes it)
//   POST  …/versions/:versionId/move                  {assetIds, folderId}     (folderId null: the top)
//   PATCH …/versions/:versionId/files/:assetId        {filename}
//   PATCH …/versions/:versionId/folders/:folderId     {name} and/or {parentId} (null: the top)
// Each answers the updated version. 404 to anyone outside the scope; audited (counts, never values of other people).
import { json, readJson } from "../lib/http.js";
import { audit } from "../audit/log.js";
import { versionView } from "./view.js";
import * as edits from "./edits.js";

const handlerFor = (scope) => (action, run) => async (app, params) => {
  const actor = await scope.actor(app);
  const version = await scope.version(app, actor, params.versionId);
  const body = await readJson(app.request, 256 * 1024);
  const detail = await run(app, version, body, params, actor.user.id);
  await audit(app, `pack.${action}`, { targetType: "pac", targetId: version.pac_id, detail: { versionId: version.id, ...detail } });
  return json({ version: await versionView(app.db, version.id) });
};

const count = (ids) => (Array.isArray(ids) ? ids.length : 0);

/** The review routes for one scope (access.js ADMIN or STUDIO). */
export function editRoutes(scope) {
  const BASE = `${scope.prefix}/versions/:versionId`;
  const handler = handlerFor(scope);
  return [
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
      if (b.parentId !== undefined) await edits.moveFolder(app, v, { folderId: p.folderId, parentId: b.parentId === null ? null : String(b.parentId) });
      if (b.name !== undefined || b.parentId === undefined) await edits.renameFolder(app, v, { folderId: p.folderId, name: b.name });
      return b.parentId !== undefined ? { moved: true } : {};
    })]
  ];
}
