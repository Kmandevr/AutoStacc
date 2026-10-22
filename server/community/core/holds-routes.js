// The API for held posts (core/holds.js): the visitor's own waiting posts, a space's waiting posts for its team, and
// the team's decision. Every decision is limited per moderator, logged, and clears the cached pages it changes.
import { json, readJson, fail, id, str } from "../../lib/http.js";
import { requireFeature } from "../../lib/features.js";
import { requireUser } from "../../auth/session.js";
import { limit } from "../../lib/ratelimit.js";
import { requireTeam } from "./access.js";
import { getSpace } from "./posting.js";
import { loadTarget, purgeTarget } from "./moderate.js";
import { listHolds, mineHolds, decideHold } from "./holds.js";

const NO_STORE = { "Cache-Control": "no-store" };

async function mine(app) {
  requireFeature(app, "community.forum");
  const user = await requireUser(app);
  return json({ held: await mineHolds(app.db, user.id) }, 200, NO_STORE);
}

async function queue(app, { spaceId }) {
  requireFeature(app, "community.forum");
  const user = await requireUser(app);
  const space = await getSpace(app.db, id(spaceId, "spaceId"));
  if (!space) fail(404, "not_found", "Not found.");
  await requireTeam(app, user, space);
  return json({ held: await listHolds(app.db, space.id) }, 200, NO_STORE);
}

async function decide(app) {
  requireFeature(app, "community.forum");
  const user = await requireUser(app);
  await limit(app, "community-mod", 60, 600, { by: user.id });
  const body = await readJson(app.request);
  const type = str(body.targetType, "targetType", { max: 10 });
  if (type !== "thread" && type !== "post") fail(400, "invalid_field", "Say whether it's a take or a reply.", { field: "targetType" });
  const targetId = id(body.targetId, "targetId");
  const outcome = str(body.outcome, "outcome", { max: 10 });
  if (outcome !== "approve" && outcome !== "reject") fail(400, "invalid_field", "Approve or reject.", { field: "outcome" });
  const target = await loadTarget(app.db, type, targetId);
  if (!target) fail(404, "not_found", "That isn't waiting for a decision.");
  await requireTeam(app, user, await getSpace(app.db, target.spaceId));
  const reason = body.reason === undefined || body.reason === null ? "" : str(body.reason, "reason", { max: 500 }).trim();
  if (outcome === "reject" && reason.length < 3) fail(400, "reason_required", "Say why, in a few words: the author is told.", { field: "reason" });
  await decideHold(app, type, targetId, outcome, { actorId: user.id, reason });
  await purgeTarget(app, target);
  return json({ ok: true });
}

export const holdRoutes = [
  ["GET", "/api/community/holds/mine", mine],
  ["GET", "/api/community/spaces/:spaceId/holds", queue],
  ["POST", "/api/community/holds/decide", decide]
];
