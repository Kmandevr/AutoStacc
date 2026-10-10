// Processing a version: once its archive is uploaded, one `process` job checks it, stores each accepted original and
// suggests values (engine-client.js); when the answer is in, import.js turns it into the version's manifest. Reading a
// version's state drives this (the browser polls), so nothing depends on a callback arriving.
import { all, first, run, stmt, now } from "../lib/db.js";
import { getVersion, move, releaseDraftStmt } from "./versions.js";
import { queueProcess, jobState } from "./engine-client.js";
import { importResult } from "./import.js";
import { deleteKeys } from "../storage/buckets.js";

export async function startProcess(app, version, upload) {
  if (!(await move(app.db, version.id, ["uploading"], "processing"))) return getVersion(app.db, version.id);
  // The job id is derived from the version, so a repeated start can't queue a second job.
  const jobId = `pj_${version.id.slice(3)}`;
  const t = now();
  await run(app.db, `INSERT INTO processing_jobs (id, version_id, kind, contract_version, status, created_at, updated_at)
    VALUES (?, ?, 'process', 1, 'running', ?, ?) ON CONFLICT(id) DO NOTHING`, jobId, version.id, t, t);
  try {
    await queueProcess(app, { jobId, key: upload.r2_key, ownerScope: version.owner_scope });
  } catch (e) {
    // Never left "processing" with no job behind it: the version fails and the Pac is free again.
    await app.db.batch([
      stmt(app.db, "UPDATE processing_jobs SET status = 'failed', error = 'not_queued', updated_at = ? WHERE id = ?", now(), jobId),
      stmt(app.db, "UPDATE pac_versions SET status = 'failed', review_note = 'not_queued', updated_at = ? WHERE id = ? AND status = 'processing'", now(), version.id),
      releaseDraftStmt(app.db, version.pac_id, version.id)
    ]);
    throw e;
  }
  return getVersion(app.db, version.id);
}

/** Brings a processing version up to date: imports the engine's answer when it's in. */
export async function refresh(app, version) {
  if (version.status !== "processing") return version;
  const job = await first(app.db, "SELECT * FROM processing_jobs WHERE version_id = ? AND kind = 'process' ORDER BY created_at DESC LIMIT 1", version.id);
  if (!job) return version;
  const state = await jobState(app, job.id);
  if (state.state === "pending") return version;
  if (state.state === "done" && state.status === 200 && !state.result.error) {
    try {
      await importResult(app, version, job, state);
    } catch (e) {
      // Another request imported it a moment earlier (the guard rolled this one back); anything else is a real failure.
      const now_ = await getVersion(app.db, version.id);
      if (now_.status === "processing") throw e;
      return now_;
    }
  } else {
    const error = state.state === "failed" ? "processing_failed" : String((state.result && state.result.error) || "processing_failed");
    await app.db.batch([
      stmt(app.db, "UPDATE processing_jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?", error, now(), job.id),
      stmt(app.db, "UPDATE pac_versions SET status = 'failed', review_note = ?, updated_at = ? WHERE id = ? AND status = 'processing'", error, now(), version.id),
      releaseDraftStmt(app.db, version.pac_id, version.id)
    ]);
  }
  return getVersion(app.db, version.id);
}

/** Drops an unfinished version and its upload; the live version is untouched. */
export async function discard(app, version) {
  const moved = await move(app.db, version.id, ["draft", "uploading", "ready", "failed"], "discarded");
  if (!moved) return false;
  await run(app.db, "UPDATE pacs SET draft_version_id = NULL, updated_at = ? WHERE id = ? AND draft_version_id = ?", now(), version.pac_id, version.id);
  const uploads = await all(app.db, "SELECT r2_key FROM uploads WHERE version_id = ?", version.id);
  await deleteKeys(app.env, uploads.map((u) => u.r2_key));
  await run(app.db, "UPDATE uploads SET status = 'aborted', updated_at = ? WHERE version_id = ? AND status = 'open'", now(), version.id);
  return true;
}
