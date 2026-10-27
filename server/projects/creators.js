// The creators browser (GET /api/creators): every creator the public can see, AutoStacc's own (synced from
// data/creators.js) and Studio creators that are active, published and not deleted, with at least one visible project.
// Each says only what its /<creator> profile already shows: name, address, whether AutoStacc trusts it (as
// publicProject does) and its visible projects (name and address). Search, sort and pages are worked out here.
import { imageSrc } from "../sites/images.js";
import { all } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { projectAddress } from "./projects.js";

export const SORTS = ["name", "newest", "projects"];
const PER = 24;

export function parseCreatorFilters(params) {
  const q = (params.get("q") || "").trim().toLowerCase();
  if (q.length > 80) fail(400, "invalid_filter", "Search is up to 80 characters.", { field: "q" });
  const sort = params.get("sort") || "name";
  if (!SORTS.includes(sort)) fail(400, "invalid_filter", `sort is one of ${SORTS.join(", ")}.`, { field: "sort" });
  const page = Number(params.get("page") || 1);
  if (!Number.isInteger(page) || page < 1 || page > 500) fail(400, "invalid_filter", "page is a whole number from 1.", { field: "page" });
  return { q, words: q.split(/\s+/).filter(Boolean).slice(0, 6), sort, page };
}

// Visible creators with their visible projects. A suspended, unpublished or deleted creator is never listed, nor
// are its projects; a creator without a published project isn't either.
export async function creatorEntries(db) {
  const rows = await all(db, `SELECT c.id, c.slug, c.name, c.source, c.trusted, c.bio, c.avatar_asset, c.banner_asset, c.created_at, p.id AS project_id, p.slug AS project_slug, p.name AS project_name
    FROM creators c JOIN projects p ON p.creator_id = c.id
    WHERE c.status = 'active' AND c.published = 1 AND c.deleted_at IS NULL AND p.published = 1 AND p.deleted_at IS NULL
    ORDER BY p.name`);
  const byId = new Map();
  for (const r of rows) {
    if (!byId.has(r.id)) {
      byId.set(r.id, { slug: r.slug, name: r.name, path: `/${r.slug}`, firstParty: r.source !== "studio",
        verified: r.source !== "studio" || Boolean(r.trusted), bio: r.bio || "", avatar: r.avatar_asset ? imageSrc(r.avatar_asset) : "",
        banner: r.banner_asset ? imageSrc(r.banner_asset) : "", projects: [], createdAt: r.created_at });
    }
    byId.get(r.id).projects.push({ name: r.project_name, path: projectAddress({ creator_slug: r.slug, slug: r.project_slug, id: r.project_id }) });
  }
  return [...byId.values()];
}

// Search (creator and project names), sort and the page.
export function browseCreators(entries, f) {
  const text = (c) => [c.name, c.slug, ...c.projects.map((p) => p.name)].join(" ").toLowerCase();
  const order = {
    name: (a, b) => a.name.localeCompare(b.name),
    newest: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || a.name.localeCompare(b.name),
    projects: (a, b) => b.projects.length - a.projects.length || a.name.localeCompare(b.name)
  }[f.sort];
  const hits = entries.filter((c) => f.words.every((w) => text(c).includes(w))).sort(order);
  return {
    total: hits.length, page: f.page, per: PER, pages: Math.max(1, Math.ceil(hits.length / PER)), sort: f.sort,
    creators: hits.slice((f.page - 1) * PER, f.page * PER).map(({ createdAt, ...c }) => c)
  };
}
