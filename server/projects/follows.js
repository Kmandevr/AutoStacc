// Follows: which projects a verified account follows, and whether Auto-Stacc (automatic free grants) is on.
import { all, run, stmt, now } from "../lib/db.js";
import { VISIBLE } from "./projects.js";

export const listFollows = (db, userId) =>
  all(db, "SELECT project_id, auto_stacc, created_at FROM follows WHERE user_id = ? ORDER BY created_at", userId);

export const setFollow = (db, userId, projectId, autoStacc) =>
  run(db, `INSERT INTO follows (user_id, project_id, auto_stacc, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (user_id, project_id) DO UPDATE SET auto_stacc = excluded.auto_stacc, updated_at = excluded.updated_at`,
    userId, projectId, autoStacc ? 1 : 0, now(), now());

export const removeFollow = (db, userId, projectId) => run(db, "DELETE FROM follows WHERE user_id = ? AND project_id = ?", userId, projectId);

// Projects whose free content this account wants added automatically (visible projects only: published, and a Studio
// project's creator active).
export async function autoStaccProjectIds(db, userId) {
  const rows = await all(db, `SELECT f.project_id FROM follows f JOIN projects p ON p.id = f.project_id LEFT JOIN creators c ON c.id = p.creator_id
    WHERE f.user_id = ? AND f.auto_stacc = 1 AND ${VISIBLE}`, userId);
  return rows.map((r) => r.project_id);
}

export const publicFollow = (f) => ({ projectId: f.project_id, autoStacc: Boolean(f.auto_stacc), since: f.created_at });

// Account deletion: every follow goes.
export const removeAllFollowsStmt = (db, userId) => stmt(db, "DELETE FROM follows WHERE user_id = ?", userId);
