// Adding files to a checked, unpublished version, one or a few at a time (docs/packs.md, "Pac editor"; owner,
// 2026-10-15). Each addition is its own record with its own upload (the browser sends the files as a small stored ZIP,
// js/zip-thin.js) and its own engine job (pj_<addition>), so the version stays 'ready' throughout: its edits go on,
// and an addition that fails fails alone, never the version. One open addition per version (a unique index). When the
// job's answer is in, append.js merges what it kept into the version. Like a version's processing, reading the
// addition's state drives it (the browser polls; the daily sweep settles stale ones).
import { first, run, stmt, now, newId, all } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { startZip, getUpload } from "./uploads.js";
import { queueProcess, jobState, jobObjects } from "./engine-client.js";
import { appendResult } from "./append.js";
import { processingAllowed, meterStmts, jobCost } from "../usage/usage.js";
import { deleteKeys } from "../storage/buckets.js";
import { JOB_TIMEOUT_MS } from "./process.js";

const jobIdOf = (addition) => `pj_${addition.id.slice(3)}`;
// An addition still uploading after this long is given up (its upload holds room in the creator's storage).
export const STALE_ADDITION_HOURS = 24;

export const getAddition = (db, id) => first(db, "SELECT * FROM pac_additions WHERE id = ?", id);

export const additionView = (a) => ({ id: a.id, versionId: a.version_id, folderId: a.folder_id, status: a.status, error: a.error || null,
  stats: JSON.parse(a.stats || "{}") });

/** Starts an addition: { addition, upload plan }. quota as for a version's archive (uploads.js), null for AutoStacc. */
export async function startAddition(app, version, { folderId = null, filename, size, idempotencyKey, createdBy, quota }) {
  const again = await first(app.db, "SELECT * FROM pac_additions WHERE idempotency_key = ?", idempotencyKey);
  if (again) {
    if (again.version_id !== version.id) fail(409, "idempotency_conflict", "That key was used for another version.");
    const up = await first(app.db, "SELECT * FROM uploads WHERE addition_id = ?", again.id);
    return { addition: again, upload: up };
  }
  if (version.status !== "ready") fail(409, "not_editable", "Files can be added only to a checked version that isn't published yet.");
  // Near the month's free allowance, no new engine jobs (server/usage/); a whole version would wait, an addition can't.
  if (!(await processingAllowed(app)).start) fail(409, "processing_paused", "AutoStacc has used this month's processing allowance. Adding files works again on the 1st.");
  if (folderId !== null && !(await first(app.db, "SELECT 1 FROM pac_folders WHERE version_id = ? AND id = ?", version.id, folderId))) fail(404, "not_found", "No such folder in this version.");
  const id = newId("pa");
  const t = now();
  try {
    await run(app.db, `INSERT INTO pac_additions (id, version_id, folder_id, status, idempotency_key, created_by, created_at, updated_at)
      VALUES (?, ?, ?, 'uploading', ?, ?, ?, ?)`, id, version.id, folderId, idempotencyKey, createdBy, t, t);
  } catch (e) {
    if (/UNIQUE constraint failed/i.test(String(e.message))) fail(409, "addition_open", "Files are already being added to this version. Wait for them first.");
    throw e;
  }
  try {
    await startZip(app, version, { filename, size, quota, additionId: id });
  } catch (e) {
    await run(app.db, "UPDATE pac_additions SET status = 'failed', error = 'not_started', updated_at = ? WHERE id = ?", now(), id);
    throw e;
  }
  return { addition: await getAddition(app.db, id), upload: await first(app.db, "SELECT * FROM uploads WHERE addition_id = ?", id) };
}

/** Once its upload is complete: the engine job is sent and the addition is checking. */
export async function sendAddition(app, addition, upload) {
  const version = await first(app.db, "SELECT * FROM pac_versions WHERE id = ?", addition.version_id);
  const jobId = jobIdOf(addition);
  const t = now();
  const moved = await run(app.db, "UPDATE pac_additions SET status = 'processing', updated_at = ? WHERE id = ? AND status = 'uploading'", t, addition.id);
  if (!moved.meta.changes) return getAddition(app.db, addition.id);
  await run(app.db, `INSERT INTO processing_jobs (id, version_id, addition_id, kind, contract_version, status, sent_at, created_at, updated_at)
    VALUES (?, ?, ?, 'process', 1, 'running', ?, ?, ?) ON CONFLICT(id) DO NOTHING`, jobId, version.id, addition.id, t, t, t);
  try {
    await queueProcess(app, { jobId, key: upload.r2_key, ownerScope: version.owner_scope, analyze: (await processingAllowed(app)).analyze });
  } catch (e) {
    await failAddition(app, addition, "not_queued");
    throw e;
  }
  return getAddition(app.db, addition.id);
}

// cost: what the job used, metered only while it was still running (so two requests failing it count it once).
async function failAddition(app, addition, error, cost = null) {
  const jobId = jobIdOf(addition);
  const version = await first(app.db, "SELECT owner_scope FROM pac_versions WHERE id = ?", addition.version_id);
  await app.db.batch([
    ...(cost ? meterStmts(app.db, cost, { when: "EXISTS (SELECT 1 FROM processing_jobs WHERE id = ? AND status = 'running')", params: [jobId] }) : []),
    stmt(app.db, "UPDATE processing_jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND status = 'running'", error, now(), jobId),
    stmt(app.db, "UPDATE pac_additions SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND status IN ('uploading', 'processing')", error, now(), addition.id)
  ]);
  // Nothing of it is kept, except objects a stored-original row points to (another version may use one).
  const left = version ? await jobObjects(app, version.owner_scope, jobId) : [];
  const claimed = new Set((await all(app.db, "SELECT r2_key FROM blobs WHERE r2_key IN (SELECT value FROM json_each(?))", JSON.stringify(left))).map((b) => b.r2_key));
  const ups = await all(app.db, "SELECT id, r2_key FROM uploads WHERE addition_id = ?", addition.id);
  await deleteKeys(app.env, [...left.filter((k) => !claimed.has(k)), ...ups.map((u) => u.r2_key)]);
  await run(app.db, "UPDATE uploads SET status = 'aborted', updated_at = ? WHERE addition_id = ?", now(), addition.id);
}

/** Brings an addition up to date: merges the engine's answer when it's in (append.js), or fails it. */
export async function refreshAddition(app, addition) {
  if (addition.status !== "processing") return addition;
  const job = await first(app.db, "SELECT * FROM processing_jobs WHERE id = ?", jobIdOf(addition));
  if (!job) {
    await failAddition(app, addition, "not_queued");
    return getAddition(app.db, addition.id);
  }
  const state = await jobState(app, job.id);
  const cost = jobCost({ wallMs: state.wallMs, attempts: state.attempt || 1, files: state.result && state.result.files ? state.result.files.length : 0 });
  if (state.state === "pending") {
    if (Date.now() - Date.parse(job.sent_at || job.created_at) > JOB_TIMEOUT_MS) await failAddition(app, addition, "timed_out", cost);
    return getAddition(app.db, addition.id);
  }
  if (state.state === "done" && state.status === 200 && !state.result.error) {
    try {
      await appendResult(app, addition, job, state, await getUpload(app.db, (await first(app.db, "SELECT id FROM uploads WHERE addition_id = ?", addition.id)).id));
    } catch (e) {
      if (!/CHECK constraint failed/i.test(String(e && e.message))) {
        if (!e.code) console.error(`pack addition ${addition.id}:`, e && e.message);
        await failAddition(app, addition, ["too_many_files", "quota_exceeded", "storage_full", "missing_files", "not_editable"].includes(e.code) ? e.code : "import_failed", cost);
      }
    }
  } else {
    await failAddition(app, addition, state.state === "failed" ? "processing_failed" : String(state.result.error || "processing_failed").slice(0, 60), cost);
  }
  return getAddition(app.db, addition.id);
}

/** Whether a version has an addition in progress (publishing waits for it). */
export const openAddition = (db, versionId) => first(db, "SELECT * FROM pac_additions WHERE version_id = ? AND status IN ('uploading', 'processing')", versionId);

/** From the daily sweep: additions checking are brought up to date; ones stuck uploading are given up. */
export async function sweepAdditions(app, { nowMs = Date.now(), limit = 50 } = {}) {
  let n = 0;
  for (const a of await all(app.db, "SELECT * FROM pac_additions WHERE status = 'processing' ORDER BY updated_at LIMIT ?", limit)) (await refreshAddition(app, a), n++);
  const stale = new Date(nowMs - STALE_ADDITION_HOURS * 3600000).toISOString();
  for (const a of await all(app.db, "SELECT * FROM pac_additions WHERE status = 'uploading' AND updated_at < ? LIMIT ?", stale, limit)) (await failAddition(app, a, "abandoned"), n++);
  return n;
}
