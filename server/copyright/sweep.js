// The copyright part of the daily sweep (server/maintenance/sweep.js; docs/copyright.md, step 3): counter-notices whose
// wait (counter.js WAIT_DAYS) passed without the claimant saying they went to court bring back what their notice took down, and that
// notice's strikes end as countered. Compare-and-set, so a sweep run twice restores once. Bounded per run.
import { all, stmt, now, guardStmt, isGuardFailure } from "../lib/db.js";
import { endStrikesStmt } from "./strikes.js";
import { restoreTargets } from "./takedown.js";

export async function copyrightSweep(app, { nowMs = Date.now() } = {}) {
  const due = await all(app.db, "SELECT id, notice_id FROM copyright_counter_notices WHERE status = 'waiting' AND restore_after <= ? LIMIT 100", new Date(nowMs).toISOString());
  let restored = 0;
  for (const c of due) {
    try {
      await app.db.batch([
        guardStmt(app.db, "EXISTS (SELECT 1 FROM copyright_counter_notices WHERE id = ? AND status = 'waiting')", c.id),
        stmt(app.db, "UPDATE copyright_counter_notices SET status = 'restored', decided_at = ? WHERE id = ?", now(), c.id),
        endStrikesStmt(app.db, c.notice_id, "countered", null, "Counter-notice not answered in court")
      ]);
    } catch (e) {
      if (isGuardFailure(e)) continue;
      throw e;
    }
    await restoreTargets(app, c.notice_id);
    restored++;
  }
  return { restored };
}
