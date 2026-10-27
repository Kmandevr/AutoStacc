// The names a person may post under besides their own (owner, 2026-10-27, "use the forum as the project"): AutoStacc
// for its admins, and every live project whose team they're on with the Update capability (AutoStacc's admins for
// first-party projects), anywhere in the community. A post under one keeps that name (as_team) and shows the Team
// badge; who wrote it stays recorded for the space's team and AutoStacc.
import { all } from "../../lib/db.js";
import { isAdmin } from "../../auth/session.js";
import { creatorsOfUser } from "../../creators/creators.js";
import { can } from "../../creators/roles.js";

export async function identitiesOf(app, user) {
  if (!user) return [];
  const admin = isAdmin(app, user);
  const roles = new Map((await creatorsOfUser(app.db, user.id)).map((c) => [c.id, c.role]));
  const projects = await all(app.db, `SELECT p.id, p.name, p.creator_id, c.source FROM projects p JOIN creators c ON c.id = p.creator_id
    WHERE p.published = 1 AND p.deleted_at IS NULL AND c.status = 'active' AND c.deleted_at IS NULL ORDER BY p.name`);
  const out = admin ? [{ id: "autostacc", name: "AutoStacc" }] : [];
  for (const p of projects) {
    const role = roles.get(p.creator_id);
    if ((p.source === "catalog" && admin) || (role && can(role, "community.update"))) out.push({ id: `project:${p.id}`, name: p.name });
  }
  return out;
}
