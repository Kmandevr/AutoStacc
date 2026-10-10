// Processing a version: once its archive is uploaded, one `process` job checks it, stores each accepted original and
// suggests values (engine-client.js); when the answer is in, import.js turns it into the version's manifest. Reading a
// version's state drives this (the browser polls), so nothing depends on a callback arriving. A version never stays
// "processing" for good: a job that can't be queued, an import that fails, or a job silent for JOB_TIMEOUT_MS fails it,
// frees the Pac and removes what the job left in storage.
import { all, first, run, stmt, now, isGuardFailure } from "../lib/db.js";
import { getVersion, move, releaseDraftStmt } from "./versions.js";
import { queueProcess, jobState, jobObjects } from "./engine-client.js";
import { importResult } from "./import.js";
import { deleteKeys, abortMultipart } from "../storage/buckets.js";

export const JOB_TIMEOUT_MS = 2 * 60 * 60 * 1000;

// The job id is derived from the version, so a repeated start can't queue a second job.
const jobIdOf = (version) => `pj_${version.id.slice(3)}`;

async function fail(app, version, jobId, error) {
  await app.db.batch([
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
  // The job exists before the version says "processing", so a crash in between can't leave one without the other.
  await run(app.db, `INSERT INTO processing_jobs (id, version_id, kind, contract_version, status, created_at, updated_at)
    VALUES (?, ?, 'process', 1, 'running', ?, ?) ON CONFLICT(id) DO NOTHING`, jobId, version.id, t, t);
  if (!(await move(app.db, version.id, ["uploading"], "processing"))) return getVersion(app.db, version.id);
  try {
    await queueProcess(app, { jobId, key: upload.r2_key, ownerScope: version.owner_scope });
  } catch (e) {
    await fail(app, version, jobId, "not_queued");
    throw e;
  }
  return getVersion(app.db, version.id);
}

/** Brings a processing version up to date: imports the engine's answer when it's in. */
export async function refresh(app, version) {
  if (version.status !== "processing") return version;
  const job = await first(app.db, "SELECT * FROM processing_jobs WHERE id = ?", jobIdOf(version));
  if (!job) {
    await fail(app, version, jobIdOf(version), "not_queued");
    return getVersion(app.db, version.id);
  }
  const state = await jobState(app, job.id);
  if (state.state === "pending") {
    if (Date.now() - Date.parse(job.created_at) > JOB_TIMEOUT_MS) await fail(app, version, job.id, "timed_out");
    return getVersion(app.db, version.id);
  }
  if (state.state === "done" && state.status === 200 && !state.result.error) {
    try {
      await importResult(app, version, job, state);
    } catch (e) {
      // Another request imported it a moment earlier: its guard rolled this one back. Anything else fails the version.
      if (!isGuardFailure(e)) {
        if (!e.code) console.error(`pack import ${version.id}:`, e && e.message);
        await fail(app, version, job.id, e.code === "too_many_files" ? "too_many_files" : "import_failed");
      }
    }
  } else {
    await fail(app, version, job.id, state.state === "failed" ? "processing_failed" : String(state.result.error || "processing_failed").slice(0, 60));
  }
  return getVersion(app.db, version.id);
}

/** Drops an unfinished version and its upload; the live version is untouched. */
export async function discard(app, version) {
  const moved = await move(app.db, version.id, ["draft", "uploading", "ready", "in_review", "failed"], "discarded");
  if (!moved) return false;
  await run(app.db, "UPDATE pacs SET draft_version_id = NULL, updated_at = ? WHERE id = ? AND draft_version_id = ?", now(), version.pac_id, version.id);
  const uploads = await all(app.db, "SELECT r2_key, upload_id, status FROM uploads WHERE version_id = ?", version.id);
  for (const u of uploads.filter((x) => x.status === "open")) await abortMultipart(app.env, u.r2_key, u.upload_id).catch(() => {});
  await deleteKeys(app.env, uploads.map((u) => u.r2_key));
  await run(app.db, "UPDATE uploads SET status = 'aborted', updated_at = ? WHERE version_id = ? AND status = 'open'", now(), version.id);
  return true;
}
