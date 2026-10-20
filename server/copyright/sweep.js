// The copyright part of the daily sweep (server/maintenance/sweep.js; docs/copyright.md, step 3):
//   - counter-notices whose wait (11 US business days, business-days.js) passed without the claimant saying they went
//     to court bring back what their notice took down, and the notice's strikes end as countered; only once the
//     claimant was actually emailed the counter-notice, otherwise the admins are told and it waits
//   - takedowns and restores that failed earlier are tried again (security review), so nothing stays half-done
// Compare-and-set, so a sweep run twice restores once. Bounded per run.
import { all, stmt, now, guardStmt, isGuardFailure } from "../lib/db.js";
import { alertAdmins } from "../email/alerts.js";
import { endStrikesStmt } from "./strikes.js";
import { takeDown, restoreTargets } from "./takedown.js";

export async function copyrightSweep(app, { nowMs = Date.now() } = {}) {
  const t = new Date(nowMs).toISOString();
  const due = await all(app.db, "SELECT id, notice_id, claimant_told_at FROM copyright_counter_notices WHERE status = 'waiting' AND restore_after <= ? LIMIT 100", t);
  let restored = 0, untold = 0;
  for (const c of due) {
    if (!c.claimant_told_at) {
      untold++;
      await alertAdmins(app, { key: `copyright-counter-untold:${c.notice_id}`, title: "a counter-notice couldn't reach the claimant",
        lines: [`The counter-notice to notice ${c.notice_id} wasn't emailed to the claimant, so its content stays down. Send it to them (see the email log) and resend.`] }).catch(() => {});
      continue;
    }
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
  // Left half-done by an error: accepted notices with targets never taken down, and countered or withdrawn ones
  // with targets never brought back.
  const pendingDown = await all(app.db, `SELECT DISTINCT t.notice_id FROM copyright_notice_targets t JOIN copyright_notices n ON n.id = t.notice_id
    WHERE t.removed_at IS NULL AND n.status = 'accepted' AND NOT EXISTS (SELECT 1 FROM copyright_counter_notices c WHERE c.notice_id = n.id AND c.status = 'restored') LIMIT 50`);
  for (const r of pendingDown) await takeDown(app, r.notice_id, "a valid copyright notice");
  const pendingBack = await all(app.db, `SELECT DISTINCT t.notice_id FROM copyright_notice_targets t JOIN copyright_notices n ON n.id = t.notice_id
    WHERE t.removed_at IS NOT NULL AND t.restored_at IS NULL AND (n.status = 'withdrawn'
      OR EXISTS (SELECT 1 FROM copyright_counter_notices c WHERE c.notice_id = n.id AND c.status = 'restored')) LIMIT 50`);
  for (const r of pendingBack) await restoreTargets(app, r.notice_id);
  return { restored, untold, retried: pendingDown.length + pendingBack.length };
}
