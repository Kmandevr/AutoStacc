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
