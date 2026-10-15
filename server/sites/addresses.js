// One address space per creator (docs/builder.md): /<creator>/<name> is a project when one has that slug, else a page
// of the creator's profile. So a profile page can't take a project's slug (checked when the profile is saved) and a
// project can't take a profile page's (creators/holds.js projectSlugFree asks profileSlugs).
import { first, all, parseJson } from "../lib/db.js";

// Slugs the creator's profile uses, in its draft or as published.
export async function profileSlugs(db, creatorId) {
  const row = await first(db, "SELECT draft, published FROM creator_sites WHERE creator_id = ?", creatorId);
  const slugs = new Set();
  for (const raw of [row && row.draft, row && row.published]) for (const p of parseJson(raw, {}).pages || []) if (p && p.slug) slugs.add(String(p.slug).toLowerCase());
  return slugs;
}

// The creator's project slugs (live projects and names held after a rename).
export async function projectSlugs(db, creatorId) {
  const rows = await all(db, `SELECT slug FROM projects WHERE creator_id = ? AND deleted_at IS NULL
    UNION SELECT slug FROM slug_holds WHERE kind = 'project' AND scope = ?`, creatorId, creatorId);
  return new Set(rows.map((r) => r.slug));
}
