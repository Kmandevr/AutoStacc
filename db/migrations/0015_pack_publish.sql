-- Publishing Pac versions into products (docs/packs.md, Phase 3). A version names the product it publishes into and
-- the owner whose stored originals (blobs) it uses ('autostacc' for first-party Pacs, a creator id for Studio ones).
-- Published files keep their product_files.id while their bytes don't change (one live row per product and asset).
-- Rows backed by a stored original carry the placeholder r2_key 'blob/<product_files.id>' so that column stays unique
-- without rebuilding the table; their real key is blobs.r2_key (server/files/files.js storageKeyOf). Forward-only.
ALTER TABLE pac_versions ADD COLUMN product_id TEXT;
ALTER TABLE pac_versions ADD COLUMN owner_scope TEXT;
ALTER TABLE processing_jobs ADD COLUMN attempt_used INTEGER;
CREATE INDEX pac_versions_pac ON pac_versions(pac_id, status);
CREATE INDEX product_files_version ON product_files(version_id);
CREATE UNIQUE INDEX product_files_live_asset ON product_files(product_id, asset_id) WHERE asset_id IS NOT NULL AND retired_at IS NULL;
