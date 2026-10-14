// The only code in the store that knows how the processing engine is reached (docs/packs.md: the engine sits behind one
// seam). In production a job goes on the engine Worker's queue (JOBS producer binding); its answer appears in R2 at
// jobs/<id>/result.json and the storage relay records every write at jobs/<id>/writes/<attempt>/<n>.<sha256>.<size>.
// In development and tests (ENGINE_URL, refused in production) the job is posted straight to an engine service (the
// real binary or test/mock-engine) whose storage is the store's stand-in relay (engine-storage.js); the answer is
// stored the same way, so everything after this file is identical.
import { engineVocabulary } from "../discovery/vocabulary.js";
import { checkJob, engineRequest, resultKey, failedKey, parseWriteRecord } from "../../workers/engine/src/jobs.js";
import { putJson, getJson, headFile, listKeys } from "../storage/buckets.js";
import { fail } from "../lib/http.js";
import { isOn } from "../lib/features.js";

export const FILES_BUCKET = "autostacc-files";

const direct = (app) => !app.config.production && app.env.ENGINE_URL;

/** Queues a `process` job: check the archive at `key`, store each accepted file for `ownerScope`, suggest values.
 * analyze: false leaves the optional analysis out (the caller's budget says so). */
export async function queueProcess(app, { jobId, key, ownerScope, analyze = true }) {
  // Without suggestions switched on, the engine gets no vocabulary and suggests nothing; analysis comes with them.
  const suggest = isOn(app, "packs.suggestions");
  const extra = suggest ? { vocabulary: engineVocabulary(), ...(analyze && isOn(app, "packs.analysis") ? { analyze: true } : {}) } : {};
  const job = checkJob({ jobId, op: "process", bucket: FILES_BUCKET, key, ownerScope, ...extra }, [FILES_BUCKET]);
  if (!direct(app)) {
    if (!app.env.JOBS) fail(503, "engine_unavailable", "File processing isn't set up here yet.");
    await app.env.JOBS.send(job);
    return;
  }
  const run = runDirect(app, job);
  if (app.ctx && app.ctx.waitUntil) app.ctx.waitUntil(run);
  else await run;
}

async function runDirect(app, job) {
  const started = Date.now();
  try {
    const res = await fetch(`${String(app.env.ENGINE_URL).replace(/\/$/, "")}/v1/jobs`, { method: "POST", body: JSON.stringify(engineRequest(job, 1)) });
    const body = await res.json();
    if (res.status >= 500) throw new Error(`engine ${res.status}`);
    await app.env.FILES.put(resultKey(job.jobId), JSON.stringify(body), {
      httpMetadata: { contentType: "application/json" },
      customMetadata: { status: String(res.status), attempts: "1", wallMs: String(Date.now() - started) }
    });
  } catch (e) {
    await putJson(app.env, failedKey(job.jobId), { error: "engine_unreachable", reason: String(e.message || e).slice(0, 200) });
  }
}

/** Where a job stands: { state: "pending" } | { state: "failed" } | { state: "done", status, result, attempt, wallMs }
 * (wallMs: how long the engine's last attempt took, when recorded). */
export async function jobState(app, jobId) {
  const done = await getJson(app.env, resultKey(jobId));
  if (done) return { state: "done", status: Number(done.meta.status || 200), result: done.value, attempt: Number(done.meta.attempts || 1), wallMs: Number(done.meta.wallMs) || null };
  return (await headFile(app.env, failedKey(jobId))) ? { state: "failed" } : { state: "pending" };
}

/** The relay's record of what the job wrote in that attempt: { n: { sha256, size } }. */
export async function jobWrites(app, jobId, attempt) {
  const out = {};
  for (const key of await listKeys(app.env, `jobs/${jobId}/writes/${attempt}/`)) {
    const w = parseWriteRecord(key);
    if (w && w.attempt === attempt) out[w.n] = { sha256: w.sha256, size: w.size };
  }
  return out;
}

/** Everything a job left in storage (its stored files of every attempt, its answer and write records), for cleanup. */
export const jobObjects = async (app, ownerScope, jobId) => [
  ...(await listKeys(app.env, `blobs/${ownerScope}/${jobId}/`)),
  ...(await listKeys(app.env, `jobs/${jobId}/`))
];
