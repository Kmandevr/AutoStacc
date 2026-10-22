-- The spotlight's hand-picked items (owner, 2026-10-22; server/spotlight/): each browse page's banner shows these first,
-- in order, and the page fills the rest with a fair rotation of what it already lists. kind: project, creator,
-- community, product, release or event; ref_id: that thing's id. Nothing else about the item is copied here.
CREATE TABLE spotlight_picks (
  id TEXT PRIMARY KEY,
  page TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (page, kind, ref_id)
);
