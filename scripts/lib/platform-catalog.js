// The platform part of db/catalog.sql: upserts projects (data/projects.js) and polls (data/polls.js) into the store
// database, so the API can check follows and votes against them. Same rules as the product sync (lib/catalog.js):
// deterministic, drafts unpublished, removed entries marked deleted and never dropped (follows and votes point at them).
const crypto = require("crypto");
const { q, NOW } = require("./catalog");

const hash = (values) => crypto.createHash("sha256").update(JSON.stringify(values)).digest("hex").slice(0, 16);

function upserts(table, cols, rows) {
  const all = [...cols, "catalog_hash"];
  const updates = all.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ");
  return [
    ...rows.map((r) => {
      r.catalog_hash = hash(cols.map((c) => r[c]));
      return `INSERT INTO ${table} (${all.join(", ")}, created_at, updated_at) VALUES (${all.map((c) => q(r[c])).join(", ")}, ${NOW}, ${NOW})\n` +
        `  ON CONFLICT (id) DO UPDATE SET ${updates}, deleted_at = NULL, updated_at = ${NOW}\n` +
        `  WHERE ${table}.catalog_hash IS NOT excluded.catalog_hash OR ${table}.deleted_at IS NOT NULL;`;
    }),
    `UPDATE ${table} SET published = 0, deleted_at = ${NOW}, updated_at = ${NOW} WHERE deleted_at IS NULL${rows.length ? ` AND id NOT IN (${rows.map((r) => q(r.id)).join(", ")})` : ""};`
  ];
}

function platformSql(data) {
  const projects = data.projects.map((p) => ({
    id: p.id, name: p.name, features: JSON.stringify(p.features || []), published: p.draft ? 0 : 1
  }));
  const polls = data.polls.map((p) => ({
    id: p.id, project_id: p.project, question: p.question,
    options: JSON.stringify((p.options || []).map((o) => ({ id: o.id, label: o.label }))),
    opens_at: p.opens ? `${p.opens}T00:00:00.000Z` : null,
    closes_at: p.closes ? `${p.closes}T23:59:59.999Z` : null,
    published: p.draft ? 0 : 1
  }));
  return [
    "-- Platform sync: projects and polls (data/projects.js, data/polls.js).",
    ...upserts("projects", ["id", "name", "features", "published"], projects),
    ...upserts("polls", ["id", "project_id", "question", "options", "opens_at", "closes_at", "published"], polls)
  ].join("\n") + "\n";
}

module.exports = { platformSql };
