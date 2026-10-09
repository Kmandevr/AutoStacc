-- Store discovery: structured product details for filters, search and recommendations (server/discovery/), and
-- wishlists (server/wishlist/). Forward-only: new columns and tables; nothing existing changes meaning.

-- What search matches (title, description, tags, facet labels, maker), written with the product (catalog sync, Studio).
ALTER TABLE products ADD COLUMN search_text TEXT NOT NULL DEFAULT '';
-- Tempo range for kinds that have one (both NULL when unknown or not applicable).
ALTER TABLE products ADD COLUMN bpm_min INTEGER;
ALTER TABLE products ADD COLUMN bpm_max INTEGER;
-- When it came out, if the data says; otherwise "recently added" falls back to created_at.
ALTER TABLE products ADD COLUMN released_at TEXT;

-- One row per (product, facet, value) from the controlled vocabulary (server/discovery/vocabulary.js). Owned by the
-- product's writer (catalog sync or the Studio); derived scores never live here.
CREATE TABLE product_facets (
  product_id TEXT NOT NULL REFERENCES products(id),
  facet TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (product_id, facet, value)
);
CREATE INDEX product_facets_value ON product_facets(facet, value, product_id);

-- A signed-in person's saved products. Deleted with the account; included in the data export.
CREATE TABLE wishlist_items (
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, product_id)
);
CREATE INDEX wishlist_items_product ON wishlist_items(product_id);

-- The store's common reads: visible products by kind, creator and age; confirmed purchases per product over time.
CREATE INDEX products_visible_type ON products(published, deleted_at, type);
CREATE INDEX products_visible_project ON products(published, deleted_at, project_id);
CREATE INDEX entitlements_purchases ON entitlements(product_id, granted_at) WHERE source_type = 'purchase' AND status = 'active';

-- Studio products made before this have no search text yet: start from what they have (their next edit refreshes it).
UPDATE products SET search_text = lower(title || ' ' || description || ' ' || replace(replace(replace(tags, '[', ''), ']', ''), '"', ''))
  WHERE source = 'studio';
