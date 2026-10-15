-- The community library (owner, 2026-10-15; docs/builder.md, phase 8): sections, elements and whole-site templates
-- that trusted creators share with every creator, free or for sale. A piece is a checked fragment of a site document
-- (server/library/pieces.js); its images stay the seller's files and count against the seller only.
-- status: active (listed), deleted (by its creator: no longer listed; sites that installed it keep it), removed (taken
-- down by AutoStacc: unlisted, its product off sale and its images no longer shown anywhere).
-- product_id: the store product a paid piece is sold as (type 'template'); owning it lets a buyer install the piece.
CREATE TABLE library_pieces (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES creators(id),
  kind TEXT NOT NULL CHECK (kind IN ('element', 'section', 'template')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  fragment TEXT NOT NULL,
  assets TEXT NOT NULL DEFAULT '[]',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  price_cents INTEGER NOT NULL DEFAULT 0,
  product_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted', 'removed')),
  removed_note TEXT,
  installs INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX library_pieces_list ON library_pieces(status, kind, created_at);
CREATE INDEX library_pieces_creator ON library_pieces(creator_id, status);
CREATE UNIQUE INDEX library_pieces_product ON library_pieces(product_id) WHERE product_id IS NOT NULL;

-- Which creators installed which pieces: their sites may then show the piece's images.
CREATE TABLE library_installs (
  piece_id TEXT NOT NULL REFERENCES library_pieces(id),
  creator_id TEXT NOT NULL REFERENCES creators(id),
  installed_by TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (piece_id, creator_id)
);
CREATE INDEX library_installs_creator ON library_installs(creator_id);

-- Reports from signed-in people, one per person and piece, for the Control Center.
CREATE TABLE library_reports (
  id TEXT PRIMARY KEY,
  piece_id TEXT NOT NULL REFERENCES library_pieces(id),
  reporter_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE (piece_id, reporter_id)
);

-- A site file of a deleted piece that installed sites still use: no longer the seller's to see or count, kept until
-- no site uses it (the daily sweep, server/library/sweep.js).
ALTER TABLE site_assets ADD COLUMN released_at TEXT;
