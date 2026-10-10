// The engine's only way to storage, answered from an R2 binding: reads of the allowed buckets, and, while a `process`
// job runs, writes under that job's own prefix only. Writes never replace an existing object, must declare their length,
// and are hashed here (SHA-256 while streaming to R2), so the record of each write (jobs/<id>/writes/<attempt>/<n>.<sha>.<size>)
// is this side's word, not the engine's. Used by the engine Worker (src/index.js) and, in development and tests, by the
// store's stand-in route (server/packs/engine-storage.js).
import { storageRequest, writeRecordKey } from "./jobs.js";

/**
 * Answers one storage request. bucket: the R2 binding; allowed: bucket names; job: { jobId, attempt, prefix } while a process
 * job runs, else null.
 */
export async function relay(request, bucket, allowed, job) {
  const write = job ? { prefix: job.prefix, length: request.headers.get("Content-Length") } : null;
  const r = storageRequest(request.method, request.url, request.headers.get("Range"), allowed, write);
  if (r.status) return new Response(null, { status: r.status });
  if (r.put) {
    if (!request.body && r.length > 0) return new Response(null, { status: 400 });
    const body = request.body || new Response(new Uint8Array(0)).body;
    const [toStore, toHash] = body.tee();
    const digest = new crypto.DigestStream("SHA-256");
    const hashed = toHash.pipeTo(digest);
    let stored;
    try {
      stored = await bucket.put(r.key, toStore.pipeThrough(new FixedLengthStream(r.length)), {
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: "application/octet-stream", contentDisposition: "attachment" }
      });
      await hashed;
    } catch {
      return new Response(null, { status: 400 });
    }
    // null: the key already existed (put with onlyIf refuses to replace it).
    if (!stored) return new Response(null, { status: 409 });
    const sha256 = [...new Uint8Array(await digest.digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    await bucket.put(writeRecordKey(job.jobId, job.attempt, r.n, sha256, stored.size), new Uint8Array(0));
    return new Response(null, { status: 201 });
  }
  const obj = r.head && !r.range ? await bucket.head(r.key) : await bucket.get(r.key, r.range ? { range: r.range } : {});
  if (!obj) return new Response(null, { status: 404 });
  const length = r.range ? Math.min(r.range.length, Math.max(0, obj.size - r.range.offset)) : obj.size;
  const headers = { "Content-Length": String(length), "X-Object-Size": String(obj.size) };
  if (r.range) headers["Content-Range"] = `bytes ${r.range.offset}-${r.range.offset + length - 1}/${obj.size}`;
  return new Response(r.head ? null : obj.body, { status: r.range ? 206 : 200, headers });
}
