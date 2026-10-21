-- The code-based product system is retired (owner, 2026-10-21, #176 and #173): data/products.js, data/stacclets.js and
-- data/pacs.js are gone and db/catalog.sql no longer syncs products, Stacclets or Pacs, so whatever that sync left
-- behind (source 'catalog') is unpublished and marked deleted here, once. Products are made in the Studio like every
-- creator's. Forward-only and never dropped: orders, entitlements and files still point at these rows. Creators,
-- projects and polls are still synced from data/ (scripts/lib/platform-catalog.js).
UPDATE products SET published = 0, deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE source = 'catalog' AND deleted_at IS NULL;

UPDATE stacclets SET published = 0, deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE source = 'catalog' AND deleted_at IS NULL;

UPDATE pacs SET published = 0, deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE source = 'catalog' AND deleted_at IS NULL;
