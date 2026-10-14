// Retention sweep of Pac versions (part of the daily sweep, server/maintenance/sweep.js): versions still processing
// are brought up to date (which times out a job silent for too long), versions left unfinished for ABANDONED_DAYS (or
// an upload with no part for STALE_UPLOAD_HOURS) are discarded (freeing their Pac), and uploaded archives no longer needed (the version was imported, published, failed
// or discarded, but a crash skipped the cleanup) are deleted. A few per run, so a run stays well inside its limits.
import { all, run, now } from "../lib/db.js";
import { refresh, discard } from "./process.js";
import { deleteKeys } from "../storage/buckets.js";

export const ABANDONED_DAYS = 30;
// An upload with no part for this long is dropped: its reservation counts against the creator's quota and AutoStacc's
// storage cap at its full size, so an abandoned one mustn't hold that room for a month.
export const STALE_UPLOAD_HOURS = 24;

export async function sweepVersions(app, { nowMs = Date.now(), limit = 50 } = {}) {
  const out = { refreshed: 0, discarded: 0, archives: 0 };
  // Not versions waiting for the processing allowance: process.js drainWaiting sends those, a few at a time.
  for (const v of await all(app.db, `SELECT * FROM pac_versions WHERE status = 'processing'
    AND id NOT IN (SELECT version_id FROM processing_jobs WHERE status = 'queued') ORDER BY updated_at LIMIT ?`, limit)) {
    await refresh(app, v);
    out.refreshed++;
  }
  const cutoff = new Date(nowMs - ABANDONED_DAYS * 86400000).toISOString();
  for (const v of await all(app.db, "SELECT * FROM pac_versions WHERE status IN ('draft', 'uploading', 'ready', 'failed') AND updated_at < ? LIMIT ?", cutoff, limit)) {
    if (await discard(app, v)) out.discarded++;
  }
  const quiet = new Date(nowMs - STALE_UPLOAD_HOURS * 3600000).toISOString();
  for (const v of await all(app.db, `SELECT v.* FROM pac_versions v JOIN uploads u ON u.version_id = v.id
    WHERE v.status = 'uploading' AND u.status = 'open' AND u.updated_at < ? LIMIT ?`, quiet, limit)) {
    if (await discard(app, v)) out.discarded++;
  }
  const stale = await all(app.db, `SELECT u.id, u.r2_key FROM uploads u JOIN pac_versions v ON v.id = u.version_id
    WHERE u.status = 'complete' AND v.status IN ('ready', 'in_review', 'published', 'superseded', 'failed', 'discarded') LIMIT ?`, limit * 10);
  if (stale.length) {
    await deleteKeys(app.env, stale.map((u) => u.r2_key));
    // "aborted" here means the archive's bytes are gone (the manifest is the record).
    await run(app.db, "UPDATE uploads SET status = 'aborted', updated_at = ? WHERE id IN (SELECT value FROM json_each(?))", now(), JSON.stringify(stale.map((u) => u.id)));
    out.archives = stale.length;
  }
  return out;
}
