// Processing a version: once its archive is uploaded, one `process` job checks it, stores each accepted original and
// suggests values (engine-client.js); when the answer is in, import.js turns it into the version's manifest. Reading a
// version's state drives this (the browser polls), so nothing depends on a callback arriving. A version never stays
// "processing" for good: a job that can't be queued, an import that fails, or a job silent for JOB_TIMEOUT_MS fails it,
// frees the Pac and removes what the job left in storage. The budget guard (server/usage/) can hold a job back:
// it then waits 'queued' (the version still "processing", noted waiting_for_allowance) until the daily sweep or its
// creator's next look sends it, oldest first; its time-out counts from when it's sent, and it can be discarded.
import { all, first, run, stmt, now, isGuardFailure } from "../lib/db.js";
import { getVersion, move, releaseDraftStmt } from "./versions.js";
import { queueProcess, jobState, jobObjects } from "./engine-client.js";
import { importResult } from "./import.js";
import { dropArchives } from "./uploads.js";
import { deleteKeys } from "../storage/buckets.js";
import { processingAllowed, meterStmts, jobCost, checkLevels } from "../usage/usage.js";

export const JOB_TIMEOUT_MS = 2 * 60 * 60 * 1000;

// The job id is derived from the version, so a repeated start can't queue a second job.
const jobIdOf = (version) => `pj_${version.id.slice(3)}`;

// cost: what the job used, metered only if it was still running (so two requests failing it count it once).
async function fail(app, version, jobId, error, cost = null) {
  await app.db.batch([
    ...(cost ? meterStmts(app.db, cost, { when: "EXISTS (SELECT 1 FROM processing_jobs WHERE id = ? AND status = 'running')", params: [jobId] }) : []),
    stmt(app.db, "UPDATE processing_jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?", error, now(), jobId),
    stmt(app.db, "UPDATE pac_versions SET status = 'failed', review_note = ?, updated_at = ? WHERE id = ? AND status = 'processing'", error, now(), version.id),
    releaseDraftStmt(app.db, version.pac_id, version.id)
  ]);
  // Nothing of a failed job is kept (its copies, records and the uploaded archive), except objects a stored-original
  // row points to: another version may have reused one meanwhile; the retention sweep decides about those.
  const uploads = await all(app.db, "SELECT r2_key FROM uploads WHERE version_id = ?", version.id);
  const left = await jobObjects(app, version.owner_scope, jobId);
  const claimed = new Set((await all(app.db, "SELECT r2_key FROM blobs WHERE r2_key IN (SELECT value FROM json_each(?))", JSON.stringify(left))).map((b) => b.r2_key));
  await deleteKeys(app.env, [...left.filter((k) => !claimed.has(k)), ...uploads.map((u) => u.r2_key)]);
}

export async function startProcess(app, version, upload) {
  const jobId = jobIdOf(version);
  const t = now();
  const go = await processingAllowed(app);
  // The job exists before the version says "processing", so a crash in between can't leave one without the other.
  await run(app.db, `INSERT INTO processing_jobs (id, version_id, kind, contract_version, status, sent_at, created_at, updated_at)
    VALUES (?, ?, 'process', 1, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`, jobId, version.id, go.start ? "running" : "queued", go.start ? t : null, t, t);
  if (!(await move(app.db, version.id, ["uploading"], "processing", go.start ? {} : { review_note: WAITING }))) return getVersion(app.db, version.id);
  if (go.start) await send(app, version, jobId, upload, go.analyze);
  return getVersion(app.db, version.id);
}

const WAITING = "waiting_for_allowance";

async function send(app, version, jobId, upload, analyze) {
  try {
    await queueProcess(app, { jobId, key: upload.r2_key, ownerScope: version.owner_scope, analyze });
  } catch (e) {
    await fail(app, version, jobId, "not_queued");
    throw e;
  }
}

// Sends a waiting job if the budget allows now and it's first in line (oldest waiting); the claim is a compare-and-set,
// so two requests can't both send it.
async function sendWaiting(app, version, job) {
  const go = await processingAllowed(app);
  if (!go.start) return;
  const next = await first(app.db, "SELECT id FROM processing_jobs WHERE status = 'queued' ORDER BY created_at, id LIMIT 1");
  if (!next || next.id !== job.id) return;
  const t = now();
  const claimed = await run(app.db, "UPDATE processing_jobs SET status = 'running', sent_at = ?, updated_at = ? WHERE id = ? AND status = 'queued'", t, t, job.id);
  if (!claimed.meta.changes) return;
  await run(app.db, "UPDATE pac_versions SET review_note = NULL WHERE id = ? AND review_note = ?", version.id, WAITING);
  const upload = await first(app.db, "SELECT * FROM uploads WHERE version_id = ? AND kind = 'zip' AND status = 'complete'", version.id);
  if (!upload) return fail(app, version, job.id, "not_queued");
  await send(app, version, job.id, upload, go.analyze).catch(() => {});
}

/** From the daily sweep: sends up to `limit` waiting jobs, oldest first, while the budget allows (a few a day, so
 * jobs sent together don't time out waiting behind each other in the engine's queue). */
export async function drainWaiting(app, { limit = 3 } = {}) {
  let sent = 0;
  for (const j of await all(app.db, "SELECT * FROM processing_jobs WHERE status = 'queued' ORDER BY created_at, id LIMIT ?", limit)) {
    const version = await getVersion(app.db, j.version_id);
    if (!version || version.status !== "processing") continue;
    await sendWaiting(app, version, j);
    if ((await first(app.db, "SELECT status FROM processing_jobs WHERE id = ?", j.id)).status !== "queued") sent++;
    else break;
  }
  return sent;
}

/** Brings a processing version up to date: imports the engine's answer when it's in. */
export async function refresh(app, version) {
  if (version.status !== "processing") return version;
  const job = await first(app.db, "SELECT * FROM processing_jobs WHERE id = ?", jobIdOf(version));
  if (!job) {
    await fail(app, version, jobIdOf(version), "not_queued");
    return getVersion(app.db, version.id);
  }
  if (job.status === "queued") {
    await sendWaiting(app, version, job);
    return getVersion(app.db, version.id);
  }
  const state = await jobState(app, job.id);
  const cost = jobCost({ wallMs: state.wallMs, attempts: state.attempt || 1, files: state.result && state.result.files ? state.result.files.length : 0 });
  if (state.state === "pending") {
    if (Date.now() - Date.parse(job.sent_at || job.created_at) > JOB_TIMEOUT_MS) await fail(app, version, job.id, "timed_out", cost);
    return getVersion(app.db, version.id);
  }
  if (state.state === "done" && state.status === 200 && !state.result.error) {
    try {
      await importResult(app, version, job, state);
    } catch (e) {
      // Another request imported it a moment earlier: its guard rolled this one back. Anything else fails the version.
      if (!isGuardFailure(e)) {
        if (!e.code) console.error(`pack import ${version.id}:`, e && e.message);
        await fail(app, version, job.id, ["too_many_files", "quota_exceeded", "storage_full", "missing_files"].includes(e.code) ? e.code : "import_failed", cost);
      }
    }
  } else {
    await fail(app, version, job.id, state.state === "failed" ? "processing_failed" : String(state.result.error || "processing_failed").slice(0, 60), cost);
  }
  await checkLevels(app).catch((e) => console.error("usage alerts:", e && e.message));
  return getVersion(app.db, version.id);
}

/** Drops an unfinished version and its upload; the live version is untouched. */
export async function discard(app, version) {
  // A version waiting for the allowance can be dropped too: its job, never sent, is cancelled first.
  const waiting = version.status === "processing"
    && (await run(app.db, "UPDATE processing_jobs SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'queued'", now(), jobIdOf(version))).meta.changes === 1;
  const moved = await move(app.db, version.id, waiting ? ["processing"] : ["draft", "uploading", "ready", "in_review", "failed"], "discarded");
  if (!moved) return false;
  await run(app.db, "UPDATE pacs SET draft_version_id = NULL, updated_at = ? WHERE id = ? AND draft_version_id = ?", now(), version.pac_id, version.id);
  await dropArchives(app, version.id);
  return true;
}
