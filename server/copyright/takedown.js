// Taking down what an accepted notice names, and bringing it back (docs/copyright.md, step 3): each target through
// its owning module (targets.js), recorded in copyright_notice_targets with when it went and when it came back. Run
// after the notice's own batch: a removal or restore that fails is logged and retried by the daily sweep (sweep.js).
import { all, run, stmt, now } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { KINDS, MAX_TARGETS } from "./targets.js";

// The targets an admin named, checked: known kinds, things that exist, no more than 20.
export async function checkTargets(app, raw, creatorId = null) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_TARGETS) fail(400, "invalid_field", `Name up to ${MAX_TARGETS} things to take down.`, { field: "targets" });
  const out = [];
  for (const t of raw) {
    const kind = t && typeof t.kind === "string" && Object.hasOwn(KINDS, t.kind) ? t.kind : fail(400, "invalid_field", "Each target is a product_file, thread or post.", { field: "targets" });
    const id = t && typeof t.id === "string" && /^[a-z0-9_]{3,80}$/.test(t.id) ? t.id : fail(400, "invalid_field", "Each target needs its id.", { field: "targets" });
    const problem = await KINDS[kind].problem(app, id, creatorId);
    if (problem === "missing") fail(404, "no_target", `There's no ${kind} ${id}.`);
    if (problem === "not_up") fail(409, "target_not_up", `${kind} ${id} isn't up (already held, removed or not published), so there's nothing to take down.`);
    if (problem === "other_creator") fail(409, "target_other_creator", `${kind} ${id} isn't that creator space's.`);
    if (!out.some((o) => o.kind === kind && o.id === id)) out.push({ kind, id });
  }
  return out;
}

export const targetStmts = (db, noticeId, targets) => targets.map((t) =>
  stmt(db, "INSERT INTO copyright_notice_targets (notice_id, kind, target_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", noticeId, t.kind, t.id));

export async function takeDown(app, noticeId, reason) {
  const rows = await all(app.db, "SELECT kind, target_id FROM copyright_notice_targets WHERE notice_id = ? AND removed_at IS NULL", noticeId);
  for (const r of rows) {
    try {
      // Recorded only when this notice actually took it down, so restoring can never lift someone else's removal.
      if (!(await KINDS[r.kind].remove(app, r.target_id, reason))) continue;
      await run(app.db, "UPDATE copyright_notice_targets SET removed_at = ? WHERE notice_id = ? AND kind = ? AND target_id = ?", now(), noticeId, r.kind, r.target_id);
    } catch (e) { console.error("copyright takedown", noticeId, r.kind, r.target_id, e && e.message); }
  }
}

export async function restoreTargets(app, noticeId) {
  const rows = await all(app.db, "SELECT kind, target_id FROM copyright_notice_targets WHERE notice_id = ? AND removed_at IS NOT NULL AND restored_at IS NULL", noticeId);
  for (const r of rows) {
    try {
      await KINDS[r.kind].restore(app, r.target_id);
      await run(app.db, "UPDATE copyright_notice_targets SET restored_at = ? WHERE notice_id = ? AND kind = ? AND target_id = ?", now(), noticeId, r.kind, r.target_id);
    } catch (e) { console.error("copyright restore", noticeId, r.kind, r.target_id, e && e.message); }
  }
}

export const targetsOf = (db, noticeIds) => all(db, `SELECT notice_id, kind, target_id, removed_at, restored_at FROM copyright_notice_targets
  WHERE notice_id IN (SELECT value FROM json_each(?))`, JSON.stringify(noticeIds));
