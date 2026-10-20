// Spaces nobody looks after (docs/community.md, "Inactive teams"; issue #137): in the daily sweep, a space whose team
// hasn't acted for 40 days, or whose reports have waited 40 days, turns read-only by itself (people can still read,
// not post), the change is in the team's log, and the founder (or a project's owners) is emailed once. A team member
// reopens it from the space's Team desk once no report has waited 40 days. AutoStacc's own space is AutoStacc's to
// run and never turns read-only this way. Its own switch (community.upkeep): off, no space changes by itself.
import { json, fail, id } from "../../../lib/http.js";
import { all, first, stmt, guardStmt } from "../../../lib/db.js";
import { requireUser } from "../../../auth/session.js";
import { limit } from "../../../lib/ratelimit.js";
import { sendEmail } from "../../../email/index.js";
import { requireTeam } from "../../core/access.js";
import { getSpace } from "../../core/posting.js";
import { logStmts, guarded } from "../../core/moderate.js";
import { purge } from "../../core/purge.js";
import { spacePath } from "../../core/render-parts.js";

export const INACTIVE_DAYS = 40;
const REASON = "inactive_team";
const PER_RUN = 100;
const ago = (nowMs, days) => new Date(nowMs - days * 86400000).toISOString();
const STALE_REPORT = `EXISTS (SELECT 1 FROM community_reports r WHERE r.space_id = s.id AND r.route = 'space' AND r.status = 'open' AND r.created_at < ?1)`;

// Who hears that a space went read-only: its founder, or for a project's space the creator's owners.
async function keepers(db, space) {
  if (space.kind === "project") {
    return all(db, `SELECT u.id, u.email FROM projects p JOIN creator_members m ON m.creator_id = p.creator_id AND m.role = 'owner'
      JOIN "user" u ON u.id = m.user_id WHERE p.id = ?`, space.project_id);
  }
  return space.founder_user_id ? all(db, 'SELECT id, email FROM "user" WHERE id = ?', space.founder_user_id) : [];
}

async function sweep(app, { nowMs = Date.now() } = {}) {
  const cutoff = ago(nowMs, INACTIVE_DAYS);
  const spaces = await all(app.db, `SELECT s.* FROM community_spaces s WHERE s.kind <> 'platform' AND s.state = 'open'
    AND (s.last_team_activity_at < ?1 OR ${STALE_REPORT}) LIMIT ${PER_RUN}`, cutoff);
  let readOnly = 0;
  for (const space of spaces) {
    try {
      await guarded(app.db, [
        guardStmt(app.db, "EXISTS (SELECT 1 FROM community_spaces WHERE id = ? AND state = 'open')", space.id),
        stmt(app.db, "UPDATE community_spaces SET state = 'read_only', state_reason = ? WHERE id = ?", REASON, space.id),
        ...logStmts(app.db, { spaceId: space.id, action: "read_only", targetType: "space", targetId: space.id, reason: `No team activity or reports handled in ${INACTIVE_DAYS} days.`, automatic: true })
      ]);
    } catch (e) {
      if (e && e.status === 409) continue;
      throw e;
    }
    readOnly++;
    purge(app, { space });
    const url = app.config.siteUrl + spacePath(space);
    // One mail each; a failure is logged (sendEmail records it for a resend) and never stops the others.
    for (const k of await keepers(app.db, space)) {
      try {
        await sendEmail(app, "community-read-only", k.email, { space: space.name, url }, { dedupeKey: `community-read-only:${space.id}:${cutoff.slice(0, 10)}:${k.id}` });
      } catch (e) { console.error("community read-only email", e && e.message); }
    }
  }
  return { readOnly };
}

async function reopen(app, { spaceId }) {
  const user = await requireUser(app);
  await limit(app, "community-mod", 60, 600, { by: user.id });
  const space = await requireTeam(app, user, await getSpace(app.db, id(spaceId, "spaceId")));
  if (space.state !== "read_only" || space.state_reason !== REASON) fail(409, "not_inactive", "This space isn't read-only for inactivity.");
  const waiting = await first(app.db, `SELECT COUNT(*) AS n FROM community_reports s WHERE s.space_id = ? AND s.route = 'space' AND s.status = 'open' AND s.created_at < ?`,
    space.id, ago(Date.now(), INACTIVE_DAYS));
  if (waiting.n) fail(409, "reports_waiting", `Handle the ${waiting.n} report${waiting.n === 1 ? "" : "s"} that have waited longest first, then reopen.`, { waiting: waiting.n });
  await guarded(app.db, [
    guardStmt(app.db, "EXISTS (SELECT 1 FROM community_spaces WHERE id = ? AND state = 'read_only' AND state_reason = ?)", space.id, REASON),
    stmt(app.db, "UPDATE community_spaces SET state = 'open', state_reason = NULL WHERE id = ?", space.id),
    ...logStmts(app.db, { spaceId: space.id, actorId: user.id, action: "reopen", targetType: "space", targetId: space.id })
  ]);
  purge(app, { space });
  return json({ ok: true });
}

export default {
  name: "upkeep",
  switch: "community.upkeep",
  routes: [["POST", "/api/community/spaces/:spaceId/reopen", reopen]],
  sweep
};
