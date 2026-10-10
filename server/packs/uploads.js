// A version's archive on its way in (D1 uploads; R2 under uploads/<version>/): a multipart upload in parts of one size
// (the last may be shorter), each streamed with its declared length and never buffered. Parts may arrive in any order
// and be sent again; R2 can't list them, so each is recorded here as it lands. Deleted once the version is published
// or discarded (R2 itself aborts unfinished uploads after 7 days).
import { first, run, newId, now, parseJson } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { startMultipart, uploadPart, completeMultipart, abortMultipart, headFile } from "../storage/buckets.js";

export const PART_BYTES = 64 * 1024 * 1024;
export const ZIP_MAX_BYTES = 50 * 1024 ** 3;

const partsOf = (size) => Math.max(1, Math.ceil(size / PART_BYTES));
const partLength = (size, n) => (n < partsOf(size) ? PART_BYTES : size - (partsOf(size) - 1) * PART_BYTES);

export const getUpload = (db, id) => first(db, "SELECT * FROM uploads WHERE id = ?", id);

// A creator's storage in use: their delivered files, plus every archive on its way (uploaded or uploading for a
// version not yet published, discarded or failed). Checked inside the insert that reserves room for a new archive, so
// two uploads at the same moment can't both squeeze under the limit.
const IN_USE = `(SELECT COALESCE(SUM(f.size_bytes), 0) FROM product_files f JOIN products p ON p.id = f.product_id JOIN projects j ON j.id = p.project_id
    WHERE j.creator_id = ?1 AND f.active = 1 AND f.status IN ('pending', 'published') AND f.retired_at IS NULL)
  + (SELECT COALESCE(SUM(u.size_bytes), 0) FROM uploads u JOIN pac_versions v ON v.id = u.version_id JOIN products p ON p.id = v.product_id
    JOIN projects j ON j.id = p.project_id WHERE j.creator_id = ?1 AND v.status IN ('draft', 'uploading', 'processing', 'ready', 'in_review'))`;

/** The creator's file storage in use: live files plus the archives of unfinished versions (what the quota counts). */
export const storageUsed = async (db, creatorId) => (await first(db, `SELECT ${IN_USE} AS n`, creatorId)).n;

/** quota: { creatorId, bytes } for a creator's upload (null for AutoStacc's own). */
export async function startZip(app, version, { filename, size, quota = null }) {
  if (!Number.isSafeInteger(size) || size < 22 || size > ZIP_MAX_BYTES) fail(400, "invalid_size", "That isn't a ZIP size AutoStacc accepts.");
  const id = newId("up");
  const key = `uploads/${version.id}/${id}.zip`;
  const mp = await startMultipart(app.env, key);
  const t = now();
  const res = await run(app.db, `INSERT INTO uploads (id, version_id, kind, filename, r2_key, upload_id, size_bytes, parts, status, created_at, updated_at)
    SELECT ?2, ?3, 'zip', ?4, ?5, ?6, ?7, '[]', 'open', ?8, ?8 WHERE ?9 IS NULL OR ${IN_USE} + ?7 <= ?9`,
    quota ? quota.creatorId : null, id, version.id, filename, key, mp.uploadId, size, t, quota ? quota.bytes : null);
  if (!res.meta.changes) {
    await abortMultipart(app.env, key, mp.uploadId).catch(() => {});
    fail(409, "quota_exceeded", `That would go over your ${Math.floor(quota.bytes / 1048576)} MB of file storage. Remove files or a draft first.`);
  }
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
  try {
    await completeMultipart(app.env, upload.r2_key, upload.upload_id, parts);
  } catch (e) {
    // Completed by an earlier try (or a request racing this one) whose bookkeeping didn't land: the object is there.
    const done = await headFile(app.env, upload.r2_key);
    if (!done || done.size !== upload.size_bytes) throw e;
  }
  await run(app.db, "UPDATE uploads SET status = 'complete', updated_at = ? WHERE id = ? AND status = 'open'", now(), upload.id);
  return { complete: true };
}
