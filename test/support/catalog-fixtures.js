// Dev-only first-party store fixtures, seeded by scripts/dev.js into the local store (never into data/, the deploy or
// production): six test products (the former placeholders, removed by the owner, 2026-10-21, #173; real ones are made
// in the Studio), the frayed-signals Stacclet and its four Pacs, and one test event. Rows keep the shape the retired
// catalog sync gave them (source 'catalog', same ids, prices and Pacs) so the suites keep working; fixtureSql() writes
// them. Nothing here is a fact about the artist. An ES module (test/ is "type": "module"); dev.js loads it with require().
import { createHash } from "node:crypto";
import * as V from "../../server/discovery/vocabulary.js";

const G = "glitches-and-stitches";
export const PRODUCTS = [
  { id: "sample-pack-vol1", title: "Frayed Signals — Sample Pack Vol. 1", type: "sample-pack", price: 24.99, hue: 300, featured: true,
    description: "300+ one-shots, glitch loops, bit-crushed vocal chops and stitched-together drum fills. WAV, 24-bit.",
    tags: ["wav", "one-shots", "loops"], facets: { style: ["glitch"], contents: ["one-shots", "loops", "vocals"], format: ["wav"] },
    specs: { bitDepth: 24 }, pacs: ["frayed-signals-samples", "frayed-signals-loops"] },
  { id: "serum-presets", title: "Seam Ripper — Serum Preset Bank", type: "presets", price: 19.99, hue: 190, featured: true,
    description: "64 Serum presets: tearing basses, stuttering leads and the signature wobble from the live sets.",
    tags: ["serum", "presets"], facets: { contents: ["presets"], plugin: ["serum"] } },
  { id: "stems-patchwork", title: "Patchwork (Remix Stems)", type: "stems", price: 9.99, hue: 40, featured: true,
    description: "Full stem set for the single 'Patchwork'. Remix it, flip it, send it back to us.",
    tags: ["stems", "remix"], facets: { contents: ["stems"], use: ["remixing"] } },
  { id: "ep-corrupted-thread", title: "Corrupted Thread EP (Lossless)", type: "music", price: 7.00, hue: 330,
    description: "The 5-track EP in FLAC and WAV, plus 2 bonus tracks only available here.",
    tags: ["flac", "wav"], facets: { contents: ["tracks"], format: ["flac", "wav"] } },
  { id: "wallpapers", title: "Static Bloom — Wallpaper Pack", type: "visuals", price: 3.00, hue: 260,
    description: "12 phone and desktop wallpapers pulled from the live visuals.",
    tags: ["wallpapers"], facets: { contents: ["images"], use: ["wallpapers"] } },
  { id: "vj-loops", title: "Live Set VJ Loops", type: "vj-loops", price: 14.99, hue: 160, metadata: { Resolution: "4K" },
    description: "20 seamless 4K glitch loops from the tour visuals, ready for Resolume.",
    tags: ["4k", "resolume"], facets: { style: ["glitch"], contents: ["video-loops"], plugin: ["resolume"] } }
].map((p) => ({ project: G, featured: false, ...p }));

// A Stacclet and its Pacs, unpublished as the catalog left them; the sample pack sells two of the Pacs.
export const STACCLETS = [{ id: "frayed-signals", project: G, title: "Frayed Signals", description: "Material around the Frayed Signals sample pack." }];
export const PACS = [["midi", "MIDI Pac"], ["samples", "Samples Pac"], ["loops", "Loops Pac"], ["presets", "Presets Pac"]]
  .map(([k, title]) => ({ id: `frayed-signals-${k}`, stacclet: "frayed-signals", project: G, title }));

// A published event far enough ahead to stay "upcoming" (a test date, not a real one).
export const EVENTS = [
  { id: "shw_devtestshow", slug: "dev-test-event", project: G, title: "Dev Test Venue, Test City", date: "2099-06-01", city: "Test City", venue: "Dev Test Venue", ticketUrl: "https://tickets.example.org/dev" }
];

const q = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const upsert = (table, row, where = "") => {
  const cols = Object.keys(row);
  return `INSERT INTO ${table} (${cols.join(", ")}, created_at, updated_at) VALUES (${cols.map((c) => q(row[c])).join(", ")}, ${NOW}, ${NOW})\n` +
    `  ON CONFLICT (id) DO UPDATE SET ${cols.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ")}, deleted_at = NULL, updated_at = ${NOW}${where};`;
};

// A product's row as the catalog sync wrote it (facets cleaned against the vocabulary; the project's genres when the
// kind has genres), plus its facet rows. types: data/product-types.js; projects: data/projects.js.
function productSql(p, types, projects) {
  const project = projects.find((x) => x.id === p.project);
  const facets = V.cleanFacets(p.type, p.facets).facets;
  if (!facets.genre && V.schemaOf(p.type).facets.includes("genre") && project) {
    const genres = [...new Set((project.genres || []).map((g) => V.canonical("genre", g)).filter(Boolean))];
    if (genres.length) facets.genre = genres;
  }
  const specs = V.cleanSpecs(p.type, p.specs || {}).specs;
  const row = {
    id: p.id, title: p.title, description: p.description, type: p.type, price_cents: Math.round(p.price * 100), currency: "USD",
    artwork: null, preview: null, tags: JSON.stringify(p.tags), release_id: null,
    metadata: JSON.stringify({ ...(p.metadata || {}), hue: p.hue, ...(Object.keys(specs).length ? { specs } : {}) }),
    featured: p.featured ? 1 : 0, published: 1, max_quantity: (types[p.type] || {}).maxQuantity || 1, project_id: p.project,
    pacs: JSON.stringify(p.pacs || []), search_text: V.searchText({ title: p.title, description: p.description, tags: p.tags, facets, by: project ? project.name : "" }),
    bpm_min: null, bpm_max: null, released_at: null, source: "catalog"
  };
  row.catalog_hash = createHash("sha256").update(JSON.stringify(Object.values(row))).digest("hex").slice(0, 16);
  return [upsert("products", row, " WHERE products.source = 'catalog'"),
    `DELETE FROM product_facets WHERE product_id = ${q(p.id)} AND origin = 'creator';`,
    ...Object.entries(facets).flatMap(([f, values]) => values.map((v) =>
      `INSERT OR REPLACE INTO product_facets (product_id, facet, value, origin) VALUES (${q(p.id)}, ${q(f)}, ${q(v)}, 'creator');`))];
}

// Every fixture as SQL statements, applied after db/catalog.sql (which adds the project they belong to).
export function fixtureSql(types, projects) {
  const T = NOW;
  return [
    ...PRODUCTS.flatMap((p) => productSql(p, types, projects)),
    ...STACCLETS.map((s) => upsert("stacclets", { id: s.id, project_id: s.project, title: s.title, description: s.description, source: "catalog", published: 0 })),
    ...PACS.map((p) => upsert("pacs", { id: p.id, stacclet_id: p.stacclet, project_id: p.project, title: p.title, description: null, source: "catalog", published: 0 })),
    ...EVENTS.map((e) => `INSERT OR IGNORE INTO project_events (id, project_id, slug, title, event_date, city, venue, country, ticket_url, published, created_at, updated_at)
       SELECT ${[e.id, e.project, e.slug, e.title, e.date, e.city, e.venue, "", e.ticketUrl].map(q).join(", ")}, 1, ${T}, ${T} WHERE EXISTS (SELECT 1 FROM projects WHERE id = ${q(e.project)});`)
  ];
}
