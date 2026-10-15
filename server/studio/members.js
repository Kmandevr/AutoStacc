// Studio API, a creator's team (docs/builder.md, phase 7): its members and roles, invitations by email, and accepting
// one. Who may do what is server/creators/roles.js: owners and admins manage the team, but an admin never changes or
// removes the owner or another admin, nor makes anyone an admin; anyone but the owner may leave. Emails of members
// and invitees are shown only to those who manage the team.
import { json, readJson, fail, str, email as cleanEmail } from "../lib/http.js";
import { requireUser } from "../auth/session.js";
import { limit } from "../lib/ratelimit.js";
import { sendEmail } from "../email/index.js";
import { requireCreator } from "../creators/creators.js";
import { rolesFor, can, TEAM_ROLES, ROLE_LABELS, capabilitiesOf } from "../creators/roles.js";
import { teamOf, createInvite, withdrawInvite, inviteByToken, acceptInvite, setRole, removeMember } from "../creators/team.js";

const role = (v) => {
  if (!TEAM_ROLES.includes(v)) fail(400, "invalid_role", `Pick one of: ${TEAM_ROLES.map((r) => ROLE_LABELS[r]).join(", ")}.`, { field: "role" });
  return v;
};
// An admin manages publishers, store managers and editors; only the owner touches admins.
const mayManage = (actorRole, targetRole) => actorRole === "owner" || (targetRole !== "admin" && targetRole !== "owner");

async function getTeam(app, { creatorId }) {
  const user = await requireUser(app);
  const { creator, role: mine } = await requireCreator(app.db, creatorId, user);
  const { members, invites } = await teamOf(app.db, creator.id);
  const manages = can(mine, "members");
  return json({
    you: { userId: user.id, role: mine, capabilities: capabilitiesOf(mine) },
    roles: TEAM_ROLES.map((r) => ({ id: r, label: ROLE_LABELS[r], youMayGrant: mayManage(mine, r) && manages })),
    members: members.map((m) => ({ userId: m.user_id, name: m.name, role: m.role, label: ROLE_LABELS[m.role], since: m.created_at,
      ...(manages ? { email: m.email } : {}), you: m.user_id === user.id })),
    invites: manages ? invites.map((i) => ({ id: i.id, email: i.email, role: i.role, label: ROLE_LABELS[i.role], expiresAt: i.expires_at })) : []
  });
}

async function invite(app, { creatorId }) {
  const user = await requireUser(app);
  await limit(app, "studio-invite", 20, 3600);
  const { creator, role: mine } = await requireCreator(app.db, creatorId, user, rolesFor("members"));
  const body = await readJson(app.request);
  const to = cleanEmail(body.email);
  const r = role(body.role);
  if (!mayManage(mine, r)) fail(403, "forbidden", "Only the owner can make someone an admin.");
  const token = await createInvite(app.db, creator, user, { email: to, role: r });
  await sendEmail(app, "creator-invite", to, { url: `${app.config.siteUrl}/studio#invite=${token}`, creator: creator.name, role: ROLE_LABELS[r], inviter: user.name || "A creator" });
  return json({ ok: true }, 201);
}

async function withdraw(app, { creatorId, inviteId }) {
  const user = await requireUser(app);
  const { creator } = await requireCreator(app.db, creatorId, user, rolesFor("members"));
  await withdrawInvite(app.db, creator.id, str(inviteId, "inviteId", { max: 80 }));
  return json({ ok: true });
}

async function changeRole(app, { creatorId, userId }) {
  const user = await requireUser(app);
  const { creator, role: mine } = await requireCreator(app.db, creatorId, user, rolesFor("members"));
  const r = role((await readJson(app.request)).role);
  const target = (await teamOf(app.db, creator.id)).members.find((m) => m.user_id === userId);
  if (!target) fail(404, "not_found", "No such member.");
  if (target.role === "owner") fail(403, "forbidden", "The owner's role can't change.");
  if (!mayManage(mine, target.role) || !mayManage(mine, r)) fail(403, "forbidden", "Only the owner can change an admin or make one.");
  await setRole(app.db, creator.id, userId, r);
  return json({ ok: true });
}

async function remove(app, { creatorId, userId }) {
  const user = await requireUser(app);
  const self = userId === user.id;
  const { creator, role: mine } = await requireCreator(app.db, creatorId, user, self ? undefined : rolesFor("members"));
  const target = (await teamOf(app.db, creator.id)).members.find((m) => m.user_id === userId);
  if (!target) fail(404, "not_found", "No such member.");
  if (target.role === "owner") fail(403, "forbidden", "The owner can't leave or be removed.");
  if (!self && !mayManage(mine, target.role)) fail(403, "forbidden", "Only the owner can remove an admin.");
  await removeMember(app.db, creator.id, userId);
  return json({ ok: true });
}

// What an invitation is for, to the person holding the link (signed in): the creator, the role, and whether this
// account can accept it. The address it was sent to isn't shown.
async function showInvite(app, { token }) {
  const user = await requireUser(app);
  await limit(app, "studio-invite-look", 30, 600);
  const inv = await inviteByToken(app.db, token);
  if (!inv) fail(404, "not_found", "This invitation has expired, was withdrawn or was already used.");
  return json({ creator: { name: inv.creator_name, path: `/${inv.creator_slug}` }, role: inv.role, label: ROLE_LABELS[inv.role],
    forYou: Boolean(user.emailVerified) && String(user.email).toLowerCase() === inv.email });
}

async function accept(app, { token }) {
  const user = await requireUser(app);
  await limit(app, "studio-invite-look", 30, 600);
  return json(await acceptInvite(app.db, user, token));
}

export const routes = [
  ["GET", "/api/studio/creators/:creatorId/team", getTeam],
  ["POST", "/api/studio/creators/:creatorId/invites", invite],
  ["DELETE", "/api/studio/creators/:creatorId/invites/:inviteId", withdraw],
  ["PATCH", "/api/studio/creators/:creatorId/members/:userId", changeRole],
  ["DELETE", "/api/studio/creators/:creatorId/members/:userId", remove],
  ["GET", "/api/studio/invites/:token", showInvite],
  ["POST", "/api/studio/invites/:token/accept", accept]
];
