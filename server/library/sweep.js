// Files of deleted community library pieces that other creators' sites still used when the piece went (released, no
// longer their creator's to count: library/routes.js). The daily sweep deletes each once no site document, scheduled
// copy or kept version of a creator who installed the piece names it. Bounded per run.
import { all, first } from "../lib/db.js";
import { purge } from "../sites/images.js";

export async function sweepReleased(app, { max = 200 } = {}) {
  const rows = await all(app.db, "SELECT id, r2_key FROM site_assets WHERE status = 'active' AND released_at IS NOT NULL LIMIT ?", max);
  let purged = 0;
  for (const r of rows) {
    const like = `%${r.id}%`;
    // Only sites of creators who installed a piece with this file count: anyone can paste a public file's address
    // into their own draft, and that mustn't keep it (and its creator's storage) forever.
    const installers = `SELECT i.creator_id FROM library_installs i JOIN library_pieces p ON p.id = i.piece_id
      WHERE p.assets LIKE ?1 AND p.status IN ('active', 'deleted') AND i.creator_id <> p.creator_id`;
    const used = await first(app.db, `SELECT
      EXISTS (SELECT 1 FROM project_sites s JOIN projects j ON j.id = s.project_id
        WHERE j.creator_id IN (${installers}) AND (s.draft LIKE ?1 OR s.published LIKE ?1 OR s.scheduled_draft LIKE ?1))
      OR EXISTS (SELECT 1 FROM creator_sites WHERE creator_id IN (${installers}) AND (draft LIKE ?1 OR published LIKE ?1 OR scheduled_draft LIKE ?1))
      OR EXISTS (SELECT 1 FROM site_versions v WHERE v.doc LIKE ?1 AND ((v.kind = 'profile' AND v.site_id IN (${installers}))
        OR (v.kind = 'project' AND v.site_id IN (SELECT id FROM projects WHERE creator_id IN (${installers})))))
      OR EXISTS (SELECT 1 FROM library_pieces WHERE status = 'active' AND assets LIKE ?1) AS used`, like);
    if (used && used.used) continue;
    await purge(app, r.id, r.r2_key);
    purged++;
  }
  return { releasedFilesPurged: purged };
}
