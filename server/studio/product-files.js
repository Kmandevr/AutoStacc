// Studio API, a product's paid files: a creator uploads the files a buyer gets and removes their own. The same checks as
// the owner's uploads (server/files/policy.js: listed types, contents must match the name), plus the creator's limits.
// A trusted creator's files can be delivered at once; anyone else's wait as "pending" until AutoStacc approves them in
// the Control Center, because a buyer pays for what these files are. A product with no deliverable file isn't on sale.
// Also the product's public preview clip (played on its page).
import { json, fail, str } from "../lib/http.js";
import { first, run, newId, now, randomToken } from "../lib/db.js";
import { requireUser } from "../auth/session.js";
import { limit } from "../lib/ratelimit.js";
import { LIMITS } from "../creators/policy.js";
import { requireOwnProduct } from "../creators/products.js";
import { checkUpload, contentTypeFor, looksLike, extensionOf, PREVIEW_EXTENSIONS } from "../files/policy.js";
import { countKept, setStatus, unpublishEmptyStudioProducts } from "../files/files.js";
import { putVerifiedFile } from "../files/upload.js";
import { newFileKey, safeFilename, deleteFile, putPreview, peekPreview, deletePreview } from "../storage/buckets.js";
import { alertAdmins } from "../email/alerts.js";

const FILE_ID = /^pf_[a-z2-7]+$/;
const usedBytes = async (db, creatorId) => (await first(db, `SELECT COALESCE(SUM(f.size_bytes), 0) AS n FROM product_files f JOIN products p ON p.id = f.product_id
  JOIN projects j ON j.id = p.project_id WHERE j.creator_id = ? AND f.active = 1 AND f.status IN ('pending', 'published')`, creatorId)).n;

async function upload(app, { productId }) {
  const user = await requireUser(app);
  await limit(app, "studio-file", 30, 3600);
  const { product, creator } = await requireOwnProduct(app.db, productId, user);
  const filename = safeFilename(str(new URL(app.request.url).searchParams.get("filename") || "", "filename", { max: 160 }));
  const size = Number(app.request.headers.get("content-length") || 0);
  const [existing, used] = await Promise.all([countKept(app.db, product.id), usedBytes(app.db, creator.id)]);
  if (existing >= LIMITS.filesPerProduct) fail(409, "limit_reached", `A product can have up to ${LIMITS.filesPerProduct} files.`);
  checkUpload({ filename, sizeBytes: size, existing });
  if (used + size > LIMITS.productFilesQuotaBytes) fail(409, "quota_exceeded", `That would go over your ${LIMITS.productFilesQuotaBytes / 1048576} MB of file storage. Remove a file first.`);
  const key = newFileKey(product.id, filename);
  const { object, contentType } = await putVerifiedFile(app, key, filename, app.request.body);
  const status = creator.trusted ? "published" : "pending";
  const id = newId("pf");
  const t = now();
  // The storage limit is checked in the insert itself, so two uploads at once can't both squeeze under it.
  const res = await run(app.db,
    `INSERT INTO product_files (id, product_id, r2_key, filename, label, content_type, size_bytes, sort, active, created_at, pac_id, kind, status, status_at)
     SELECT ?, ?, ?, ?, '', ?, ?, 0, 1, ?, NULL, '', ?, ?
     WHERE (SELECT COALESCE(SUM(f.size_bytes), 0) FROM product_files f JOIN products p ON p.id = f.product_id JOIN projects j ON j.id = p.project_id
       WHERE j.creator_id = ? AND f.active = 1 AND f.status IN ('pending', 'published')) + ? <= ?`,
    id, product.id, key, filename, contentType, object.size, t, status, t, creator.id, object.size, LIMITS.productFilesQuotaBytes);
  if (!res.meta.changes) {
    await deleteFile(app.env, key);
    fail(409, "quota_exceeded", `That would go over your ${LIMITS.productFilesQuotaBytes / 1048576} MB of file storage. Remove a file first.`);
  }
  if (status === "pending") await alertAdmins(app, { key: `file:${id}`, title: "a creator's file is waiting for approval",
    lines: [`${creator.name} (/${creator.slug}) uploaded ${filename} to "${product.title}".`, "Publish or reject it in the Control Center, Products."] });
  return json({ file: { id, filename, sizeBytes: object.size, status } }, 201);
}

// Removing stops delivery of that file; people who already own the product keep whatever files remain.
async function remove(app, { productId, fileId }) {
  const user = await requireUser(app);
  const { product } = await requireOwnProduct(app.db, productId, user);
  const fid = str(fileId, "fileId", { max: 40, pattern: FILE_ID });
  if (!(await first(app.db, "SELECT 1 FROM product_files WHERE id = ? AND product_id = ? AND active = 1", fid, product.id))) fail(404, "not_found", "No such file.");
  await setStatus(app.db, fid, "deleted");
  await unpublishEmptyStudioProducts(app.db);
  return json({ ok: true });
}

// A public preview clip for the product page (audio only, under 20 MB, contents must match the name). The stored name is
// new each time (product id plus a random part), so a replaced clip is never served from a cache; the old one is deleted.
const PREVIEW_MAX = 20 * 1024 * 1024;
async function uploadPreview(app, { productId }) {
  const user = await requireUser(app);
  await limit(app, "studio-preview", 20, 3600);
  const { product } = await requireOwnProduct(app.db, productId, user);
  const filename = str(new URL(app.request.url).searchParams.get("filename") || "", "filename", { max: 160 });
  const ext = extensionOf(filename);
  const contentType = contentTypeFor(filename);
  if (!PREVIEW_EXTENSIONS.has(ext) || !contentType.startsWith("audio/")) fail(415, "unsupported_media_type", "Previews must be MP3, M4A, OGG or WAV audio.");
  const size = Number(app.request.headers.get("content-length") || 0);
  if (!size || size > PREVIEW_MAX) fail(413, "too_large", "Previews must be under 20 MB.");
  const name = `${product.id}-${randomToken(6)}.${ext}`;
  const key = `previews/${name}`;
  await putPreview(app.env, key, app.request.body, contentType);
  if (!looksLike(filename, await peekPreview(app.env, key))) {
    await deletePreview(app.env, key);
    fail(415, "content_mismatch", "That file isn't really audio of the kind its name says.");
  }
  await run(app.db, "UPDATE products SET preview = ?, updated_at = ? WHERE id = ?", `/media/${key}`, now(), product.id);
  const old = product.preview && product.preview.startsWith(`/media/previews/${product.id}-`) ? product.preview.slice("/media/".length) : null;
  if (old) await deletePreview(app.env, old);
  return json({ preview: `/media/${key}` }, 201);
}

async function removePreview(app, { productId }) {
  const user = await requireUser(app);
  const { product } = await requireOwnProduct(app.db, productId, user);
  await run(app.db, "UPDATE products SET preview = NULL, updated_at = ? WHERE id = ?", now(), product.id);
  if (product.preview && product.preview.startsWith(`/media/previews/${product.id}-`)) await deletePreview(app.env, product.preview.slice("/media/".length));
  return json({ ok: true });
}

export const routes = [
  ["PUT", "/api/studio/products/:productId/preview", uploadPreview],
  ["DELETE", "/api/studio/products/:productId/preview", removePreview],
  ["PUT", "/api/studio/products/:productId/files", upload],
  ["DELETE", "/api/studio/products/:productId/files/:fileId", remove]
];
