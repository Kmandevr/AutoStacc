// Limits for paid files (D1 product_files, private R2 FILES): what can be uploaded to a product. Today only the admin
// uploads; when creators upload their own products the same checks run, plus their storage quota. Extensions come from
// data/content-types.js's formats plus a few common ones; the content is never run or shown, only downloaded.
import { fail } from "../lib/http.js";

export const FILE_LIMITS = {
  fileBytes: 95 * 1024 * 1024, // Workers request bodies stop at 100 MB.
  filesPerProduct: 100
};

export const ALLOWED_EXTENSIONS = new Set([
  "mid", "midi", "wav", "aif", "aiff", "flac", "mp3", "ogg", "m4a",
  "fxp", "fxb", "vital", "vitalbank", "vitalpreset", "h2p", "nmsv", "adv", "adg", "serumpreset", "serumpack",
  "als", "alp", "flp", "logicx", "rpp", "ptx", "cpr", "song", "bwproject",
  "zip", "png", "jpg", "jpeg", "webp", "gif", "mp4", "mov", "webm", "pdf", "txt", "md"
]);

export const extensionOf = (filename) => (String(filename).match(/\.([a-z0-9]{1,12})$/i) || [])[1]?.toLowerCase() || "";

// Throws the right 4xx for a file that may not be added to a product with `existing` deliverable-or-pending files.
export function checkUpload({ filename, sizeBytes, existing }) {
  if (!sizeBytes) fail(411, "length_required", "Send the file with its size.");
  if (sizeBytes > FILE_LIMITS.fileBytes) fail(413, "too_large", "Files must be under 95 MB per upload.");
  if (!ALLOWED_EXTENSIONS.has(extensionOf(filename))) fail(415, "unsupported_file_type", "That kind of file can't be sold here yet. Zip it, or ask for its type to be added.");
  if (existing >= FILE_LIMITS.filesPerProduct) fail(409, "limit_reached", `A product can have up to ${FILE_LIMITS.filesPerProduct} files.`);
}
