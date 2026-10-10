// R2 access in one place. FILES is private (paid downloads, only ever streamed after an entitlement check);
// PREVIEWS holds the public preview clips. Keys are generated here and never come from a browser.
import { randomToken } from "../lib/db.js";

export const safeFilename = (name) =>
  String(name).normalize("NFKC").replace(/[^\w.\- ()]+/g, "_").replace(/^[.\s]+/, "").slice(0, 120) || "file";

export const newFileKey = (productId, filename) => `products/${productId}/${randomToken(12)}/${safeFilename(filename)}`;

export const getFile = (env, key) => env.FILES.get(key);

export const putFile = (env, key, body, contentType) =>
  env.FILES.put(key, body, { httpMetadata: { contentType, contentDisposition: "attachment" } });

export const previewKey = (filename) => `previews/${safeFilename(filename)}`;

// Range-aware read for audio seeking.
export const getPreview = (env, key, request) => env.PREVIEWS.get(key, { range: request.headers, onlyIf: request.headers });

export const putPreview = (env, key, body, contentType) => env.PREVIEWS.put(key, body, { httpMetadata: { contentType } });

// Just the start of a stored object, to check a file is what its name says; and removing one that isn't.
const head = async (bucket, key) => {
  const o = await bucket.get(key, { range: { offset: 0, length: 16 } });
  return o ? new Uint8Array(await o.arrayBuffer()) : new Uint8Array();
};
export const peekFile = (env, key) => head(env.FILES, key);
export const peekPreview = (env, key) => head(env.PREVIEWS, key);
export const deleteFile = (env, key) => env.FILES.delete(key);
export const deletePreview = (env, key) => env.PREVIEWS.delete(key);

// Multipart uploads (a pack's ZIP): each part is streamed with its declared length, never buffered. R2 can't list an
// upload's parts, so the caller keeps them (server/packs/uploads.js).
export const startMultipart = (env, key) => env.FILES.createMultipartUpload(key, { httpMetadata: { contentType: "application/zip" } });
export const uploadPart = (env, key, uploadId, n, body, length) =>
  env.FILES.resumeMultipartUpload(key, uploadId).uploadPart(n, body.pipeThrough(new FixedLengthStream(length)));
export const completeMultipart = (env, key, uploadId, parts) => env.FILES.resumeMultipartUpload(key, uploadId).complete(parts);
export const abortMultipart = (env, key, uploadId) => env.FILES.resumeMultipartUpload(key, uploadId).abort();

export const headFile = (env, key) => env.FILES.head(key);
export const putJson = (env, key, value) => env.FILES.put(key, JSON.stringify(value), { httpMetadata: { contentType: "application/json" } });
export async function getJson(env, key) {
  const o = await env.FILES.get(key);
  return o ? { value: await o.json(), meta: o.customMetadata || {} } : null;
}

// Every key under a prefix (a job's write records, a job's stored files), a page of 1,000 per call.
export async function listKeys(env, prefix) {
  const keys = [];
  let cursor;
  do {
    const page = await env.FILES.list({ prefix, cursor, limit: 1000 });
    keys.push(...page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

// Removes many objects, 1,000 per call (R2's limit).
export async function deleteKeys(env, keys) {
  for (let i = 0; i < keys.length; i += 1000) await env.FILES.delete(keys.slice(i, i + 1000));
}
