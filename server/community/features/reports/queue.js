// A space team's report queue (docs/community-safety.md, "Reports, emergencies and false reports"): the open reports
// routed to the space, one entry per take or post, ranked by triage.js (danger first). Reporters stay anonymous to
// the team. The team decides each entry: upheld (it's removed under the space's rules) or dismissed (it stays, and
// comes back if the automatic rules had hidden it; dismissed reports lower the reporters' standing). Reports routed
// to AutoStacc are AutoStacc's to handle (the Control Center), never the team's.
import { json, readJson, fail, id, str } from "../../../lib/http.js";
import { all, first, stmt, now, guardStmt } from "../../../lib/db.js";
import { requireUser } from "../../../auth/session.js";
import { limit } from "../../../lib/ratelimit.js";
import { requireTeam } from "../../core/access.js";
import { getSpace } from "../../core/posting.js";
import { loadTarget, loadTargets, setState, canChange, logStmts, guarded } from "../../core/moderate.js";
import { priority } from "./triage.js";

const NO_STORE = { "Cache-Control": "no-store" };

async function teamFor(app, spaceId) {
  const user = await requireUser(app);
  await limit(app, "community-mod", 60, 600, { by: user.id });
  return { user, space: await requireTeam(app, user, await getSpace(app.db, spaceId)) };
}

const MAX_ITEMS = 60;

async function queue(app, { spaceId }) {
  const { space } = await teamFor(app, id(spaceId, "spaceId"));
  // Danger reports and then the oldest items, chosen in SQL, then ranked; everything about them in a few queries (never one per report).
  const targets = await all(app.db, `SELECT target_type AS type, target_id AS id, MIN(created_at) AS since FROM community_reports
    WHERE space_id = ? AND route = 'space' AND status = 'open' GROUP BY target_type, target_id
    ORDER BY MAX(reason = 'danger') DESC, since LIMIT ${MAX_ITEMS}`, space.id);
  const [rows, loaded] = await Promise.all([
    all(app.db, `SELECT target_type AS type, target_id AS id, reason, note FROM community_reports
      WHERE space_id = ? AND route = 'space' AND status = 'open' AND target_type || ':' || target_id IN (SELECT value FROM json_each(?)) LIMIT 1000`,
    space.id, JSON.stringify(targets.map((t) => `${t.type}:${t.id}`))),
    loadTargets(app.db, targets)
  ]);
  const items = [];
  for (const e of targets) {
    const t = loaded.get(`${e.type}:${e.id}`);
    if (!t) continue;
    const mine = rows.filter((r) => r.type === e.type && r.id === e.id);
    const reasons = mine.map((r) => r.reason), notes = mine.map((r) => r.note);
    items.push({ type: e.type, id: e.id, state: t.state, title: t.thread.title, excerpt: t.body.slice(0, 400), author: t.authorName,
      threadId: t.thread.id, reasons, notes: notes.slice(0, 5), since: e.since, danger: reasons.includes("danger"),
      priority: priority({ reasons, text: [t.body, ...notes].join("\n") }) });
  }
  items.sort((a, b) => (b.priority - a.priority) || a.since.localeCompare(b.since));
  return json({ reports: items.slice(0, 50) }, 200, NO_STORE);
}

async function resolve(app) {
  const body = await readJson(app.request);
  const type = str(body.targetType, "targetType", { max: 10 });
  const target = (type === "thread" || type === "post") && await loadTarget(app.db, type, id(body.targetId, "targetId"));
  if (!target) fail(404, "not_found", "Not found.");
  const { user } = await teamFor(app, target.spaceId);
  const upheld = body.outcome === "upheld";
  if (!upheld && body.outcome !== "dismissed") fail(400, "invalid_field", "Uphold or dismiss it.", { field: "outcome" });
  const reason = body.reason === undefined || body.reason === null ? "" : str(body.reason, "reason", { max: 500 }).trim();
  if (upheld && reason.length < 3) fail(400, "reason_required", "Say why, in a few words: the author is told.", { field: "reason" });
  const close = stmt(app.db, `UPDATE community_reports SET status = ?, handled_by = ?, handled_at = ?
    WHERE target_type = ? AND target_id = ? AND route = 'space' AND status = 'open'`, upheld ? "upheld" : "dismissed", user.id, now(), target.type, target.id);
  const action = upheld ? "report_upheld" : "report_dismissed";
  // Dismissing brings back only what the automatic rules hid; a moderator's own hide stays theirs to undo.
  const autoHidden = target.state === "hidden" && (await first(app.db, `SELECT action FROM community_mod_log WHERE target_type = ? AND target_id = ?
    AND action IN ('hide', 'remove', 'restore', 'auto_hide', 'appeal_granted', 'report_upheld', 'report_dismissed') ORDER BY at DESC LIMIT 1`, target.type, target.id) || {}).action === "auto_hide";
  const to = upheld ? "removed" : autoHidden ? "visible" : null;
  // Both ways, the batch holds only while the reports are still open, so two moderators can't decide them both ways.
  const stillOpen = guardStmt(app.db, `EXISTS (SELECT 1 FROM community_reports WHERE target_type = ? AND target_id = ? AND route = 'space' AND status = 'open')`, target.type, target.id);
  if (to && canChange(target, to)) {
    await setState(app, target, to, { action, actorId: user.id, reason, extra: [stillOpen, close] });
  } else {
    await guarded(app.db, [stillOpen, close, ...logStmts(app.db, { spaceId: target.spaceId, actorId: user.id, action, targetType: target.type, targetId: target.id, reason })]);
  }
  return json({ ok: true });
}

export const queueRoutes = [
  ["GET", "/api/community/spaces/:spaceId/reports", queue, { auditReads: true }],
  ["POST", "/api/community/reports/resolve", resolve]
];
