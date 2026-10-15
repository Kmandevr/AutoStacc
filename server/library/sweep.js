// Files of deleted community library pieces that other creators' sites still used when the piece went (released, no
// longer their creator's to count: library/routes.js). The daily sweep deletes each once no site document, scheduled
// copy or kept version anywhere names it. Bounded per run.
import { all, first } from "../lib/db.js";
import { purge } from "../sites/images.js";

export async function sweepReleased(app, { max = 200 } = {}) {
  const rows = await all(app.db, "SELECT id, r2_key FROM site_assets WHERE status = 'active' AND released_at IS NOT NULL LIMIT ?", max);
  let purged = 0;
  for (const r of rows) {
    const like = `%${r.id}%`;
    const used = await first(app.db, `SELECT
      EXISTS (SELECT 1 FROM project_sites WHERE draft LIKE ?1 OR published LIKE ?1 OR scheduled_draft LIKE ?1)
      OR EXISTS (SELECT 1 FROM creator_sites WHERE draft LIKE ?1 OR published LIKE ?1 OR scheduled_draft LIKE ?1)
      OR EXISTS (SELECT 1 FROM site_versions WHERE doc LIKE ?1)
      OR EXISTS (SELECT 1 FROM library_pieces WHERE status = 'active' AND assets LIKE ?1) AS used`, like);
    if (used && used.used) continue;
    await purge(app, r.id, r.r2_key);
    purged++;
  }
  return { releasedFilesPurged: purged };
}
