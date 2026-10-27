// The names a person may post under besides their own (owner, 2026-10-27, "use the forum as the project", "post as
// AutoStacc"): AutoStacc for its admins, and every live creator and published project whose team they're on with the
// Update capability (AutoStacc's admins for first-party ones; so the AutoStacc creator's owner posts as AutoStacc too),
// anywhere in the community. One entry per name. A post under one keeps that name (as_team) and shows the Team
// badge; who wrote it stays recorded for the space's team and AutoStacc.
import { all } from "../../lib/db.js";
import { isAdmin } from "../../auth/session.js";
import { creatorsOfUser } from "../../creators/creators.js";
import { can } from "../../creators/roles.js";

export async function identitiesOf(app, user) {
  if (!user) return [];
  const admin = isAdmin(app, user);
  const mine = await creatorsOfUser(app.db, user.id);
  const roles = new Map(mine.map((c) => [c.id, c.role]));
  const speaks = (creatorId, source) => (source === "catalog" && admin) || Boolean(roles.get(creatorId) && can(roles.get(creatorId), "community.update"));
  const [creators, projects] = await Promise.all([
    all(app.db, "SELECT id, name, source FROM creators WHERE status = 'active' AND deleted_at IS NULL ORDER BY name"),
    all(app.db, `SELECT p.id, p.name, p.creator_id, c.source FROM projects p JOIN creators c ON c.id = p.creator_id
      WHERE p.published = 1 AND p.deleted_at IS NULL AND c.status = 'active' AND c.deleted_at IS NULL ORDER BY p.name`)
  ]);
  const out = admin ? [{ id: "autostacc", name: "AutoStacc" }] : [];
  const add = (id, name) => { if (!out.some((x) => x.name === name)) out.push({ id, name }); };
  for (const c of creators) if (speaks(c.id, c.source)) add(`creator:${c.id}`, c.name);
  for (const p of projects) if (speaks(p.creator_id, p.source)) add(`project:${p.id}`, p.name);
  return out;
}
