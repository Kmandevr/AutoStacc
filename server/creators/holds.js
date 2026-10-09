// Slug holds (D1 slug_holds): when a creator or project is renamed, its old slug stays reserved for it for
// LIMITS.renameHoldDays, so nobody can take it to pose as them, and its old address answers a 301 to the new one.
import { all, first, stmt, now } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { LIMITS } from "./policy.js";

export const taken = () => fail(409, "slug_taken", "That name is taken.", { field: "slug" });
export const isUnique = (e) => /UNIQUE/.test(String(e && e.message));

const heldBy = (db, kind, scope, slug) =>
  first(db, "SELECT target_id FROM slug_holds WHERE kind = ? AND scope = ? AND slug = ? AND expires_at > ?", kind, scope, slug, now());

// The writes that move a slug: the new one stops being held (it is in use again), the old one is held for target.
export const holdStmt = (db, kind, scope, oldSlug, newSlug, targetId) => [
  stmt(db, "DELETE FROM slug_holds WHERE kind = ? AND scope = ? AND slug = ?", kind, scope, newSlug),
  stmt(db, `INSERT INTO slug_holds (kind, scope, slug, target_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (kind, scope, slug) DO UPDATE SET target_id = excluded.target_id, expires_at = excluded.expires_at`,
  kind, scope, oldSlug, targetId, new Date(Date.now() + LIMITS.renameHoldDays * 86400000).toISOString(), now())
];

// Is the slug free for this creator (or a new one)? Taken by another, held for another, or the name of a
// first-party project (data/projects.js: a creator "glitches-and-stitches" would pose as that artist) means no.
export async function creatorSlugFree(db, slug, creatorId = null) {
  const [firstParty, row, hold] = await Promise.all([
    first(db, "SELECT 1 AS x FROM projects WHERE source = 'catalog' AND slug = ?", slug),
    first(db, "SELECT id FROM creators WHERE slug = ?", slug),
    heldBy(db, "creator", "", slug)
  ]);
  if (firstParty) return false;
  if (row && row.id !== creatorId) return false;
  return !hold || hold.target_id === creatorId;
}

export async function projectSlugFree(db, creatorId, slug, projectId = null) {
  const [row, hold] = await Promise.all([
    first(db, "SELECT id FROM projects WHERE creator_id = ? AND slug = ? AND deleted_at IS NULL", creatorId, slug),
    heldBy(db, "project", creatorId, slug)
  ]);
  if (row && row.id !== projectId) return false;
  return !hold || hold.target_id === projectId;
}

// Renames per creator are bounded: each one holds a name for LIMITS.renameHoldDays, so without a cap one account
// could lock up names by renaming over and over.
export const MAX_HOLDS = 3;
export const holdsOf = async (db, kind, targetId) =>
  (await first(db, "SELECT COUNT(*) AS n FROM slug_holds WHERE kind = ? AND target_id = ? AND expires_at > ?", kind, targetId, now())).n;

// A display name that is a first-party creator's or project's (ignoring case, spacing, punctuation, "&" vs "and")
// can't be used.
const nameKey = (s) => String(s).toLowerCase().normalize("NFKD").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
export async function namePosesAsFirstParty(db, name) {
  const key = nameKey(name);
  if (!key) return false;
  const rows = await all(db, "SELECT name FROM creators WHERE source = 'catalog' UNION ALL SELECT name FROM projects WHERE source = 'catalog'");
  return rows.some((r) => nameKey(r.name) === key);
}

// The id an old slug points at while its hold lasts, or null.
export const heldTarget = async (db, kind, scope, slug) => ((await heldBy(db, kind, scope, String(slug).toLowerCase())) || {}).target_id || null;
