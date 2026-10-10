// A version's manifest as the review screen and publishing both see it: its files (with their stored original's facts),
// folders with their paths and defaults, every value said about each file, and what each file resolves to
// (js/pack-resolve.js). One loader, so what the creator reviewed is exactly what gets published.
import { all, parseJson } from "../lib/db.js";
import resolver from "../../js/pack-resolve.js";

export async function loadManifest(db, versionId) {
  const [entries, folders, values, folderValues] = await Promise.all([
    all(db, `SELECT e.asset_id, e.blob_id, e.filename, e.folder_id, e.original_path, e.sort, b.size_bytes, b.format, b.sha256, b.facts
      FROM pac_entries e JOIN blobs b ON b.id = e.blob_id WHERE e.version_id = ? AND e.state = 'verified' ORDER BY e.sort LIMIT 5000`, versionId),
    all(db, "SELECT id, parent_id, name FROM pac_folders WHERE version_id = ? ORDER BY sort", versionId),
    all(db, `SELECT v.asset_id, v.field, v.value, v.origin, v.confidence, v.status FROM asset_values v JOIN pac_entries e ON e.asset_id = v.asset_id
      WHERE e.version_id = ?`, versionId),
    all(db, "SELECT folder_id, field, value FROM pac_folder_values WHERE version_id = ?", versionId)
  ]);
  const byId = new Map(folders.map((f) => [f.id, f]));
  const pathOf = (id, seen = new Set()) => {
    const f = byId.get(id);
    if (!f || seen.has(id)) return "";
    seen.add(id);
    return f.parent_id ? `${pathOf(f.parent_id, seen)}/${f.name}` : f.name;
  };
  const resolved = resolver.resolveVersion({
    entries: entries.map((e) => ({ assetId: e.asset_id, folderId: e.folder_id })),
    folders: folders.map((f) => ({ id: f.id, parentId: f.parent_id, name: f.name })),
    values: values.map((v) => ({ assetId: v.asset_id, field: v.field, value: v.value, origin: v.origin, confidence: v.confidence, status: v.status })),
    folderValues: folderValues.map((fv) => ({ folderId: fv.folder_id, field: fv.field, value: fv.value }))
  });
  const valuesOf = Object.groupBy(values, (v) => v.asset_id);
  const defaultsOf = Object.groupBy(folderValues, (fv) => fv.folder_id);
  return {
    folders: folders.map((f) => ({ id: f.id, parentId: f.parent_id, name: f.name, path: pathOf(f.id),
      values: Object.fromEntries((defaultsOf[f.id] || []).map((fv) => [fv.field, fv.value])) })),
    files: entries.map((e) => ({
      assetId: e.asset_id, blobId: e.blob_id, filename: e.filename, folderId: e.folder_id, folderPath: e.folder_id ? pathOf(e.folder_id) : "",
      originalPath: e.original_path, sort: e.sort, sizeBytes: e.size_bytes, format: e.format, sha256: e.sha256, facts: parseJson(e.facts, {}),
      values: (valuesOf[e.asset_id] || []).map(({ field, value, origin, confidence, status }) => ({ field, value, origin, confidence, status })),
      resolved: resolved.get(e.asset_id) || {}
    }))
  };
}
