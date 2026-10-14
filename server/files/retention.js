// Removed files' bytes (part of the daily sweep): a delivered file that isn't a stored original (a single upload, a
// catalog file) and has stopped being active (deleted, rejected, or retired past its 30 days) reaches nobody, so a day
// after that its object is deleted and the row marked purged (the row stays, for orders and the audit trail). Until
// then it still counts against its creator's quota (creators/storage.js), so deleting and uploading again can't fill
// AutoStacc's storage past what the creator may hold. Stored originals have their own sweep (blobs/sweep.js).
import { all, run, now } from "../lib/db.js";
import { deleteKeys } from "../storage/buckets.js";

export const PURGE_AFTER_HOURS = 24;

/** Deletes up to `limit` removed files' objects whose day has passed. Returns how many. */
export async function purgeRemovedFiles(app, { nowMs = Date.now(), limit = 200 } = {}) {
  const cutoff = new Date(nowMs - PURGE_AFTER_HOURS * 3600000).toISOString();
  const due = await all(app.db, `SELECT id, r2_key FROM product_files WHERE blob_id IS NULL AND active = 0 AND status_at < ?
    AND json_extract(COALESCE(meta, '{}'), '$.purgedAt') IS NULL LIMIT ?`, cutoff, limit);
  if (!due.length) return 0;
  // Objects first: a failure leaves the row unmarked, and the next run deletes again (deleting is idempotent).
  await deleteKeys(app.env, due.map((f) => f.r2_key));
  await run(app.db, `UPDATE product_files SET meta = json_set(COALESCE(meta, '{}'), '$.purgedAt', ?)
    WHERE id IN (SELECT value FROM json_each(?)) AND active = 0`, now(), JSON.stringify(due.map((f) => f.id)));
  return due.length;
}
