-- What a product's published files contain (docs/packs.md, Phase 7; server/discovery/contents.js): worked out from the
-- files' published details each time a Pac version is published, never typed in. summary: { files, bytes, kinds,
-- facets: { facet: { value: count } }, bpm } for the product page; bpm_min/bpm_max: the files' tempo range, used by the
-- store's BPM filter when the creator gave none; indexed: 1 while its facet values are in product_facets (origin
-- 'derived'). A table of its own because the catalog sync rewrites catalog products' own columns on every deploy.
-- Forward-only: one new table.
CREATE TABLE product_contents (
  product_id TEXT PRIMARY KEY REFERENCES products(id),
  summary TEXT NOT NULL DEFAULT '{}',
  bpm_min INTEGER,
  bpm_max INTEGER,
  indexed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
