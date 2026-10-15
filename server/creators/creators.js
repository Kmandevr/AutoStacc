// Creators and their members as the store keeps them (D1 creators, creator_members with each member's role in
// creator_roles: roles.js), plus the read side of projects.
// Studio projects are changed in projects.js; renames' slug holds live in holds.js. Slugs are lowercase and unique
// (creators site-wide, projects within their creator). Catalog creators and projects (data/creators.js,
// data/projects.js) are read here too, but only the deploy's sync writes them.
import { all, first, stmt, newId, now } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { slugProblem } from "../lib/slugs.js";
import { LIMITS } from "./policy.js";
import { ROLES } from "./roles.js";
import { creatorSlugFree, holdStmt, taken, isUnique, holdsOf, MAX_HOLDS, namePosesAsFirstParty } from "./holds.js";

const LIVE = "deleted_at IS NULL";

export const getCreator = (db, id) => first(db, `SELECT * FROM creators WHERE id = ? AND ${LIVE}`, id);
export const getCreatorBySlug = (db, slug) => first(db, `SELECT * FROM creators WHERE slug = ? AND ${LIVE}`, String(slug).toLowerCase());
export const getProject = (db, id) => first(db, `SELECT * FROM projects WHERE id = ? AND ${LIVE}`, id);
export const getProjectBySlug = (db, creatorId, slug) =>
  first(db, `SELECT * FROM projects WHERE creator_id = ? AND slug = ? AND ${LIVE}`, creatorId, String(slug).toLowerCase());
export const projectsOf = (db, creatorId) => all(db, `SELECT * FROM projects WHERE creator_id = ? AND ${LIVE} ORDER BY name`, creatorId);

// A member's role: the owner, else the team role in creator_roles (a member without one is an editor).
const ROLE_SQL = "CASE WHEN m.role = 'owner' THEN 'owner' ELSE COALESCE(r.role, m.role) END";
const WITH_ROLE = "creator_members m LEFT JOIN creator_roles r ON r.creator_id = m.creator_id AND r.user_id = m.user_id";

// The creators an account belongs to, with its role in each.
export const creatorsOfUser = (db, userId) => all(db,
  `SELECT c.*, ${ROLE_SQL} AS role FROM ${WITH_ROLE} JOIN creators c ON c.id = m.creator_id WHERE m.user_id = ? AND c.${LIVE} ORDER BY c.name`, userId);

export const roleOf = async (db, creatorId, userId) =>
  ((await first(db, `SELECT ${ROLE_SQL} AS role FROM ${WITH_ROLE} WHERE m.creator_id = ? AND m.user_id = ?`, creatorId, userId)) || {}).role || null;

// A Studio creator this account may act on with one of these roles (by default, any member; routes pass
// rolesFor(capability) from roles.js). Anything else looks like nothing there.
export async function requireCreator(db, creatorId, user, roles = ROLES) {
  // The creator and this account's role in it are read together; nothing is returned until both checks below pass.
  const [creator, memberRole] = typeof creatorId === "string" ? await Promise.all([getCreator(db, creatorId), roleOf(db, creatorId, user.id)]) : [null, null];
  const role = creator && creator.source === "studio" ? memberRole : null;
  if (!role || !roles.includes(role)) fail(404, "not_found", "Nothing here.");
  if (creator.status !== "active") fail(403, "creator_suspended", "This creator is suspended. Contact AutoStacc support.");
  return { creator, role };
}

// A clean slug or a 400 naming what's wrong. Reserved words only matter for creators (they share the top level).
export function cleanSlug(raw, { creator = false } = {}) {
  const slug = String(raw || "").trim().toLowerCase();
  const problem = slugProblem(slug);
  if (problem === "reserved" && !creator) return slug;
  if (problem === "length") fail(400, "invalid_slug", "Names in addresses are 3 to 40 characters.", { field: "slug" });
  if (problem === "format") fail(400, "invalid_slug", "Use lowercase letters, numbers and single hyphens.", { field: "slug" });
  if (problem === "reserved") fail(409, "slug_taken", "That name is taken.", { field: "slug" });
  return slug;
}

const reservedName = () => fail(409, "name_taken", "That name belongs to a project on AutoStacc. Pick another.", { field: "name" });

// The limit is checked inside the insert itself, so parallel requests can't each squeeze in one more creator.
export async function createCreator(db, user, { slug, name }) {
  const [free, posing] = await Promise.all([creatorSlugFree(db, slug), namePosesAsFirstParty(db, name)]);
  if (!free) taken();
  if (posing) reservedName();
  const id = newId("cr");
  const t = now();
  let res;
  try {
    [res] = await db.batch([
      stmt(db, `INSERT INTO creators (id, slug, name, source, status, published, created_by, created_at, updated_at)
        SELECT ?, ?, ?, 'studio', 'active', 1, ?, ?, ?
        WHERE (SELECT COUNT(*) FROM creator_members WHERE user_id = ? AND role = 'owner') < ?`, id, slug, name, user.id, t, t, user.id, LIMITS.creatorsPerAccount),
      stmt(db, `INSERT INTO creator_members (creator_id, user_id, role, created_at) SELECT ?, ?, 'owner', ? WHERE EXISTS (SELECT 1 FROM creators WHERE id = ?)`,
        id, user.id, t, id)
    ]);
  } catch (e) {
    if (isUnique(e)) taken();
    throw e;
  }
  if (!res.meta.changes) fail(409, "limit_reached", "This account already runs a creator.");
  return getCreator(db, id);
}

export async function updateCreator(db, creator, { slug, name }) {
  const t = now();
  const writes = [];
  const renaming = Boolean(slug && slug !== creator.slug);
  const [posing, free, holds] = await Promise.all([
    name && name !== creator.name ? namePosesAsFirstParty(db, name) : false,
    renaming ? creatorSlugFree(db, slug, creator.id) : true,
    renaming ? holdsOf(db, "creator", creator.id) : 0
  ]);
  if (posing) reservedName();
  if (renaming) {
    if (!free) taken();
    if (holds >= MAX_HOLDS) fail(429, "rename_limit", "This creator has been renamed too often lately. Try again later.");
    writes.push(...holdStmt(db, "creator", "", creator.slug, slug, creator.id));
  }
  writes.push(stmt(db, "UPDATE creators SET slug = ?, name = ?, updated_at = ? WHERE id = ?", slug || creator.slug, name || creator.name, t, creator.id));
  try {
    await db.batch(writes);
  } catch (e) {
    if (isUnique(e)) taken();
    throw e;
  }
  return getCreator(db, creator.id);
}

// Names of projects by id, for things already owned (a deleted project's items keep their name in Your Stacc).
export const projectNames = (db, ids) => ids.length
  ? all(db, `SELECT id, name FROM projects WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids)
  : Promise.resolve([]);

// Who sells each product: its project, the project's creator and that creator's fee settings. Products without a
// project or creator (none today) come back with nulls.
export const sellersOfProducts = (db, productIds) => productIds.length
  ? all(db, `SELECT p.id AS product_id, p.project_id, pr.creator_id, c.platform_fee_bps
      FROM products p LEFT JOIN projects pr ON pr.id = p.project_id LEFT JOIN creators c ON c.id = pr.creator_id
      WHERE p.id IN (${productIds.map(() => "?").join(",")})`, ...productIds)
  : Promise.resolve([]);

export const publicCreator = (c) => ({ id: c.id, slug: c.slug, name: c.name, status: c.status, trusted: Boolean(c.trusted), source: c.source });
export const publicProject = (p) => ({ id: p.id, slug: p.slug, name: p.name, published: Boolean(p.published), source: p.source });

// Account deletion: the account leaves every creator it belongs to. Callers refuse first if it still owns a live one.
export const leaveAllCreatorsStmts = (db, userId, email) => [
  stmt(db, "DELETE FROM creator_roles WHERE user_id = ?", userId),
  stmt(db, "DELETE FROM creator_members WHERE user_id = ?", userId),
  stmt(db, "DELETE FROM creator_invites WHERE email = ? AND accepted_at IS NULL", String(email || "").toLowerCase())
];
