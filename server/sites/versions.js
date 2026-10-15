// A site's history (docs/builder.md): the last LIMITS.versionsPerSite publishes (sites/publish.js keeps them). Restoring
// copies a version into the draft, checked again like anything saved; nothing goes live until it is published.
import { all, first, run, now, parseJson } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { cleanDocument } from "./document.js";

export const listVersions = (db, target) => all(db,
  "SELECT version, published_at, published_by FROM site_versions WHERE kind = ? AND site_id = ? ORDER BY version DESC", target.kind, target.id);

export async function restoreVersion(db, target, version) {
  const row = await first(db, "SELECT doc FROM site_versions WHERE kind = ? AND site_id = ? AND version = ?", target.kind, target.id, version);
  if (!row) fail(404, "not_found", "That version isn't kept anymore.");
  const { doc } = cleanDocument(parseJson(row.doc, {}));
  const t = now();
  await run(db, `UPDATE ${target.table} SET draft = ?, draft_updated_at = ? WHERE ${target.key} = ?`, JSON.stringify(doc), t, target.id);
  return { document: doc, savedAt: t };
}
