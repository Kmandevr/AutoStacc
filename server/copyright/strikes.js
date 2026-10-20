// Giving and ending copyright strikes (docs/decisions.md 2026-10-20, owner): when a notice is accepted, the account
// that uploaded the thing gets a whole strike, and the creator space it was uploaded for gets half a strike, or a
// whole one when its owner uploaded it or nobody else can be named. Strikes last 12 months unless a counter-notice
// succeeds or an admin withdraws one (both end it early). Statements only: notices.js runs them in its own batch.
import { stmt, now, newId } from "../lib/db.js";
import { STRIKE_DAYS, UNITS } from "./standing.js";

const strikeStmt = (db, noticeId, subject, subjectId, units, at) => stmt(db, `INSERT INTO copyright_strikes (id, notice_id, subject, subject_id, units, created_at, expires_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)`, newId("cps"), noticeId, subject, subjectId, units, at, new Date(Date.parse(at) + STRIKE_DAYS * 86400000).toISOString());

// uploaderId: the account that uploaded it, or null if unknown; creatorId: the space it was for, or null (a community
// post outside any creator); ownerUploaded: whether the uploader owns that space.
export function strikeStmts(db, { noticeId, uploaderId, creatorId, ownerUploaded }) {
  const at = now();
  return [
    ...(uploaderId ? [strikeStmt(db, noticeId, "account", uploaderId, UNITS.whole, at)] : []),
    ...(creatorId ? [strikeStmt(db, noticeId, "creator", creatorId, uploaderId && !ownerUploaded ? UNITS.half : UNITS.whole, at)] : [])
  ];
}

// Ends a notice's strikes early: countered (a counter-notice the claimant didn't answer in court) or withdrawn.
export const endStrikesStmt = (db, noticeId, state, by, note) => stmt(db, `UPDATE copyright_strikes SET state = ?, ended_by = ?, ended_at = ?, ended_note = ?
  WHERE notice_id = ? AND state = 'active'`, state, by, now(), note, noticeId);
