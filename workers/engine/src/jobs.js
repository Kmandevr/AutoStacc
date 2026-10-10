// The engine Worker's plain logic, kept apart from Cloudflare objects so it can be unit-tested in Node
// (test/unit/engine-worker.test.js): checking a job, where its answer is stored, and the admin token check.
const OPS = new Set(["list", "inspect", "file"]);
const ID = /^[a-z0-9_-]{8,64}$/;
const KEY = /^[A-Za-z0-9!_.*'()/ -]{1,1024}$/;

// A vocabulary rides in the queue message (Queues take up to 128 KB); the real one is a few KB.
const VOCABULARY_MAX = 64 * 1024;

/** A job as queued: { jobId, op, bucket, key, path?, vocabulary? }. Returns the job or throws with a reason. */
export function checkJob(job, allowedBuckets) {
  if (!job || typeof job !== "object") throw new Error("not an object");
  const { jobId, op, bucket, key, path, vocabulary } = job;
  if (!ID.test(String(jobId))) throw new Error("bad jobId");
  if (!OPS.has(op)) throw new Error("bad op");
  if (!allowedBuckets.includes(bucket)) throw new Error("bucket not allowed");
  if (!KEY.test(String(key)) || key.includes("..")) throw new Error("bad key");
  if (path !== undefined && (typeof path !== "string" || path.length > 1024)) throw new Error("bad path");
  if (vocabulary !== undefined) {
    if (!vocabulary || typeof vocabulary !== "object" || Array.isArray(vocabulary)) throw new Error("bad vocabulary");
    if (JSON.stringify(vocabulary).length > VOCABULARY_MAX) throw new Error("vocabulary too large");
  }
  return { jobId, op, bucket, key, ...(path !== undefined ? { path } : {}), ...(vocabulary !== undefined ? { vocabulary } : {}) };
}

export const resultKey = (jobId) => `jobs/${jobId}/result.json`;
export const failedKey = (jobId) => `jobs/${jobId}/failed.json`;

/** What the engine's HTTP service gets for a job (engine/src/serve.rs). */
export const engineRequest = (job) => ({
  op: job.op,
  source: { bucket: job.bucket, key: job.key },
  ...(job.path ? { path: job.path } : {}),
  ...(job.vocabulary ? { vocabulary: job.vocabulary } : {})
});

/** Constant-time comparison of a presented bearer token with the configured one; false when none is configured. */
export function tokenMatches(header, expected) {
  if (!expected || expected.length < 32) return false;
  const given = String(header || "").replace(/^Bearer /, "");
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export const buckets = (env) => String(env.R2_BUCKETS || "").split(",").map((s) => s.trim()).filter(Boolean);

/** The host the engine reads storage from (engine/src/r2.rs). It never leaves Cloudflare: the engine Worker answers it. */
export const STORAGE_HOST = "storage.engine";

/**
 * A storage read from the engine: GET or HEAD http://storage.engine/<bucket>/<key>, with an optional single
 * "Range: bytes=a-b". Returns { bucket, key, head, range? } or { status } to refuse with.
 */
export function storageRequest(method, url, rangeHeader, allowedBuckets) {
  if (method !== "GET" && method !== "HEAD") return { status: 405 };
  const u = new URL(url);
  const [bucket, ...rest] = u.pathname.slice(1).split("/");
  let key;
  try {
    key = rest.map(decodeURIComponent).join("/");
  } catch {
    return { status: 400 };
  }
  if (!allowedBuckets.includes(bucket)) return { status: 403 };
  if (!KEY.test(key) || key.includes("..")) return { status: 400 };
  if (!rangeHeader) return { bucket, key, head: method === "HEAD" };
  const m = /^bytes=(\d+)-(\d+)$/.exec(rangeHeader);
  if (!m || Number(m[2]) < Number(m[1])) return { status: 416 };
  return { bucket, key, head: method === "HEAD", range: { offset: Number(m[1]), length: Number(m[2]) - Number(m[1]) + 1 } };
}
