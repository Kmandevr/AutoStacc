// The platform part of db/catalog.sql: upserts first-party creators (data/creators.js), projects (data/projects.js) and
// polls (data/polls.js) into the store database, so the API can check ownership, follows and votes against them. Same
// rules as the product sync (lib/catalog.js): deterministic, drafts unpublished, removed entries marked deleted and
// never dropped (follows and votes point at them), and rows the Studio made (source 'studio') never touched.
const crypto = require("crypto");
const { q, NOW } = require("./catalog");
const V = require("../../server/discovery/vocabulary.js");

// What the projects browser needs about a first-party project: its genres in the store vocabulary ("genre:edm", or
// "style:glitch" for a word that is a style), and the dates of its releases, news posts and shows (newest first).
function projectGenres(p) {
  const out = [];
  for (const g of p.genres || []) {
    const genre = V.canonical("genre", g), style = V.canonical("style", g);
    const tag = genre ? `genre:${genre}` : style ? `style:${style}` : null;
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}
function projectActivity(data, id) {
  const dates = (list) => list.filter((x) => x.project === id && x.date).map((x) => x.date).sort().reverse().slice(0, 20);
  return { releases: dates(data.releases || []), news: dates(data.news || []), shows: dates(data.shows || []) };
}

const hash = (values) => crypto.createHash("sha256").update(JSON.stringify(values)).digest("hex").slice(0, 16);

// sourced: the table has a source column; only its 'catalog' rows belong to the sync.
function upserts(table, cols, rows, sourced = false) {
  const mine = sourced ? `${table}.source = 'catalog' AND ` : "";
  const all = [...cols, "catalog_hash"];
  const updates = all.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ");
  return [
    ...rows.map((r) => {
      r.catalog_hash = hash(cols.map((c) => r[c]));
      return `INSERT INTO ${table} (${all.join(", ")}, created_at, updated_at) VALUES (${all.map((c) => q(r[c])).join(", ")}, ${NOW}, ${NOW})\n` +
        `  ON CONFLICT (id) DO UPDATE SET ${updates}, deleted_at = NULL, updated_at = ${NOW}\n` +
        `  WHERE ${mine}(${table}.catalog_hash IS NOT excluded.catalog_hash OR ${table}.deleted_at IS NOT NULL);`;
    }),
    `UPDATE ${table} SET published = 0, deleted_at = ${NOW}, updated_at = ${NOW} WHERE ${sourced ? "source = 'catalog' AND " : ""}deleted_at IS NULL${rows.length ? ` AND id NOT IN (${rows.map((r) => q(r.id)).join(", ")})` : ""};`
  ];
}

function platformSql(data) {
  const creators = (data.creators || []).map((c) => ({ id: c.id, slug: c.id, name: c.name, source: "catalog", published: c.draft ? 0 : 1 }));
  const projects = data.projects.map((p) => ({
    id: p.id, name: p.name, features: JSON.stringify(p.features || []), published: p.draft ? 0 : 1, creator_id: p.creator || null, slug: p.id, source: "catalog",
    tagline: p.summary || p.tagline || null, image: p.logo ? "/" + p.logo.replace(/^\/+/, "") : null,
    genres: JSON.stringify(projectGenres(p)), activity: JSON.stringify(projectActivity(data, p.id))
  }));
  const polls = data.polls.map((p) => ({
    id: p.id, project_id: p.project, question: p.question,
    options: JSON.stringify((p.options || []).map((o) => ({ id: o.id, label: o.label }))),
    opens_at: p.opens ? `${p.opens}T00:00:00.000Z` : null,
    closes_at: p.closes ? `${p.closes}T23:59:59.999Z` : null,
    published: p.draft ? 0 : 1
  }));
  return [
    "-- Platform sync: creators, projects and polls (data/creators.js, data/projects.js, data/polls.js).",
    ...upserts("creators", ["id", "slug", "name", "source", "published"], creators, true),
    ...upserts("projects", ["id", "name", "features", "published", "creator_id", "slug", "source", "tagline", "image", "genres", "activity"], projects, true),
    ...upserts("polls", ["id", "project_id", "question", "options", "opens_at", "closes_at", "published"], polls)
  ].join("\n") + "\n";
}

module.exports = { platformSql };
