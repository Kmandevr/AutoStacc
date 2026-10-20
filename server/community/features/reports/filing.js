// Reporting a take or post (docs/community.md, "Who enforces what"; docs/community-safety.md): by any member with a
// community name, never your own, with a reason and a short note (a written reason filters out the reports people
// make "for dumb things"). The reason decides who handles it: the space's team for its rules, harassment, danger and
// spam; AutoStacc for illegal content, copyright, impersonation and underage accounts. One open report per person
// per item. When 3 different trusted reporters have open reports on something, it's hidden until the team decides
// (never a team member's own post; those wait in the queue). Someone banned from the space can't report in it.
// 20 reports an hour per person.
import { json, readJson, fail, id, str } from "../../../lib/http.js";
import { first, run, now, newId } from "../../../lib/db.js";
import { requireUser } from "../../../auth/session.js";
import { limit } from "../../../lib/ratelimit.js";
import { getMember } from "../../core/members.js";
import { getSpace } from "../../core/posting.js";
import { isTeamMember } from "../../core/access.js";
import { loadTarget, setState } from "../../core/moderate.js";
import { canReportDanger, trustedReporters, TRUST } from "./trust.js";

export const ROUTE = { rules: "space", harassment: "space", danger: "space", spam: "space",
  illegal: "autostacc", copyright: "autostacc", impersonation: "autostacc", underage: "autostacc" };
// What a team (or the system) did last that brought an item back; reports before it were already weighed.
export const LAST_RETURN = `SELECT MAX(at) AS at FROM community_mod_log WHERE target_type = ? AND target_id = ?
  AND action IN ('restore', 'appeal_granted', 'report_dismissed')`;

async function reportable(db, type, targetId) {
  let target = (type === "thread" || type === "post") && await loadTarget(db, type, targetId);
  // Reporting a take's opening post reports the take.
  if (target && type === "post" && target.opening) target = await loadTarget(db, "thread", target.thread.id);
  if (!target || target.state === "removed" || target.thread.state === "removed") fail(404, "not_found", "That doesn't exist.");
  return target;
}

async function autoHide(app, target) {
  if (target.state !== "visible") return;
  const after = (await first(app.db, LAST_RETURN, target.type, target.id)).at;
  if (await trustedReporters(app.db, target.type, target.id, after) < TRUST.hideAt) return;
  if (await isTeamMember(app, target.authorId, await getSpace(app.db, target.spaceId))) return;
  try {
    await setState(app, target, "hidden", { action: "auto_hide", automatic: true, reason: "Reported by several members; hidden until the team decides." });
  } catch (e) {
    if (!(e && e.status === 409)) throw e; // someone acted on it at the same moment
  }
}

async function report(app) {
  const user = await requireUser(app);
  await limit(app, "community-report", 20, 3600, { by: user.id });
  if (!(await getMember(app.db, user.id))) fail(403, "not_a_member", "Pick your community name and confirm you're 16 or older first.");
  const suspended = await first(app.db, "SELECT until FROM community_suspensions WHERE user_id = ?", user.id);
  if (suspended && (!suspended.until || Date.parse(suspended.until) > Date.now())) fail(403, "suspended", "Your account can't act in the community right now.");
  const body = await readJson(app.request);
  const reason = str(body.reason, "reason", { max: 20 });
  if (!Object.hasOwn(ROUTE, reason)) fail(400, "invalid_field", "Pick a reason.", { field: "reason" });
  const target = await reportable(app.db, str(body.targetType, "targetType", { max: 10 }), id(body.targetId, "targetId"));
  if (target.authorId === user.id) fail(400, "own_post", "That's your own post: edit or delete it instead.");
  const ban = await first(app.db, "SELECT until FROM community_space_bans WHERE space_id = ? AND user_id = ?", target.spaceId, user.id);
  if (ban && (!ban.until || Date.parse(ban.until) > Date.now())) fail(403, "banned", "You can't report in this space. AutoStacc's reasons (illegal content, copyright) go through support.");
  const note = str(body.note, "note", { max: 1000 }).trim();
  if (note.length < 10) fail(400, "note_required", "Say what's wrong, in a sentence: it helps the team decide.", { field: "note" });
  if (reason === "danger" && !(await canReportDanger(app.db, user.id))) fail(403, "danger_unavailable", "Your recent danger reports weren't upheld, so this reason isn't available to you for now. Pick another reason.");
  // One open report per person and item, kept by a unique index (0035), so reports sent at once can't double up.
  const r = await run(app.db, `INSERT INTO community_reports (id, target_type, target_id, space_id, reporter_user_id, reason, note, route, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`, newId("rpt"), target.type, target.id, target.spaceId, user.id, reason, note, ROUTE[reason], now());
  if (!r.meta.changes) return json({ ok: true, duplicate: true });
  await autoHide(app, target);
  return json({ ok: true, route: ROUTE[reason] }, 201);
}

export const filingRoutes = [["POST", "/api/community/reports", report]];
