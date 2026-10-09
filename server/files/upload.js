// Storing an uploaded paid file: the type comes from the file's name (never the uploader), and what was written must
// really look like that kind of file (server/files/policy.js), else it is deleted and refused. Shared by the admin's
// uploads (server/admin/files.js) and creators' (server/studio/product-files.js).
import { fail } from "../lib/http.js";
import { putFile, peekFile, deleteFile } from "../storage/buckets.js";
import { contentTypeFor, looksLike } from "./policy.js";

export async function putVerifiedFile(app, key, filename, body) {
  const contentType = contentTypeFor(filename);
  const object = await putFile(app.env, key, body, contentType);
  if (!looksLike(filename, await peekFile(app.env, key))) {
    await deleteFile(app.env, key);
    fail(415, "content_mismatch", "That file isn't really the kind its name says. Check it opens, then upload it again.");
  }
  return { object, contentType };
}
