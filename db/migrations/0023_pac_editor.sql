-- Building a Pac one thing at a time (docs/packs.md, "Pac editor"; owner, 2026-10-15). A checked, unpublished version
-- takes additions: each is one or more files (sent as a small archive, uploads.kind 'file') checked by its own engine
-- job and merged into the version, which stays 'ready' throughout, so a failed addition never touches the version or
-- its edits. One open addition per version at a time. And up to three public preview clips per Pac.
CREATE TABLE pac_additions (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES pac_versions(id),
  -- Where its files go (NULL: the top); a folder removed meanwhile means the top.
  folder_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('uploading', 'processing', 'done', 'failed')),
  idempotency_key TEXT NOT NULL UNIQUE,
  -- What it added and refused, and its own automated review (merged into the version's).
  stats TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX pac_additions_version ON pac_additions(version_id, status);
CREATE UNIQUE INDEX pac_additions_open ON pac_additions(version_id) WHERE status IN ('uploading', 'processing');
ALTER TABLE uploads ADD COLUMN addition_id TEXT;
ALTER TABLE processing_jobs ADD COLUMN addition_id TEXT;

-- A Pac's preview clips (0 to 3), public on its products' pages and in Your Stacc: uploaded, or cut from one of the
-- Pac's own audio files in the creator's browser (source_asset_id: which one, as the creator said).
CREATE TABLE pac_previews (
  id TEXT PRIMARY KEY,
  pac_id TEXT NOT NULL REFERENCES pacs(id),
  sort INTEGER NOT NULL CHECK (sort BETWEEN 0 AND 2),
  title TEXT NOT NULL DEFAULT '',
  r2_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  source_asset_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (pac_id, sort)
);
