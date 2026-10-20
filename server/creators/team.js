// A creator's team (docs/builder.md, phase 7): its members with their roles (creator_members, creator_roles; what each
// role may do is roles.js) and invitations by email (creator_invites). An invitation keeps only a hash of its token, works
// once and for 7 days, and only for the account signed in with that confirmed email address; it is deleted when
// accepted or withdrawn, and expired ones when the team is next looked at. The owner is never changed or removed here.
import { all, first, run, stmt, newId, now, randomToken } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { sha256 } from "../lib/crypto.js";
import { LIMITS } from "./policy.js";
import { accountLevel } from "../copyright/standing.js";

const DAY = 864e5;

export async function teamOf(db, creatorId) {
  await run(db, "DELETE FROM creator_invites WHERE creator_id = ? AND accepted_at IS NULL AND expires_at <= ?", creatorId, now());
  const [members, invites] = await Promise.all([
    all(db, `SELECT m.user_id, u.name, u.email, m.created_at, CASE WHEN m.role = 'owner' THEN 'owner' ELSE COALESCE(r.role, m.role) END AS role
      FROM creator_members m JOIN "user" u ON u.id = m.user_id LEFT JOIN creator_roles r ON r.creator_id = m.creator_id AND r.user_id = m.user_id
      WHERE m.creator_id = ? ORDER BY m.role = 'owner' DESC, m.created_at`, creatorId),
    all(db, "SELECT id, email, role, created_at, expires_at FROM creator_invites WHERE creator_id = ? AND accepted_at IS NULL ORDER BY created_at", creatorId)
  ]);
  return { members, invites };
}

// A new invitation (a pending one to the same address is replaced). Returns the token, to be mailed once.
export async function createInvite(db, creator, inviter, { email, role }) {
  const { members, invites } = await teamOf(db, creator.id);
  if (members.some((m) => String(m.email).toLowerCase() === email)) fail(409, "already_member", "That account is already on the team.");
  if (members.length + invites.filter((i) => i.email !== email).length >= LIMITS.membersPerCreator) {
    fail(409, "limit_reached", `A team can have up to ${LIMITS.membersPerCreator} people, invitations included.`);
  }
  const token = randomToken(24);
  const t = now();
  await db.batch([
    stmt(db, "DELETE FROM creator_invites WHERE creator_id = ? AND email = ? AND accepted_at IS NULL", creator.id, email),
    // The cap holds inside the insert too, so invitations sent at the same moment can't pass it.
    stmt(db, `INSERT INTO creator_invites (id, creator_id, email, role, token_hash, invited_by, created_at, expires_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
      WHERE (SELECT COUNT(*) FROM creator_members WHERE creator_id = ?2) + (SELECT COUNT(*) FROM creator_invites WHERE creator_id = ?2 AND accepted_at IS NULL) < ?9`,
      newId("inv"), creator.id, email, role, await sha256(token), inviter.id, t, new Date(Date.now() + 7 * DAY).toISOString(), LIMITS.membersPerCreator)
  ]);
  if (!(await first(db, "SELECT 1 FROM creator_invites WHERE creator_id = ? AND email = ? AND accepted_at IS NULL", creator.id, email))) {
    fail(409, "limit_reached", `A team can have up to ${LIMITS.membersPerCreator} people, invitations included.`);
  }
  return token;
}

export const withdrawInvite = (db, creatorId, inviteId) =>
  run(db, "DELETE FROM creator_invites WHERE id = ? AND creator_id = ? AND accepted_at IS NULL", inviteId, creatorId);

// The live invitation a token names, with its creator's name, or null.
export async function inviteByToken(db, token) {
  if (typeof token !== "string" || !/^[a-z2-7]{20,60}$/.test(token)) return null;
  return first(db, `SELECT i.*, c.name AS creator_name, c.slug AS creator_slug FROM creator_invites i JOIN creators c ON c.id = i.creator_id
    WHERE i.token_hash = ? AND i.accepted_at IS NULL AND i.expires_at > ? AND c.status = 'active' AND c.deleted_at IS NULL`, await sha256(token), now());
}

// Joins the signed-in account to the creator with the invitation's role. Only for the address it was sent to.
export async function acceptInvite(db, user, token) {
  const inv = await inviteByToken(db, token);
  if (!inv) fail(404, "not_found", "This invitation has expired, was withdrawn or was already used.");
  // An invitation from an account that has since reached three copyright strikes can't bring anyone in (security review).
  if (inv.invited_by && (await accountLevel(db, inv.invited_by)).level >= 3) fail(403, "copyright_text_only", "This invitation can't be accepted right now.");
  if (!user.emailVerified || String(user.email).toLowerCase() !== inv.email) {
    fail(403, "wrong_account", `This invitation is for another email address. Sign in with the account for that address to accept it.`);
  }
  const t = now();
  const [gone] = await db.batch([
    stmt(db, "DELETE FROM creator_invites WHERE id = ? AND accepted_at IS NULL", inv.id),
    stmt(db, `INSERT INTO creator_members (creator_id, user_id, role, created_at) SELECT ?, ?, 'editor', ?
      WHERE changes() > 0 AND NOT EXISTS (SELECT 1 FROM creator_members WHERE creator_id = ? AND user_id = ?)`, inv.creator_id, user.id, t, inv.creator_id, user.id),
    stmt(db, `INSERT INTO creator_roles (creator_id, user_id, role, created_at, updated_at) SELECT ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM creator_members WHERE creator_id = ? AND user_id = ? AND role <> 'owner')
      ON CONFLICT(creator_id, user_id) DO NOTHING`, inv.creator_id, user.id, inv.role, t, t, inv.creator_id, user.id)
  ]);
  if (!gone.meta.changes) fail(404, "not_found", "This invitation was already used.");
  return { creatorId: inv.creator_id, role: inv.role };
}

// Invitations a member sent that nobody accepted yet: they go when the member stops being one who may invite.
const dropInvitesStmt = (db, creatorId, userId) => stmt(db, "DELETE FROM creator_invites WHERE creator_id = ? AND invited_by = ? AND accepted_at IS NULL", creatorId, userId);

// A member's role (never the owner's: the routes check who may change whom). dropInvites: an admin losing the role.
export const setRole = (db, creatorId, userId, role, { dropInvites = false } = {}) => db.batch([
  stmt(db, `INSERT INTO creator_roles (creator_id, user_id, role, created_at, updated_at) SELECT ?, ?, ?, ?, ?
   WHERE EXISTS (SELECT 1 FROM creator_members WHERE creator_id = ? AND user_id = ? AND role <> 'owner')
   ON CONFLICT(creator_id, user_id) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at`,
  creatorId, userId, role, now(), now(), creatorId, userId),
  ...(dropInvites ? [dropInvitesStmt(db, creatorId, userId)] : [])
]);

export const removeMember = (db, creatorId, userId) => db.batch([
  dropInvitesStmt(db, creatorId, userId),
  stmt(db, "DELETE FROM creator_roles WHERE creator_id = ? AND user_id = ?", creatorId, userId),
  stmt(db, "DELETE FROM creator_members WHERE creator_id = ? AND user_id = ? AND role <> 'owner'", creatorId, userId)
]);
