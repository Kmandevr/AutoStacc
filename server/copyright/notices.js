// Copyright notices (docs/community-safety.md, "Copyright: tiered strikes"): an admin records a notice that came to
// the support address (the public form is the next step) and then accepts it, naming the creator space and, when
// known, the account that uploaded the thing, which gives the strikes (strikes.js); or rejects it. Withdrawing an
// accepted notice (the claimant took it back, or it was a mistake) ends its strikes. Removing the content itself is
// done with each area's own tools for now (product files, the community queue). Compare-and-set on status.
import { first, all, stmt, now, newId, guardStmt, isGuardFailure } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { roleOf, getCreator } from "../creators/creators.js";
import { strikeStmts, endStrikesStmt } from "./strikes.js";

export async function recordNotice(db, admin, { claimantName, claimantEmail, claimantAddress, work, location, statementsAt }) {
  const id = newId("cpn");
  await db.prepare(`INSERT INTO copyright_notices (id, source, claimant_name, claimant_email, claimant_address, work, location, statements_at, created_by, created_at)
    VALUES (?, 'email', ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, claimantName, claimantEmail, claimantAddress, work, location, statementsAt, admin.id, now()).run();
  return id;
}

async function batchIf(db, condition, params, stmts) {
  try { await db.batch([guardStmt(db, condition, ...params), ...stmts]); } catch (e) {
    if (isGuardFailure(e)) fail(409, "changed", "That notice was just decided. Reload and try again.");
    throw e;
  }
}

export async function acceptNotice(db, admin, noticeId, { creatorId, uploaderId, note }) {
  if (!creatorId && !uploaderId) fail(400, "invalid_field", "Name the creator space, the uploader, or both.", { field: "creatorId" });
  const creator = creatorId ? await getCreator(db, creatorId) : null;
  if (creatorId && !creator) fail(404, "no_creator", "No creator space with that id.");
  if (uploaderId && !(await first(db, 'SELECT id FROM "user" WHERE id = ?', uploaderId))) fail(404, "no_account", "No account with that id.");
  // The uploader may have left the team since; "the owner uploaded it" is the space's founder or its owner now, so
  // leaving or handing over the space before the decision doesn't change the weight (security review).
  const ownerUploaded = Boolean(creator && uploaderId && (creator.created_by === uploaderId || (await roleOf(db, creatorId, uploaderId)) === "owner"));
  await batchIf(db, "EXISTS (SELECT 1 FROM copyright_notices WHERE id = ? AND status = 'received')", [noticeId], [
    stmt(db, `UPDATE copyright_notices SET status = 'accepted', creator_id = ?, uploader_user_id = ?, decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?`,
      creatorId || null, uploaderId || null, admin.id, now(), note, noticeId),
    ...strikeStmts(db, { noticeId, uploaderId: uploaderId || null, creatorId: creatorId || null, ownerUploaded })
  ]);
}

export const rejectNotice = (db, admin, noticeId, note) => batchIf(db, "EXISTS (SELECT 1 FROM copyright_notices WHERE id = ? AND status = 'received')", [noticeId], [
  stmt(db, "UPDATE copyright_notices SET status = 'rejected', decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?", admin.id, now(), note, noticeId)
]);

export const withdrawNotice = (db, admin, noticeId, note) => batchIf(db, "EXISTS (SELECT 1 FROM copyright_notices WHERE id = ? AND status = 'accepted')", [noticeId], [
  stmt(db, "UPDATE copyright_notices SET status = 'withdrawn', withdrawn_by = ?, withdrawn_at = ?, decision_note = ? WHERE id = ?", admin.id, now(), note, noticeId),
  endStrikesStmt(db, noticeId, "withdrawn", admin.id, note)
]);

// For the Control Center: the latest notices with their strikes.
export async function latestNotices(db) {
  const notices = await all(db, `SELECT n.*, c.name AS creator_name, u.email AS uploader_email FROM copyright_notices n
    LEFT JOIN creators c ON c.id = n.creator_id LEFT JOIN "user" u ON u.id = n.uploader_user_id ORDER BY n.created_at DESC LIMIT 100`);
  const strikes = await all(db, `SELECT notice_id, subject, subject_id, units, state, expires_at FROM copyright_strikes
    WHERE notice_id IN (SELECT value FROM json_each(?))`, JSON.stringify(notices.map((n) => n.id)));
  return notices.map((n) => ({ ...n, strikes: strikes.filter((s) => s.notice_id === n.id) }));
}
