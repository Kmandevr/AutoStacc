// A version's archive on its way in (D1 uploads; R2 under uploads/<version>/): a multipart upload in parts of one size
// (the last may be shorter), each streamed with its declared length and never buffered. Parts may arrive in any order
// and be sent again; R2 can't list them, so each is recorded here as it lands. Deleted once the version is published
// or discarded (R2 itself aborts unfinished uploads after 7 days).
import { first, run, newId, now, parseJson } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { startMultipart, uploadPart, completeMultipart } from "../storage/buckets.js";

export const PART_BYTES = 64 * 1024 * 1024;
export const ZIP_MAX_BYTES = 50 * 1024 ** 3;

const partsOf = (size) => Math.max(1, Math.ceil(size / PART_BYTES));
const partLength = (size, n) => (n < partsOf(size) ? PART_BYTES : size - (partsOf(size) - 1) * PART_BYTES);

export const getUpload = (db, id) => first(db, "SELECT * FROM uploads WHERE id = ?", id);

export async function startZip(app, version, { filename, size }) {
  if (!Number.isSafeInteger(size) || size < 22 || size > ZIP_MAX_BYTES) fail(400, "invalid_size", "That isn't a ZIP size AutoStacc accepts.");
  const id = newId("up");
  const key = `uploads/${version.id}/${id}.zip`;
  const mp = await startMultipart(app.env, key);
  const t = now();
  await run(app.db, `INSERT INTO uploads (id, version_id, kind, filename, r2_key, upload_id, size_bytes, parts, status, created_at, updated_at)
    VALUES (?, ?, 'zip', ?, ?, ?, ?, '[]', 'open', ?, ?)`, id, version.id, filename, key, mp.uploadId, size, t, t);
  return { uploadId: id, partBytes: PART_BYTES, parts: partsOf(size) };
}

/** One part, streamed through. Sending a part again replaces it. */
export async function putPart(app, upload, n) {
  if (upload.status !== "open") fail(409, "upload_closed", "This upload is already finished.");
  if (!Number.isInteger(n) || n < 1 || n > partsOf(upload.size_bytes)) fail(400, "invalid_part", "No such part.");
  const length = Number(app.request.headers.get("content-length"));
  if (length !== partLength(upload.size_bytes, n) || !app.request.body) fail(400, "invalid_part_size", `Part ${n} must be ${partLength(upload.size_bytes, n)} bytes.`);
  const part = await uploadPart(app.env, upload.r2_key, upload.upload_id, n, app.request.body, length);
  // Appended in one statement, so parts landing at the same time can't overwrite each other.
  await run(app.db, "UPDATE uploads SET parts = json_insert(parts, '$[#]', json(?)), updated_at = ? WHERE id = ? AND status = 'open'",
    JSON.stringify({ part: n, etag: part.etag }), now(), upload.id);
  return { part: n };
}

/** Joins the parts once all are there; the parts still missing otherwise. */
export async function complete(app, upload) {
  if (upload.status === "complete") return { complete: true };
  const latest = new Map();
  for (const p of parseJson(upload.parts, [])) latest.set(p.part, p);
  const missing = [];
  for (let n = 1; n <= partsOf(upload.size_bytes); n++) if (!latest.has(n)) missing.push(n);
  if (missing.length) return { complete: false, missing };
  const parts = [...latest.values()].sort((a, b) => a.part - b.part).map((p) => ({ partNumber: p.part, etag: p.etag }));
  await completeMultipart(app.env, upload.r2_key, upload.upload_id, parts);
  await run(app.db, "UPDATE uploads SET status = 'complete', updated_at = ? WHERE id = ? AND status = 'open'", now(), upload.id);
  return { complete: true };
}
