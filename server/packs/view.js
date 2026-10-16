// A version as the Pack Builder shows it (GET /api/admin/packs/versions/:id): state, totals and problems, and once the
// engine is done its folders (with their defaults) and files with everything said about each (the engine's suggestions,
// the creator's own values) and what each resolves to (manifest.js, js/pack-resolve.js). As a revision, each file also says
// how it relates to the live version it was checked against (change: new, moved, replaced; absent when unchanged), and
// stats.diff lists the files it removes (revision.js).
import { parseJson } from "../lib/db.js";
import { getVersion } from "./versions.js";
import { loadManifest } from "./manifest.js";
import { refreshedStats } from "./final-review.js";

export async function versionView(db, versionId) {
  const v = await getVersion(db, versionId);
  // A ready version may have been built or edited in steps: its diff and revision risk as they stand now (final-review.js).
  const stats = v.status === "ready" ? await refreshedStats(db, v) : parseJson(v.stats, {});
  const out = { id: v.id, pacId: v.pac_id, productId: v.product_id, number: v.number, status: v.status, note: v.review_note || null,
    // Failed by an admin's rejection (reviewed_by set) rather than by processing: the creator sees the difference.
    rejected: v.status === "failed" && Boolean(v.reviewed_by),
    stats, engineVersion: v.engine_version || null, editable: v.status === "ready" };
  if (["ready", "in_review", "published", "superseded"].includes(v.status)) {
    const m = await loadManifest(db, v.id);
    const diff = out.stats.diff || null;
    out.folders = m.folders;
    out.files = m.files.map((f) => ({
      assetId: f.assetId, path: f.originalPath, filename: f.filename, folderId: f.folderId, folderPath: f.folderPath, sizeBytes: f.sizeBytes,
      format: f.format, sha256: f.sha256, facts: f.facts,
      suggestions: f.values.filter((x) => x.origin !== "creator").map(({ field, value, origin, confidence, status }) => ({ field, value, origin, confidence, status })),
      own: Object.fromEntries(f.values.filter((x) => x.origin === "creator").map((x) => [x.field, x.value])),
      resolved: f.resolved,
      ...(diff ? { change: diff.changes[f.assetId] } : {})
    }));
  }
  return out;
}
