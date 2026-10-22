// A project's official community space (docs/community.md, "Spaces and channels"): one per project, created when the
// project has the "community" feature (first-party projects list it in data/projects.js; a creator's team switches it on
// in the Studio), run by that creator's team (core/access.js reads the team through the project, never copies it), and
// canonical at /<creator>/<project>/community. Switching the feature off makes the space read-only (state_reason
// 'community_off'); nothing is ever deleted. Idempotent: ensure may run at any time, from any request.
import { first, run, stmt, now, newId } from "../../lib/db.js";
import { nameKey } from "./names.js";

const CHANNELS = [
  ["announcements", "Announcements", "update,discussion", "team"],
  ["general", "General", "discussion,question", "everyone"],
  ["help", "Help & questions", "question,discussion", "everyone"]
];
const OFF = "community_off";

async function freeSlug(db, base) {
  for (let i = 0; i < 20; i++) {
    const slug = i ? `${base.slice(0, 55)}-${i + 1}` : base.slice(0, 60);
    if (!await first(db, "SELECT 1 AS n FROM community_spaces WHERE slug = ?", slug)) return slug;
  }
  return `${base.slice(0, 40)}-${newId("s").slice(-8)}`;
}

// The project's space row (made when it doesn't exist; never reopened here, only by openProjectSpace), or null when the
// project doesn't exist. Safe to run at any time, from any request, and twice at once.
export async function ensureProjectSpace(db, projectId) {
  const project = await first(db, `SELECT p.id, p.name, p.slug, p.creator_id, c.slug AS creator_slug, c.name AS creator_name, c.source AS creator_source
    FROM projects p JOIN creators c ON c.id = p.creator_id WHERE p.id = ? AND p.deleted_at IS NULL`, projectId);
  if (!project) return null;
  const existing = await first(db, "SELECT * FROM community_spaces WHERE project_id = ?", project.id);
  if (existing) return existing;
  // A creator's project can't borrow AutoStacc's name for its space; first-party projects can.
  const own = project.creator_source !== "catalog" && nameKey(project.name).includes("autostacc");
  const names = [own ? `${project.name} (${project.creator_name})` : project.name, `${project.name} (${project.creator_name})`];
  const t = now();
  for (let attempt = 0; attempt < 6; attempt++) {
    const slug = await freeSlug(db, `${project.creator_slug}-${project.slug || project.id}`);
    const name = attempt < 2 ? names[attempt === 0 ? 0 : 1] : `${names[1]} ${attempt}`;
    if (await first(db, "SELECT 1 AS n FROM community_spaces WHERE name_key = ?", nameKey(name))) continue;
    const spaceId = newId("spc");
    try {
      await db.batch([
        stmt(db, `INSERT INTO community_spaces (id, slug, name, name_key, kind, project_id, official, description, rules, state, last_team_activity_at, created_at)
          VALUES (?, ?, ?, ?, 'project', ?, 1, '', '', 'open', ?, ?)`, spaceId, slug, name, nameKey(name), project.id, t, t),
        ...CHANNELS.map(([cslug, cname, types, who], i) => stmt(db, `INSERT INTO community_channels (id, space_id, slug, name, position, post_types, who_may_start, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, newId("chn"), spaceId, cslug, cname, i, types, who, t))
      ]);
      return first(db, "SELECT * FROM community_spaces WHERE id = ?", spaceId);
    } catch (e) {
      // Another request made it (same project), or a slug or name was taken in the meantime: look, then try the next name.
      const again = await first(db, "SELECT * FROM community_spaces WHERE project_id = ?", project.id);
      if (again) return again;
      if (!/UNIQUE/i.test(String((e && e.message) || e))) throw e;
    }
  }
  return null;
}

// The Studio switch turning it on: make the space, or open the one that was closed.
export async function openProjectSpace(db, projectId) {
  const space = await ensureProjectSpace(db, projectId);
  if (space && space.state === "read_only" && space.state_reason === OFF) {
    await run(db, "UPDATE community_spaces SET state = 'open', state_reason = NULL, last_team_activity_at = ? WHERE id = ?", now(), space.id);
  }
  return space;
}

// The feature switched off: the space stays, read-only.
export const closeProjectSpace = (db, projectId) => run(db,
  "UPDATE community_spaces SET state = 'read_only', state_reason = ? WHERE project_id = ? AND state = 'open'", OFF, projectId);
