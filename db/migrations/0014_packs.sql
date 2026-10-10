-- Packs as assets (docs/packs.md, Phase 1): Stacclets and Pacs in the database, versions of a Pac's contents, the stored
-- originals (blobs, one per creator and SHA-256, shared by every version that keeps the file), folders, assets with
-- stable identities, their metadata with its origin, processing jobs, download bundles and monthly usage meters.
-- Forward-only: new tables and new nullable columns; nothing existing is rewritten. Nothing reads these yet except the
-- catalog sync of Stacclets and Pacs.

-- Stacclets and Pacs: synced from data/stacclets.js and data/pacs.js (source 'catalog', db/catalog.sql), or made in the
-- Studio (source 'studio', later). A Pac's project is its Stacclet's; it is kept here so queries don't join for it.
CREATE TABLE stacclets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL DEFAULT 'studio' CHECK (source IN ('catalog', 'studio')),
  published INTEGER NOT NULL DEFAULT 0,
  catalog_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX stacclets_project ON stacclets(project_id);

CREATE TABLE pacs (
  id TEXT PRIMARY KEY,
  stacclet_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL DEFAULT 'studio' CHECK (source IN ('catalog', 'studio')),
  published INTEGER NOT NULL DEFAULT 0,
  -- The version customers get, and the one being prepared (at most one draft at a time).
  live_version_id TEXT,
  draft_version_id TEXT,
  catalog_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX pacs_stacclet ON pacs(stacclet_id);
CREATE INDEX pacs_project ON pacs(project_id);

-- One version of a Pac's contents. Moves only forward (compare-and-set): draft → uploading → processing → ready →
-- (in_review) → published → superseded, or failed / discarded. A failed or discarded version never touches the live one.
CREATE TABLE pac_versions (
  id TEXT PRIMARY KEY,
  pac_id TEXT NOT NULL REFERENCES pacs(id),
  number INTEGER NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('zip', 'files', 'revision', 'import')),
  base_version_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'uploading', 'processing', 'ready', 'in_review', 'published', 'superseded', 'failed', 'discarded')),
  idempotency_key TEXT UNIQUE,
  -- Counts, sizes, the review's flags and, after publishing, what changed (JSON).
  stats TEXT NOT NULL DEFAULT '{}',
  engine_version TEXT,
  created_by TEXT,
  reviewed_by TEXT,
  review_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  UNIQUE (pac_id, number)
);
CREATE INDEX pac_versions_status ON pac_versions(status, updated_at);

-- Bytes on their way in (a ZIP or loose files under incoming/ in FILES), before the engine has checked them.
-- Deleted once the version is published or discarded; R2 itself aborts unfinished multipart uploads after 7 days.
CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES pac_versions(id),
  kind TEXT NOT NULL CHECK (kind IN ('zip', 'file')),
  filename TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  upload_id TEXT,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  sha256 TEXT,
  -- Multipart progress: [{ part, etag, size }].
  parts TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'complete', 'aborted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX uploads_version ON uploads(version_id);

-- Work for the processing engine (engine Worker and Container, docs/engine.md). The answer lives in R2 at result_key.
CREATE TABLE processing_jobs (
  id TEXT PRIMARY KEY,
  version_id TEXT REFERENCES pac_versions(id),
  kind TEXT NOT NULL,
  contract_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled')),
  attempt INTEGER NOT NULL DEFAULT 0,
  lease_until TEXT,
  progress TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  result_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX processing_jobs_version ON processing_jobs(version_id);
CREATE INDEX processing_jobs_status ON processing_jobs(status, updated_at);

-- A stored original, byte for byte: one per owner and SHA-256, so a file kept across versions is stored once (git-style).
-- owner_scope: a creator id, or 'autostacc' for first-party Pacs; files are never shared across owners. facts: what the
-- engine read from the file's own headers (immutable, tied to these bytes). delete_after: set when no live or draft
-- version uses it any more (buyers can still download it until then, docs/packs.md H8).
CREATE TABLE blobs (
  id TEXT PRIMARY KEY,
  owner_scope TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  crc32 INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  r2_key TEXT NOT NULL UNIQUE,
  format TEXT NOT NULL DEFAULT 'unknown',
  facts TEXT NOT NULL DEFAULT '{}',
  compress_ratio REAL,
  engine_version TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL,
  delete_after TEXT,
  UNIQUE (owner_scope, sha256)
);
CREATE INDEX blobs_delete_after ON blobs(delete_after) WHERE delete_after IS NOT NULL;

-- An asset's identity, kept across versions (a file renamed, moved or re-exported stays the same asset).
CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  pac_id TEXT NOT NULL REFERENCES pacs(id),
  created_at TEXT NOT NULL
);
CREATE INDEX assets_pac ON assets(pac_id);

-- Folders of one version. id stays the same across versions for the same folder, so its defaults follow a rename or move.
CREATE TABLE pac_folders (
  id TEXT NOT NULL,
  version_id TEXT NOT NULL REFERENCES pac_versions(id),
  parent_id TEXT,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  original_path TEXT,
  PRIMARY KEY (version_id, id)
);

-- A folder's defaults, set by its creator: inherited by every file below it unless the file says otherwise.
CREATE TABLE pac_folder_values (
  version_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  set_by TEXT,
  set_at TEXT NOT NULL,
  PRIMARY KEY (version_id, folder_id, field, value)
);

-- The manifest: which asset is which file in which folder in this version. original_path: where it was in the upload.
CREATE TABLE pac_entries (
  version_id TEXT NOT NULL REFERENCES pac_versions(id),
  asset_id TEXT NOT NULL REFERENCES assets(id),
  folder_id TEXT,
  filename TEXT NOT NULL,
  original_path TEXT,
  blob_id TEXT REFERENCES blobs(id),
  sort INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'uploaded', 'verified', 'refused')),
  error TEXT,
  PRIMARY KEY (version_id, asset_id)
);
-- One name per folder, ignoring case (Windows and macOS would merge them on download).
CREATE UNIQUE INDEX pac_entries_name ON pac_entries(version_id, IFNULL(folder_id, ''), lower(filename));
CREATE INDEX pac_entries_blob ON pac_entries(blob_id);

-- What is said about an asset, and by whom. origin: embedded (written into the file), filename / folder-name (read from
-- names), analysis / rule (the engine's suggestion), creator (the creator's own value, which always wins). Inferred
-- values stay 'suggested' until accepted; nothing inferred is ever shown as verified. basis_blob_id: the bytes a
-- suggestion was made from (a new version of the file makes it stale).
CREATE TABLE asset_values (
  asset_id TEXT NOT NULL REFERENCES assets(id),
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('embedded', 'filename', 'folder-name', 'analysis', 'rule', 'creator')),
  confidence REAL CHECK (confidence BETWEEN 0 AND 1),
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'accepted', 'rejected')),
  basis_blob_id TEXT,
  engine_version TEXT,
  set_by TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (asset_id, field, value, origin)
);

-- Published files point back at their asset, stored original and version; meta is the published snapshot of the
-- asset's resolved values (customers see it; drafts never change it). retired_at: the version that dropped this file
-- was published (it stays downloadable to earlier buyers for 30 days, docs/packs.md H8). All empty for older files.
ALTER TABLE product_files ADD COLUMN asset_id TEXT;
ALTER TABLE product_files ADD COLUMN blob_id TEXT;
ALTER TABLE product_files ADD COLUMN version_id TEXT;
ALTER TABLE product_files ADD COLUMN folder_path TEXT;
ALTER TABLE product_files ADD COLUMN meta TEXT;
ALTER TABLE product_files ADD COLUMN retired_at TEXT;
CREATE INDEX product_files_asset ON product_files(asset_id);

-- Store facets derived from a product's published contents (origin 'derived') are rewritten on publish; the creator's
-- own (origin 'creator', every existing row) are never touched by it.
ALTER TABLE product_facets ADD COLUMN origin TEXT NOT NULL DEFAULT 'creator';

-- A creator's own paid-file quota, set by an admin; empty means the free plan's (server/creators/policy.js, 500 MB).
ALTER TABLE creators ADD COLUMN files_quota_bytes INTEGER CHECK (files_quota_bytes >= 0);

-- Several files in one download (a folder, a Pac, a selection): the signed link names this row, which lists the files
-- the requester was entitled to when it was made; each is checked again when the download starts.
CREATE TABLE download_bundles (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  file_ids TEXT NOT NULL,
  layout_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX download_bundles_expires ON download_bundles(expires_at);

-- Monthly usage against the Workers Paid allowance (docs/packs.md, budget guard): container GiB-seconds, R2 bytes and
-- writes, engine jobs. month: 'YYYY-MM' (UTC).
CREATE TABLE usage_meters (
  month TEXT NOT NULL,
  meter TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (month, meter)
);
