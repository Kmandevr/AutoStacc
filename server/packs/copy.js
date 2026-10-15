// Editing a Pac in the builder (docs/packs.md, "Pac editor"): a new version that starts as a copy of the live one, its
// folders (same ids), folder defaults and files (same assets, so their values and published file ids carry over),
// checked already because nothing new is in it, so it's ready at once with no engine job. With no live version it
// starts empty. Files are then added, moved, removed or written (additions.js, tree-edits.js, edits.js) and the
// version is published like any other (the automated review sees what it changes, final-review.js).
import { first, stmt, now, parseJson } from "../lib/db.js";
import { createVersion } from "./versions.js";
import { restatStmt } from "./stats.js";

export async function startDraft(app, { pac, product, ownerScope, idempotencyKey, createdBy }) {
  const live = pac.live_version_id ? await first(app.db, "SELECT * FROM pac_versions WHERE id = ?", pac.live_version_id) : null;
  const v = await createVersion(app.db, { pacId: pac.id, productId: product.id, ownerScope, origin: live ? "revision" : "files", idempotencyKey, createdBy });
  if (v.status !== "draft") return v; // the same key again
  const t = now();
  const stats = { files: 0, bytes: 0, folders: 0, refused: [], review: { verdict: "pass", flags: [] }, edited: true };
  await app.db.batch([
    ...(live ? [
      stmt(app.db, `INSERT INTO pac_folders (id, version_id, parent_id, name, sort, original_path)
        SELECT id, ?, parent_id, name, sort, original_path FROM pac_folders WHERE version_id = ?`, v.id, live.id),
      stmt(app.db, `INSERT INTO pac_folder_values (version_id, folder_id, field, value, set_by, set_at)
        SELECT ?, folder_id, field, value, set_by, set_at FROM pac_folder_values WHERE version_id = ?`, v.id, live.id),
      stmt(app.db, `INSERT INTO pac_entries (version_id, asset_id, folder_id, filename, original_path, blob_id, sort, state)
        SELECT ?, asset_id, folder_id, filename, original_path, blob_id, sort, state FROM pac_entries WHERE version_id = ? AND blob_id IS NOT NULL`, v.id, live.id)
    ] : []),
    stmt(app.db, "UPDATE pac_versions SET status = 'ready', stats = ?, base_version_id = ?, engine_version = ?, updated_at = ? WHERE id = ? AND status = 'draft'",
      JSON.stringify(stats), live ? live.id : null, live ? live.engine_version : null, t, v.id),
    restatStmt(app.db, v.id)
  ]);
  return first(app.db, "SELECT * FROM pac_versions WHERE id = ?", v.id);
}

/** Whether a version was made in the builder (a copy or an empty start) rather than from one upload. */
export const isEdited = (version) => Boolean(parseJson(version.stats, {}).edited);
