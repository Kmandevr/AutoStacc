// Admin, paid files and previews: upload a product's file (or a new version of one), hold it back as pending or
// publish it, reject or deactivate it, and upload public preview clips. Limits come from server/files/policy.js, the
// lifecycle from server/files/files.js. Every change is written to the audit log under the admin's name.
import { json, fail, readJson, str, id } from "../lib/http.js";
import { first, run, newId, now, parseJson } from "../lib/db.js";
import { requireAdmin } from "../auth/session.js";
import { getProduct } from "../catalog/products.js";
import { newFileKey, previewKey, putPreview, safeFilename, peekPreview, deletePreview } from "../storage/buckets.js";
import { putVerifiedFile } from "../files/upload.js";
import { checkUpload, contentTypeFor, looksLike, extensionOf, PREVIEW_EXTENSIONS } from "../files/policy.js";
import { countKept, setStatus, unpublishEmptyStudioProducts } from "../files/files.js";
import { audit } from "../audit/log.js";

const FILE_ID = /^pf_[a-z2-7]+$/;

// Raw upload: PUT the file bytes with ?filename=...&label=...&pac=...&kind=...&status=pending|published .
// Stored privately under a random key. &replaces=<fileId> (a file of the same product) deactivates that file once the
// new one is stored, if the new one is published: a new version. pac (optional) must be one of the product's Pacs;
// kind (optional) is a content kind key from data/content-types.js. They only organize the file in Your Stacc;
// access is still per product. status=pending keeps the file from customers until it is published.
async function uploadFile(app, { productId }) {
  await requireAdmin(app);
  const p = await getProduct(app.db, id(productId));
  if (!p) fail(404, "not_found", "No product with that id.");
  const url = new URL(app.request.url);
  const filename = safeFilename(str(url.searchParams.get("filename") || "", "filename", { max: 160 }));
  const label = (url.searchParams.get("label") || "").slice(0, 120);
  const pacId = url.searchParams.get("pac") ? id(url.searchParams.get("pac"), "pac") : null;
  if (pacId && !parseJson(p.pacs, []).includes(pacId)) fail(400, "invalid_pac", "That Pac isn't one of this product's Pacs.");
  const kind = url.searchParams.get("kind") ? str(url.searchParams.get("kind"), "kind", { max: 30, pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/ }) : "";
  const status = url.searchParams.get("status") ? str(url.searchParams.get("status"), "status", { pattern: /^(pending|published)$/ }) : "published";
  const replaces = url.searchParams.get("replaces") ? str(url.searchParams.get("replaces"), "replaces", { max: 40, pattern: FILE_ID }) : null;
  const [replaced, kept] = await Promise.all([
    replaces ? first(app.db, "SELECT id FROM product_files WHERE id = ? AND product_id = ? AND active = 1", replaces, p.id) : null,
    countKept(app.db, p.id)
  ]);
  if (replaces && !replaced) fail(404, "not_found", "The file to replace isn't an active file of this product.");
  checkUpload({ filename, sizeBytes: Number(app.request.headers.get("content-length") || 0), existing: kept - (replaces ? 1 : 0) });
  const key = newFileKey(p.id, filename);
  const { object, contentType } = await putVerifiedFile(app, key, filename, app.request.body);
  const fileId = newId("pf");
  const t = now();
  await run(app.db, `INSERT INTO product_files (id, product_id, r2_key, filename, label, content_type, size_bytes, sort, active, created_at, pac_id, kind, status, status_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?)`, fileId, p.id, key, filename, label, contentType, object.size, t, pacId, kind, status, t);
  if (replaces && status === "published") await run(app.db, "UPDATE product_files SET active = 0 WHERE id = ?", replaces);
  await audit(app, replaces ? "product.file_replaced" : "product.file_added", { targetType: "product", targetId: p.id,
    detail: { fileId, filename, sizeBytes: object.size, status, replaced: status === "published" ? replaces : null } });
  return json({ ok: true, fileId, sizeBytes: object.size, status, replaced: status === "published" ? replaces : null }, 201);
}

// PATCH { status: "published" | "pending" | "rejected", note? }: the file's place in its lifecycle.
async function fileStatus(app, { fileId }) {
  await requireAdmin(app);
  const fid = str(fileId, "fileId", { max: 40, pattern: FILE_ID });
  const body = await readJson(app.request);
  const status = str(body.status, "status", { pattern: /^(pending|published|rejected)$/ });
  const note = typeof body.note === "string" ? body.note.slice(0, 200) : null;
  const res = await setStatus(app.db, fid, status, note);
  if (!res.meta.changes) fail(404, "not_found", "No file with that id.");
  await unpublishEmptyStudioProducts(app.db);
  await audit(app, `product.file_${status}`, { targetType: "file", targetId: fid });
  return json({ ok: true, status });
}

// Files are deactivated, not deleted: the object stays in R2 for the record, but no new download can reach it.
async function removeFile(app, { fileId }) {
  await requireAdmin(app);
  const res = await run(app.db, "UPDATE product_files SET active = 0 WHERE id = ?", str(fileId, "fileId", { max: 40 }));
  if (!res.meta.changes) fail(404, "not_found", "No file with that id.");
  await unpublishEmptyStudioProducts(app.db);
  await audit(app, "product.file_deactivated", { targetType: "file", targetId: fileId });
  return json({ ok: true });
}

async function uploadPreview(app) {
  await requireAdmin(app);
  const url = new URL(app.request.url);
  const filename = str(url.searchParams.get("filename") || "", "filename", { max: 120, pattern: /^[\w.\- ()]+\.(mp3|m4a|ogg|wav)$/i });
  const size = Number(app.request.headers.get("content-length") || 0);
  if (!size || size > 20 * 1024 * 1024) fail(413, "too_large", "Previews must be under 20 MB.");
  const contentType = contentTypeFor(filename);
  if (!PREVIEW_EXTENSIONS.has(extensionOf(filename)) || !contentType.startsWith("audio/")) fail(415, "unsupported_media_type", "Previews must be audio.");
  const key = previewKey(filename);
  await putPreview(app.env, key, app.request.body, contentType);
  if (!looksLike(filename, await peekPreview(app.env, key))) {
    await deletePreview(app.env, key);
    fail(415, "content_mismatch", "That file isn't really audio of the kind its name says.");
  }
  await audit(app, "preview.uploaded", { targetType: "preview", targetId: key, detail: { filename } });
  return json({ ok: true, path: `/media/${key}` }, 201);
}

export const routes = [
  ["PUT", "/api/admin/products/:productId/files", uploadFile],
  ["PATCH", "/api/admin/files/:fileId", fileStatus],
  ["DELETE", "/api/admin/files/:fileId", removeFile],
  ["PUT", "/api/admin/previews", uploadPreview]
];
