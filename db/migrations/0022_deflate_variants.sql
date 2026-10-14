-- Deflate variants, and when files were removed. Deflate variants (docs/packs.md §8; server/downloads/variants.js, switch downloads.deflate): a small, compressible
-- stored original can have a raw-deflate copy at variants/<blob id>.deflate, used inside ZIP downloads instead of the
-- stored bytes. deflate_bytes is that copy's length (NULL: none); blobs.compress_ratio (0014) records the probe, so a
-- file that didn't compress well enough is never probed again.
ALTER TABLE blobs ADD COLUMN deflate_bytes INTEGER;

-- When a delivered file stopped being active (deleted, rejected, replaced, removed by an admin, or retired past its 30
-- days), from now on: its bytes are deleted a day later (server/files/retention.js) and count against its creator's
-- quota until then. Files removed before this have none: kept as they were, never purged automatically.
ALTER TABLE product_files ADD COLUMN removed_at TEXT;
