-- Personal organization in Your Stacc (docs/packs.md, Phase 6b; server/collections/): a signed-in person's own
-- collections, tags and saved searches. Items point at an item key: the file's asset (the same across a Pac's
-- versions, so items survive revisions) or, for a file with no asset, the file's id. Only ever read and written by
-- their owner; deleted with the account and part of the data export. Forward-only: new tables only.
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX collections_user_name ON collections(user_id, lower(name));
CREATE TABLE collection_items (
  collection_id TEXT NOT NULL REFERENCES collections(id),
  item_key TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (collection_id, item_key)
);
CREATE TABLE asset_tags (
  user_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, item_key, tag)
);
CREATE INDEX asset_tags_user_tag ON asset_tags(user_id, tag);
CREATE TABLE saved_searches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  query TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX saved_searches_user ON saved_searches(user_id);
