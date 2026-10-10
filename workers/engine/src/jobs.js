// The engine Worker's plain logic, kept apart from Cloudflare objects so it can be unit-tested in Node
// (test/unit/engine-worker.test.js): checking a job, where its answer is stored, and the admin token check.
const OPS = new Set(["list", "inspect", "file", "process"]);
const OWNER = /^[a-z0-9_]{1,48}$/;
const ID = /^[a-z0-9_-]{8,64}$/;
const KEY = /^[A-Za-z0-9!_.*'()/ -]{1,1024}$/;

// A vocabulary rides in the queue message (Queues take up to 128 KB); the real one is a few KB.
const VOCABULARY_MAX = 64 * 1024;

/**
 * A job as queued: { jobId, op, bucket, key, path?, vocabulary?, ownerScope? }. A `process` job names the owner its
 * originals are stored for; where they go (writePrefix) is decided here, never by the engine. Returns the job or throws.
 */
export function checkJob(job, allowedBuckets) {
  if (!job || typeof job !== "object") throw new Error("not an object");
  const { jobId, op, bucket, key, path, vocabulary, ownerScope } = job;
  if (typeof jobId !== "string" || !ID.test(jobId)) throw new Error("bad jobId");
  if (!OPS.has(op)) throw new Error("bad op");
  if (!allowedBuckets.includes(bucket)) throw new Error("bucket not allowed");
  if (typeof key !== "string" || !KEY.test(key) || key.includes("..")) throw new Error("bad key");
  if (path !== undefined && (typeof path !== "string" || path.length > 1024)) throw new Error("bad path");
  if (vocabulary !== undefined) {
    if (!vocabulary || typeof vocabulary !== "object" || Array.isArray(vocabulary)) throw new Error("bad vocabulary");
    if (JSON.stringify(vocabulary).length > VOCABULARY_MAX) throw new Error("vocabulary too large");
  }
  if (op === "process" && (typeof ownerScope !== "string" || !OWNER.test(ownerScope))) throw new Error("bad ownerScope");
  return {
    jobId, op, bucket, key,
    ...(path !== undefined ? { path } : {}),
    ...(vocabulary !== undefined ? { vocabulary } : {}),
    ...(op === "process" ? { ownerScope } : {})
  };
}

export const resultKey = (jobId) => `jobs/${jobId}/result.json`;
export const failedKey = (jobId) => `jobs/${jobId}/failed.json`;

/** What the engine's HTTP service gets for a job (engine/src/serve.rs); attempt: the queue's delivery count (from 1). */
export const engineRequest = (job, attempt = 1) => ({
  op: job.op,
  source: { bucket: job.bucket, key: job.key },
  ...(job.path ? { path: job.path } : {}),
  ...(job.vocabulary ? { vocabulary: job.vocabulary } : {}),
  ...(job.op === "process" ? { target: { bucket: job.bucket, prefix: writePrefix(job.ownerScope, job.jobId, attempt) } } : {})
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

// Largest single original the engine may write (the archive limit is 50 GB in all).
const WRITE_MAX = 50 * 1024 ** 3;

/**
 * A storage request from the engine: GET or HEAD http://storage.engine/<bucket>/<key>, with an optional single
 * "Range: bytes=a-b"; or, while a `process` job runs, PUT <bucket>/<prefix><n> with its Content-Length, where prefix
 * is the running job's own (write = { prefix, length }). Returns { bucket, key, head, range?, put?, n? } or { status }.
 */
export function storageRequest(method, url, rangeHeader, allowedBuckets, write = null) {
  if (method !== "GET" && method !== "HEAD" && method !== "PUT") return { status: 405 };
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
  if (method === "PUT") {
    if (!write || !write.prefix || !key.startsWith(write.prefix)) return { status: 403 };
    const n = key.slice(write.prefix.length);
    if (!/^[1-9][0-9]{0,5}$/.test(n)) return { status: 403 };
    const length = Number(write.length);
    if (write.length === null || write.length === undefined || write.length === "" || !Number.isSafeInteger(length) || length < 0 || length > WRITE_MAX) return { status: 411 };
    return { bucket, key, put: true, n: Number(n), length };
  }
  if (!rangeHeader) return { bucket, key, head: method === "HEAD" };
  const m = /^bytes=(\d+)-(\d+)$/.exec(rangeHeader);
  if (!m || Number(m[2]) < Number(m[1])) return { status: 416 };
  return { bucket, key, head: method === "HEAD", range: { offset: Number(m[1]), length: Number(m[2]) - Number(m[1]) + 1 } };
}

/**
 * Where a running `process` job may write: blobs/<owner>/<jobId>/<attempt>/ (the engine never chooses it). Each
 * delivery of a retried job writes afresh, since writes never replace; the import keeps the attempt that answered.
 */
export const writePrefix = (ownerScope, jobId, attempt = 1) => `blobs/${ownerScope}/${jobId}/${attempt}/`;

/** The record of one write, an empty object named with this side's own hash: jobs/<id>/writes/<attempt>/<n>.<sha256>.<size>. */
export const writeRecordKey = (jobId, attempt, n, sha256, size) => `jobs/${jobId}/writes/${attempt}/${n}.${sha256}.${size}`;

/** Reads a write record's name back: { attempt, n, sha256, size } or null. */
export function parseWriteRecord(key) {
  const m = /\/writes\/([1-9][0-9]{0,2})\/([1-9][0-9]{0,5})\.([0-9a-f]{64})\.([0-9]{1,15})$/.exec(key);
  return m ? { attempt: Number(m[1]), n: Number(m[2]), sha256: m[3], size: Number(m[4]) } : null;
}
