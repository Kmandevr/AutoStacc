// Pack Builder: which value each file of a version has for each field, and why (docs/packs.md, "Resolution"). In order:
// the creator's own value on the file; else the nearest folder's default (set on the folder, inherited by everything
// below it); else a suggestion the creator accepted, or one the engine is sure of (AUTO_ACCEPT and above) and nobody
// rejected; else nothing. A creator's empty value ("") means "none" and stops inheritance. Facts read from a file's own
// headers aren't values and are never overridden. Shared by the Control Center (live previews of edits and moves) and
// the server (what gets published). Pure, no DOM. Sets GS.packResolve in browsers, module.exports in Node.
(function (root) {
  "use strict";

  const FIELDS = ["kind", "instrument", "bpm", "key", "midiRole"];
  const AUTO_ACCEPT = 0.85;

  // A folder's chain from itself up to the top: folders is a Map of id → { id, parentId, name, values: { field: value } }.
  function chain(folderId, folders) {
    const out = [];
    const seen = new Set();
    for (let f = folders.get(folderId); f && !seen.has(f.id); f = folders.get(f.parentId)) {
      seen.add(f.id);
      out.push(f);
    }
    return out;
  }

  /**
   * One file. values: its rows [{ field, value, origin, confidence, status }]; folderId: its folder (null at the top).
   * Returns { field: { value, source: "creator" | "folder" | "accepted" | "auto", folderId?, folder?, origin?, confidence? } }.
   */
  function resolve(values, folderId, folders) {
    const out = {};
    const up = chain(folderId, folders);
    for (const field of FIELDS) {
      const mine = values.find((v) => v.field === field && v.origin === "creator");
      if (mine) {
        out[field] = { value: mine.value, source: "creator" };
        continue;
      }
      const from = up.find((f) => f.values && Object.prototype.hasOwnProperty.call(f.values, field));
      if (from) {
        out[field] = { value: from.values[field], source: "folder", folderId: from.id, folder: from.name };
        continue;
      }
      const best = values
        .filter((v) => v.field === field && v.origin !== "creator" && v.status !== "rejected" && (v.status === "accepted" || v.confidence >= AUTO_ACCEPT))
        .sort((a, b) => (b.status === "accepted") - (a.status === "accepted") || b.confidence - a.confidence)[0];
      if (best) out[field] = { value: best.value, source: best.status === "accepted" ? "accepted" : "auto", origin: best.origin, confidence: best.confidence };
    }
    // An explicit "none" is a decision, but not a value to show or publish.
    for (const field of FIELDS) if (out[field] && out[field].value === "") delete out[field];
    return out;
  }

  /**
   * A whole version: entries [{ assetId, folderId }], folders [{ id, parentId, name }], values [{ assetId, field, value,
   * origin, confidence, status }], folderValues [{ folderId, field, value }]. Returns a Map of assetId → resolve().
   */
  function resolveVersion({ entries, folders, values, folderValues }) {
    const byId = new Map(folders.map((f) => [f.id, { ...f, values: {} }]));
    for (const fv of folderValues) if (byId.has(fv.folderId)) byId.get(fv.folderId).values[fv.field] = fv.value;
    const byAsset = new Map();
    for (const v of values) (byAsset.get(v.assetId) || byAsset.set(v.assetId, []).get(v.assetId)).push(v);
    return new Map(entries.map((e) => [e.assetId, resolve(byAsset.get(e.assetId) || [], e.folderId || null, byId)]));
  }

  /** What changes for these files if they move to `toFolderId`: [{ assetId, field, from, to }] (for a move preview). */
  function moveChanges(input, assetIds, toFolderId) {
    const before = resolveVersion(input);
    const moved = new Set(assetIds);
    const after = resolveVersion({ ...input, entries: input.entries.map((e) => (moved.has(e.assetId) ? { ...e, folderId: toFolderId } : e)) });
    const out = [];
    for (const id of assetIds) {
      for (const field of FIELDS) {
        const a = before.get(id) && before.get(id)[field], b = after.get(id) && after.get(id)[field];
        if ((a && a.value) !== (b && b.value)) out.push({ assetId: id, field, from: a ? a.value : null, to: b ? b.value : null });
      }
    }
    return out;
  }

  const api = { FIELDS, AUTO_ACCEPT, resolve, resolveVersion, moveChanges };
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.GS = root.GS || {}).packResolve = api;
})(typeof self !== "undefined" ? self : globalThis);
