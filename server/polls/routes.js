// Poll API, usable by any project that turns polls on: read a poll with its tally (and your vote), and vote.
// Hidden, draft and unknown polls, and polls of projects that don't use polls, all answer 404.
import { json, fail, readJson, id } from "../lib/http.js";
import { currentUser, requireUser } from "../auth/session.js";
import { limit } from "../lib/ratelimit.js";
import { getVisiblePoll, isOpen, options, tally, myVote, castVote } from "./polls.js";

async function visible(app, pollId) {
  const poll = await getVisiblePoll(app.db, id(pollId, "pollId"));
  if (!poll) fail(404, "not_found", "No poll with that id.");
  return poll;
}

async function read(app, { pollId }) {
  const poll = await visible(app, pollId);
  const [user, counts] = await Promise.all([currentUser(app), tally(app.db, poll)]);
  const signedIn = Boolean(user && user.emailVerified);
  const mine = signedIn ? await myVote(app.db, poll.id, user.id) : null;
  return json({ signedIn, id: poll.id, projectId: poll.project_id, question: poll.question, open: isOpen(poll), opensAt: poll.opens_at, closesAt: poll.closes_at, ...counts, myVote: mine });
}

async function vote(app, { pollId }) {
  const user = await requireUser(app);
  await limit(app, "vote", 20, 60);
  const poll = await visible(app, pollId);
  const body = await readJson(app.request);
  const optionId = id(body.optionId, "optionId");
  if (!options(poll).some((o) => o.id === optionId)) fail(400, "invalid_option", "That isn't one of the options.");
  if (!isOpen(poll)) fail(409, "poll_closed", "This poll isn't open.");
  await castVote(app.db, poll.id, user.id, optionId);
  return json({ ok: true, myVote: optionId, ...(await tally(app.db, poll)) });
}

export const routes = [
  ["GET", "/api/polls/:pollId", read],
  ["POST", "/api/polls/:pollId/vote", vote]
];
