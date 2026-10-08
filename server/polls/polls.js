// Generic polls (data/polls.js, synced by db/catalog.sql): reading a poll with its tally, and recording one vote per
// verified account. A poll is visible only if it is published and its project is published and uses "polls".
import { all, first, run, stmt, now, parseJson } from "../lib/db.js";
import { getVisibleProject, usesFeature } from "../projects/projects.js";

export async function getVisiblePoll(db, pollId) {
  const poll = await first(db, "SELECT * FROM polls WHERE id = ? AND published = 1 AND deleted_at IS NULL", pollId);
  if (!poll) return null;
  const project = await getVisibleProject(db, poll.project_id);
  return usesFeature(project, "polls") ? poll : null;
}

export const isOpen = (poll, at = now()) => (!poll.opens_at || poll.opens_at <= at) && (!poll.closes_at || at <= poll.closes_at);

export const options = (poll) => parseJson(poll.options, []);

// Counts per option (every option listed, zero included) and the total.
export async function tally(db, poll) {
  const rows = await all(db, "SELECT option_id, COUNT(*) AS n FROM poll_votes WHERE poll_id = ? GROUP BY option_id", poll.id);
  const counts = new Map(rows.map((r) => [r.option_id, r.n]));
  const list = options(poll).map((o) => ({ id: o.id, label: o.label, votes: counts.get(o.id) || 0 }));
  return { options: list, total: list.reduce((t, o) => t + o.votes, 0) };
}

export const myVote = async (db, pollId, userId) =>
  ((await first(db, "SELECT option_id FROM poll_votes WHERE poll_id = ? AND user_id = ?", pollId, userId)) || {}).option_id || null;

// Insert or change this account's vote.
export const castVote = (db, pollId, userId, optionId) =>
  run(db, `INSERT INTO poll_votes (poll_id, user_id, option_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (poll_id, user_id) DO UPDATE SET option_id = excluded.option_id, updated_at = excluded.updated_at`,
    pollId, userId, optionId, now(), now());

// Every vote this account cast (the data export), and removing them all (account deletion).
export const votesOfUser = (db, userId) =>
  all(db, "SELECT poll_id, option_id, created_at, updated_at FROM poll_votes WHERE user_id = ? ORDER BY created_at", userId);
export const removeVotesStmt = (db, userId) => stmt(db, "DELETE FROM poll_votes WHERE user_id = ?", userId);
