// Project content every creator makes in the Studio, first-party included (D1 project_releases and project_events;
// docs/creators.md): the rows, their writes (always a draft first; publish, unpublish, soft delete) and their public
// shapes. Public reads only ever see published content of visible projects (server/projects/projects.js). Release and
// event pages (server/content/public.js), the events calendar (events.js) and the sitemap (sitemap.js) read them
// through getPublished, select and PUBLISHED. News (project_news) is off until each creator's community opens (#174): its
// rows are kept as they are and nothing here reads them. releasesWithLocalArtwork and swapReleaseArtwork move artwork
// migrated from data/ into the creator's own images (#179).
import { all, first, stmt, newId, now, parseJson } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { storedTags } from "../lib/tags.js";
import { VISIBLE, projectAddress, getVisibleProject } from "../projects/projects.js";
import { taken, isUnique } from "../creators/holds.js";
import { embedFor } from "../sites/embeds.js";
import { imageSrc } from "../sites/images.js";

// Each kind: its table, id prefix, page folder, date column and its fields as [column, json?].
export const KIND = {
  releases: { table: "project_releases", prefix: "rel", folder: "music", date: "release_date", max: 200, fields: {
    slug: ["slug"], title: ["title"], type: ["type"], date: ["release_date"], upc: ["upc"], description: ["description"],
    artwork: ["artwork", true], tracks: ["tracks", true], credits: ["credits", true], embedUrl: ["embed_url"],
    fallbackEmbedUrl: ["fallback_embed_url"], links: ["links", true], featured: ["featured"], tags: ["tags", true] } },
  events: { table: "project_events", prefix: "evt", folder: "events", date: "event_date", max: 200, fields: {
    slug: ["slug"], title: ["title"], date: ["event_date"], time: ["start_time"], endDate: ["end_date"], timeZone: ["time_zone"],
    venue: ["venue"], city: ["city"], country: ["country"], ticketUrl: ["ticket_url"], tags: ["tags", true], description: ["description"] } }
};

export const today = () => now().slice(0, 10);
const toDb = (k, v) => (k === "featured" ? (v ? 1 : 0) : v);
export const pathOf = (kind, r) => `${projectAddress({ creator_slug: r.creator_slug, slug: r.project_slug, id: r.project_id })}/${KIND[kind].folder}/${r.slug}`;

// A row's values under the field names the API uses (JSON columns parsed).
export function valuesOf(kind, row) {
  const out = {};
  for (const [k, [col, isJson]] of Object.entries(KIND[kind].fields)) out[k] = isJson ? parseJson(row[col], k === "artwork" ? null : []) : row[col];
  if (kind === "releases") out.featured = Boolean(row.featured);
  out.tags = storedTags(row.tags);
  return out;
}

const artworkOut = (a) => (a && a.asset ? { src: imageSrc(a.asset), width: a.width, height: a.height, alt: a.alt } : a || null);
const playerOut = (v) => (v ? (embedFor(v) || {}).src || v : "");
const host = (r) => ({ creator: r.creator_slug || "", creatorName: r.creator_name || "", projectName: r.project_name || "" });

// ---------- public shapes ----------
export function publicRelease(r) {
  const v = valuesOf("releases", r);
  return { id: r.slug, project: r.project_id, title: v.title, type: v.type, date: v.date, upc: v.upc || "", description: v.description,
    artwork: artworkOut(v.artwork), tracks: v.tracks, credits: v.credits, embedUrl: playerOut(v.embedUrl),
    fallbackEmbedUrl: playerOut(v.fallbackEmbedUrl), links: v.links, featured: v.featured, tags: v.tags, path: pathOf("releases", r) };
}
export const publicEvent = (r) => ({ id: r.slug, project: r.project_id, title: r.title, date: r.event_date, time: r.start_time || "",
  endDate: r.end_date || "", timeZone: r.time_zone || "", venue: r.venue || "", city: r.city, country: r.country || "",
  ticketUrl: r.ticket_url || "", tags: storedTags(r.tags), description: r.description || "", path: pathOf("events", r), ...host(r) });
export const PUBLIC = { releases: publicRelease, events: publicEvent };

// What the Studio shows: every stored value (not yet resolved for the public), its state and its address.
export const studioView = (kind, r) => ({ id: r.id, ...valuesOf(kind, r), published: Boolean(r.published), updatedAt: r.updated_at,
  path: pathOf(kind, r), ...(kind === "releases" ? { artworkSrc: (artworkOut(parseJson(r.artwork, null)) || {}).src || null } : {}) });

// ---------- reads ----------
const JOIN = "JOIN projects p ON p.id = x.project_id LEFT JOIN creators c ON c.id = p.creator_id";
export const select = (kind) => `SELECT x.*, p.slug AS project_slug, p.name AS project_name, c.slug AS creator_slug, c.name AS creator_name FROM ${KIND[kind].table} x ${JOIN}`;
export const PUBLISHED = `x.published = 1 AND x.deleted_at IS NULL AND ${VISIBLE}`;
// An event still to come or still running.
export const UPCOMING = "COALESCE(x.end_date, x.event_date) >= ?";

// Published content of visible projects (one project's, or every project's newest), events upcoming only.
async function published(db, where, params, max) {
  const [releases, events] = await Promise.all([
    all(db, `${select("releases")} WHERE ${PUBLISHED}${where} ORDER BY x.release_date DESC, x.created_at DESC LIMIT ?`, ...params, max),
    all(db, `${select("events")} WHERE ${PUBLISHED}${where} AND ${UPCOMING} ORDER BY x.event_date, x.start_time, x.created_at LIMIT ?`, ...params, today(), max)
  ]);
  return { releases: releases.map(publicRelease), events: events.map(publicEvent) };
}
export const projectContent = (db, projectId) => published(db, " AND p.id = ?", [projectId], 500);
export const latestContent = (db, max) => published(db, "", [], max);

// A published release or event at /<creator>/<project>/<folder>/<slug>, with its visible project, or null.
export async function getPublished(db, kind, creatorSlug, projectSlug, slug) {
  if (!KIND[kind]) return null;
  const row = await first(db, `${select(kind)} WHERE ${PUBLISHED} AND c.slug = ? AND COALESCE(p.slug, p.id) = ? AND x.slug = ?`,
    String(creatorSlug).toLowerCase(), String(projectSlug).toLowerCase(), String(slug).toLowerCase());
  const project = row && (await getVisibleProject(db, row.project_id));
  return project ? { item: PUBLIC[kind](row), row, project } : null;
}

// Every project's published release and event dates: { [projectId]: { releases: [], events: [] } }.
export async function contentDates(db) {
  const rows = await all(db, Object.keys(KIND).map((k) =>
    `SELECT project_id, '${k}' AS kind, ${KIND[k].date} AS d FROM ${KIND[k].table} WHERE published = 1 AND deleted_at IS NULL`).join(" UNION ALL "));
  const out = {};
  for (const r of rows) ((out[r.project_id] ||= { releases: [], events: [] })[r.kind]).push(r.d);
  return out;
}

// ---------- artwork from data/ (#179) ----------
// Releases whose artwork is still a root-relative file of the site (no stored image): [{ id, project_id, creator_id, artwork }].
export const releasesWithLocalArtwork = async (db) => (await all(db, `SELECT x.id, x.project_id, p.creator_id, x.artwork FROM project_releases x
  JOIN projects p ON p.id = x.project_id WHERE x.deleted_at IS NULL AND x.artwork IS NOT NULL AND json_extract(x.artwork, '$.asset') IS NULL
  AND json_extract(x.artwork, '$.src') LIKE '/%'`)).map((r) => ({ ...r, artwork: parseJson(r.artwork, null) }));
// Compare-and-set: the release's artwork becomes { asset, width, height, alt } only while it still is oldSrc. -> changed?
export const swapReleaseArtwork = async (db, releaseId, oldSrc, artwork) => Boolean((await stmt(db, `UPDATE project_releases
  SET artwork = ?, updated_at = ? WHERE id = ? AND json_extract(artwork, '$.asset') IS NULL AND json_extract(artwork, '$.src') = ?`,
  JSON.stringify({ asset: artwork.asset, width: artwork.width, height: artwork.height, alt: artwork.alt }), now(), releaseId, oldSrc).run()).meta.changes);

// ---------- the Studio ----------
export const getItem = (db, kind, id) => first(db, `${select(kind)} WHERE x.id = ? AND x.deleted_at IS NULL`, id);
export const listItems = (db, kind, projectId) =>
  all(db, `${select(kind)} WHERE x.project_id = ? AND x.deleted_at IS NULL ORDER BY x.${KIND[kind].date} DESC, x.created_at DESC`, projectId);

const unfeature = (db, projectId, id) => stmt(db, "UPDATE project_releases SET featured = 0 WHERE project_id = ? AND id <> ? AND featured = 1", projectId, id);

async function write(db, statements) {
  try {
    return await db.batch(statements);
  } catch (e) {
    if (isUnique(e)) taken();
    throw e;
  }
}

// A new item, always a draft. The project's limit is checked inside the insert, so parallel requests can't pass it.
export async function createItem(db, kind, project, user, values) {
  const k = KIND[kind];
  const id = newId(k.prefix);
  const t = now();
  const cols = Object.keys(values).filter((f) => k.fields[f]);
  const names = ["id", "project_id", ...cols.map((f) => k.fields[f][0]), "published", "created_by", "created_at", "updated_at"];
  const params = [id, project.id, ...cols.map((f) => (k.fields[f][1] ? JSON.stringify(values[f]) : toDb(f, values[f]))), 0, user.id, t, t];
  const [res] = await write(db, [
    stmt(db, `INSERT INTO ${k.table} (${names.join(", ")}) SELECT ${names.map(() => "?").join(", ")}
      WHERE (SELECT COUNT(*) FROM ${k.table} WHERE project_id = ? AND deleted_at IS NULL) < ?`, ...params, project.id, k.max),
    ...(values.featured ? [unfeature(db, project.id, id)] : [])
  ]);
  if (!res.meta.changes) fail(409, "limit_reached", `A project can have up to ${k.max} of these.`);
  return getItem(db, kind, id);
}

// Changes the fields given (and published). A published item's address never changes.
export async function updateItem(db, kind, row, values) {
  const k = KIND[kind];
  if (values.slug && values.slug !== row.slug && row.published) fail(409, "slug_locked", "A published page keeps its address. Unpublish it first, or keep this one.", { field: "slug" });
  const sets = [];
  const params = [];
  for (const [f, v] of Object.entries(values)) {
    if (f === "published") sets.push("published = ?"), params.push(v ? 1 : 0);
    else if (k.fields[f]) sets.push(`${k.fields[f][0]} = ?`), params.push(k.fields[f][1] ? JSON.stringify(v) : toDb(f, v));
  }
  await write(db, [
    stmt(db, `UPDATE ${k.table} SET ${sets.join(", ")}, updated_at = ? WHERE id = ? AND deleted_at IS NULL`, ...params, now(), row.id),
    ...(values.featured ? [unfeature(db, row.project_id, row.id)] : [])
  ]);
  return getItem(db, kind, row.id);
}

// Soft delete: off the site at once, its slug free again.
export const deleteItem = (db, kind, row) =>
  stmt(db, `UPDATE ${KIND[kind].table} SET published = 0, deleted_at = ?, updated_at = ? WHERE id = ?`, now(), now(), row.id).run();
