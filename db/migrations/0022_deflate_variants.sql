-- Deflate variants (docs/packs.md §8; server/downloads/variants.js, switch downloads.deflate): a small, compressible
-- stored original can have a raw-deflate copy at variants/<blob id>.deflate, used inside ZIP downloads instead of the
-- stored bytes. deflate_bytes is that copy's length (NULL: none); blobs.compress_ratio (0014) records the probe, so a
-- file that didn't compress well enough is never probed again.
ALTER TABLE blobs ADD COLUMN deflate_bytes INTEGER;
