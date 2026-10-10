// The admin's side of the automated review (docs/packs.md, review.js): the queue of versions it held, and rejecting one
// with a note the creator sees (approving is publishing, routes.js). Admin only (404 to everyone else); audited.
//   GET  /api/admin/packs/review                      versions held by the automated review, oldest first
//   POST /api/admin/packs/versions/:versionId/reject  {note} (a held or ready version: it fails, its Pac is free again
//                                                     and its archive is deleted)
import { json, fail, readJson } from "../lib/http.js";
import { all, stmt, now, parseJson, guardStmt, isGuardFailure } from "../lib/db.js";
import { audit } from "../audit/log.js";
import { releaseDraftStmt } from "./versions.js";
import { dropArchives } from "./uploads.js";
import { ADMIN } from "./access.js";
import { versionView } from "./view.js";

export const routes = [
  ["GET", "/api/admin/packs/review", async (app) => {
    await ADMIN.actor(app);
    const held = await all(app.db, `SELECT v.id, v.number, v.stats, v.updated_at, v.product_id, p.title AS pac_title, c.name AS creator_name, c.slug AS creator_slug
      FROM pac_versions v JOIN pacs p ON p.id = v.pac_id LEFT JOIN projects j ON j.id = p.project_id LEFT JOIN creators c ON c.id = j.creator_id
      WHERE v.status = 'in_review' ORDER BY v.updated_at LIMIT 200`);
    return json({ versions: held.map((v) => ({ id: v.id, number: v.number, pac: v.pac_title, productId: v.product_id, creator: v.creator_name ? { name: v.creator_name, slug: v.creator_slug } : null,
      flags: (parseJson(v.stats, {}).review || { flags: [] }).flags, files: parseJson(v.stats, {}).files || 0, since: v.updated_at })) });
  }],
  ["POST", "/api/admin/packs/versions/:versionId/reject", async (app, { versionId }) => {
    const actor = await ADMIN.actor(app);
    const v = await ADMIN.version(app, actor, versionId);
    const body = await readJson(app.request);
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : "Not accepted by AutoStacc's review.";
    // One batch: the version fails and its Pac is free again, or neither.
    try {
      await app.db.batch([
        guardStmt(app.db, "EXISTS (SELECT 1 FROM pac_versions WHERE id = ? AND status IN ('in_review', 'ready'))", v.id),
        stmt(app.db, "UPDATE pac_versions SET status = 'failed', review_note = ?, reviewed_by = ?, updated_at = ? WHERE id = ?", note, actor.user.id, now(), v.id),
        releaseDraftStmt(app.db, v.pac_id, v.id)
      ]);
    } catch (e) {
      if (isGuardFailure(e)) fail(409, "cannot_reject", "Only a version waiting for review (or ready) can be rejected.");
      throw e;
    }
    await dropArchives(app, v.id);
    await audit(app, "pack.version_rejected", { targetType: "pac", targetId: v.pac_id, detail: { versionId: v.id } });
    return json({ version: await versionView(app.db, v.id) });
  }]
];
