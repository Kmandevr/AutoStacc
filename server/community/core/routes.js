// The community core's API (docs/community.md), 404 while the community.forum switch is off; features add their own
// routes through hooks.js (featureRoutes). Reads for the page's buttons are per visitor and never cached; every write
// needs a signed-in account with a confirmed email (requireUser), is refused during a support impersonation (the policy
// refuses writes that don't opt in), counts against a per-client request limit, passes the features' checks (posting
// pace, link rules...) and clears the cached pages it changes.
import { json, readJson, id, str, fail } from "../../lib/http.js";
import { requireFeature } from "../../lib/features.js";
import { currentUser, requireUser } from "../../auth/session.js";
import { limit } from "../../lib/ratelimit.js";
import { getMember, join, rename } from "./members.js";
import { nameProblem, cleanName } from "./names.js";
import { startThread, reply, getSpace } from "./posting.js";
import { teamRoleOf, mayPublishUpdate } from "./access.js";
import { editPost, deletePost } from "./edits.js";
import { mine } from "./mine.js";
import { purge } from "./purge.js";
import { threadPath, spacePath } from "./render-parts.js";
import { listSpaces } from "./spaces.js";
import { identitiesOf } from "./identities.js";
import { featureRoutes, state, featuresOn } from "./hooks.js";
import { holdRoutes } from "./holds-routes.js";

const NO_STORE = { "Cache-Control": "no-store" };

async function writer(app) {
  requireFeature(app, "community.forum");
  const user = await requireUser(app);
  await limit(app, "community-write", 60, 600);
  return user;
}

async function me(app) {
  requireFeature(app, "community.forum");
  const user = await currentUser(app);
  const features = featuresOn(app);
  if (!user) return json({ signedIn: false, features }, 200, NO_STORE);
  const member = await getMember(app.db, user.id);
  return json({ signedIn: true, emailVerified: Boolean(user.emailVerified), member: member && { displayName: member.displayName }, features,
    identities: await identitiesOf(app, user) }, 200, NO_STORE);
}

async function setMe(app) {
  requireFeature(app, "community.forum");
  const user = await requireUser(app);
  await limit(app, "community-join", 10, 3600);
  const body = await readJson(app.request);
  const member = await join(app.db, user.id, { displayName: str(body.displayName, "displayName", { max: 60 }), ageConfirmed: body.ageConfirmed });
  return json({ member: { displayName: member.displayName } }, 201);
}

// A new username: a few changes a month, so a name can't be swapped to dodge reports or to chase someone else's.
async function renameMe(app) {
  requireFeature(app, "community.forum");
  const user = await requireUser(app);
  const body = await readJson(app.request);
  const displayName = str(body.displayName, "displayName", { max: 60 });
  await limit(app, "community-rename", 5, 30 * 86400, { by: user.id });
  const member = await rename(app.db, user.id, displayName);
  return json({ member: { displayName: member.displayName } });
}

// Whether a username may be chosen (for the sign-up form and Settings): { ok } or { ok: false, code, message }.
async function checkName(app) {
  requireFeature(app, "community.forum");
  await limit(app, "community-namecheck", 60, 600);
  const user = await currentUser(app);
  const name = cleanName(new URL(app.request.url).searchParams.get("name")).slice(0, 60);
  const problem = await nameProblem(app.db, name, user ? user.id : "");
  return json(problem ? { ok: false, ...problem } : { ok: true }, 200, NO_STORE);
}

// Who a post goes out as: as = "space" or an identity id (core/identities.js); asTeam: true is the older "space".
const postingAs = (body) => (typeof body.as === "string" && body.as ? str(body.as, "as", { max: 120 }) : body.asTeam === true ? "space" : null);

async function newThread(app) {
  const user = await writer(app);
  const body = await readJson(app.request, 24 * 1024);
  const r = await startThread(app, user, { channelId: id(body.channelId, "channelId"), type: str(body.type, "type", { max: 20 }),
    title: str(body.title, "title", { max: 400 }), body: str(body.body, "body", { max: 20000 }), as: postingAs(body) });
  purge(app, r);
  return json({ thread: { id: r.thread.id, path: threadPath(r.thread) }, ...(r.held && { held: true }) }, 201);
}

async function newReply(app, { threadId }) {
  const user = await writer(app);
  const body = await readJson(app.request, 24 * 1024);
  const parentId = body.parentId === undefined || body.parentId === null ? null : id(body.parentId, "parentId");
  const r = await reply(app, user, id(threadId, "threadId"), { body: str(body.body, "body", { max: 20000 }), parentId, as: postingAs(body) });
  purge(app, r);
  return json({ post: { id: r.id, path: `${threadPath(r.thread)}#${r.id}` }, ...(r.held && { held: true }) }, 201);
}

async function edit(app, { postId }) {
  const user = await writer(app);
  const body = await readJson(app.request, 24 * 1024);
  const post = await editPost(app, user, id(postId, "postId"), { body: str(body.body, "body", { max: 20000 }) });
  purge(app, { thread: { id: post.thread_id, slug: post.slug } });
  return json({ ok: true });
}

async function remove(app, { postId }) {
  const user = await writer(app);
  const post = await deletePost(app, user, id(postId, "postId"));
  purge(app, { thread: { id: post.thread_id, slug: post.slug } });
  return json({ ok: true });
}

// The visitor's own posts, team role and whether they may reply, plus each switched-on feature's state for this take.
async function threadMine(app, { threadId }) {
  requireFeature(app, "community.forum");
  const user = await currentUser(app);
  const core = await mine(app, user, id(threadId, "threadId"));
  return json({ ...core, features: user ? await state(app, user, core.thread) : {}, thread: undefined }, 200, NO_STORE);
}

// Whether the visitor is on a space's team and may post Updates, for its page's new-take form and team desk (features add
// the desk's parts), with the space's name for "Post as".
async function spaceMine(app, { spaceId }) {
  requireFeature(app, "community.forum");
  const space = await getSpace(app.db, id(spaceId, "spaceId"));
  if (!space) fail(404, "not_found", "Not found.");
  const user = await currentUser(app);
  const role = user ? await teamRoleOf(app, user, space) : null;
  const mayUpdate = user ? await mayPublishUpdate(app, user, space) : false;
  return json({ signedIn: Boolean(user), team: Boolean(role), role, mayUpdate, name: space.name, kind: space.kind, path: spacePath(space), state: space.state, stateReason: space.state_reason || null }, 200, NO_STORE);
}

// Every space the public sees, for Discover's Communities (owner, 2026-10-22): names, kinds and addresses only.
async function spaces(app) {
  requireFeature(app, "community.forum");
  await limit(app, "browse", 120, 60);
  const rows = await listSpaces(app.db);
  return json({ spaces: rows.filter((s) => s.state !== "archived").map((s) => ({ id: s.id, name: s.name, kind: s.kind, official: Boolean(s.official),
    description: s.description || "", path: spacePath(s), readOnly: s.state !== "open" })) }, 200, { "Cache-Control": "public, max-age=60" });
}

export const routes = [
  ["GET", "/api/community/spaces", spaces],
  ["GET", "/api/community/me", me],
  ["PUT", "/api/community/me", setMe],
  ["PATCH", "/api/community/me", renameMe],
  ["GET", "/api/community/names/check", checkName],
  ["POST", "/api/community/threads", newThread],
  ["POST", "/api/community/threads/:threadId/posts", newReply],
  ["GET", "/api/community/threads/:threadId/mine", threadMine],
  ["GET", "/api/community/spaces/:spaceId/mine", spaceMine],
  ["PATCH", "/api/community/posts/:postId", edit],
  ["DELETE", "/api/community/posts/:postId", remove],
  ...holdRoutes,
  ...featureRoutes()
];
