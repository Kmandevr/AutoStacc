// Versions of a Pac's contents (D1 pac_versions, docs/packs.md): draft → uploading → processing → ready → published,
// or failed / discarded, each move a compare-and-set so a retry or a second tab can't move a version twice. One
// unfinished version per Pac at a time (pacs.draft_version_id); a failed or discarded one never touches the live one.
import { first, run, stmt, newId, now } from "../lib/db.js";
import { fail } from "../lib/http.js";

export const getVersion = (db, id) => first(db, "SELECT * FROM pac_versions WHERE id = ?", id);

/** Moves a version from one of `from` to `to`; returns true if this call moved it. */
export async function move(db, id, from, to, extra = {}) {
  const sets = Object.keys(extra).map((k) => `${k} = ?`);
  const res = await run(db, `UPDATE pac_versions SET status = ?, updated_at = ?${sets.map((s) => ", " + s).join("")}
    WHERE id = ? AND status IN (${from.map(() => "?").join(",")})`, to, now(), ...Object.values(extra), id, ...from);
  return res.meta.changes === 1;
}

export const moveStmt = (db, id, from, to) =>
  stmt(db, `UPDATE pac_versions SET status = ?, updated_at = ? WHERE id = ? AND status = ?`, to, now(), id, from);

/**
 * A new version of a Pac for a product. Same idempotency key → the same version back. Refused while the Pac already
 * has an unfinished version (finish, or discard it, first).
 */
export async function createVersion(db, { pacId, productId, ownerScope, origin, idempotencyKey, createdBy }) {
  const again = await first(db, "SELECT * FROM pac_versions WHERE idempotency_key = ?", idempotencyKey);
  if (again) {
    if (again.pac_id !== pacId) fail(409, "idempotency_conflict", "That key was used for another Pac.");
    return again;
  }
  const id = newId("pv");
  const t = now();
  const claimed = await run(db, "UPDATE pacs SET draft_version_id = ?, updated_at = ? WHERE id = ? AND draft_version_id IS NULL", id, t, pacId);
  if (!claimed.meta.changes) fail(409, "draft_exists", "This Pac already has a version in progress. Finish or discard it first.");
  try {
    await run(db, `INSERT INTO pac_versions (id, pac_id, number, origin, status, idempotency_key, created_by, created_at, updated_at, product_id, owner_scope)
      SELECT ?, ?, COALESCE(MAX(number), 0) + 1, ?, 'draft', ?, ?, ?, ?, ?, ? FROM pac_versions WHERE pac_id = ?`,
      id, pacId, origin, idempotencyKey, createdBy, t, t, productId, ownerScope, pacId);
  } catch (e) {
    await run(db, "UPDATE pacs SET draft_version_id = NULL WHERE id = ? AND draft_version_id = ?", pacId, id);
    throw e;
  }
  return getVersion(db, id);
}

/** Frees the Pac for its next version (after publishing, discarding or failing this one). */
export const releaseDraftStmt = (db, pacId, versionId) =>
  stmt(db, "UPDATE pacs SET draft_version_id = NULL, updated_at = ? WHERE id = ? AND draft_version_id = ?", now(), pacId, versionId);
