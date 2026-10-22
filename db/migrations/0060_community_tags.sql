-- Tags on takes (feature tags): the few tags a space's team adds beyond AutoStacc's starter list (built from the store's
-- vocabulary in code), and the tags put on takes.
CREATE TABLE community_space_tags (
  space_id TEXT NOT NULL REFERENCES community_spaces(id),
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (space_id, key)
);
CREATE TABLE community_thread_tags (
  thread_id TEXT NOT NULL REFERENCES community_threads(id),
  tag TEXT NOT NULL,
  PRIMARY KEY (thread_id, tag)
);
CREATE INDEX community_thread_tags_tag ON community_thread_tags(tag);
