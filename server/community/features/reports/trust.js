// Whose reports count (owner, 2026-10-16; docs/community-safety.md): a trusted reporter is an account at least 7
// days old with fewer than 3 dismissed reports in the last 90 days. Only trusted reporters count toward hiding a post
// by themselves; anyone with 2 or more dismissed danger reports in 90 days loses the danger reason. Settings below.
import { first, all } from "../../../lib/db.js";

export const TRUST = { minAgeDays: 7, maxDismissed: 3, windowDays: 90, hideAt: 3, dangerAbuse: 2 };
const DAY = 86400000;
const since = (days) => new Date(Date.now() - days * DAY).toISOString();
// Better Auth's dates come back as ISO text or epoch milliseconds, depending on the driver.
const ms = (v) => (typeof v === "number" || /^\d+$/.test(String(v)) ? Number(v) : Date.parse(v));
const oldEnough = (createdAt) => Date.now() - ms(createdAt) >= TRUST.minAgeDays * DAY;

export async function canReportDanger(db, userId) {
  const r = await first(db, `SELECT COUNT(*) AS n FROM community_reports WHERE reporter_user_id = ? AND reason = 'danger'
    AND status = 'dismissed' AND handled_at > ?`, userId, since(TRUST.windowDays));
  return r.n < TRUST.dangerAbuse;
}

// How many different trusted people have open reports on a take or post, made after `after` (the last time a team
// brought it back, so one decision isn't undone by the reports it already weighed).
export async function trustedReporters(db, type, targetId, after) {
  const rows = await all(db, `SELECT u.createdAt AS createdAt,
      (SELECT COUNT(*) FROM community_reports d WHERE d.reporter_user_id = r.reporter_user_id AND d.status = 'dismissed' AND d.handled_at > ?) AS dismissed
    FROM community_reports r JOIN "user" u ON u.id = r.reporter_user_id
    WHERE r.target_type = ? AND r.target_id = ? AND r.status = 'open' AND r.created_at > ?
    GROUP BY r.reporter_user_id`, since(TRUST.windowDays), type, targetId, after || "");
  return rows.filter((r) => oldEnough(r.createdAt) && r.dismissed < TRUST.maxDismissed).length;
}
