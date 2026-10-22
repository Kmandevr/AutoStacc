-- Welcome messages (feature welcome): a space's message, and who has seen it (first visit or first post).
CREATE TABLE community_welcome (
  space_id TEXT PRIMARY KEY REFERENCES community_spaces(id),
  message TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE community_welcome_seen (
  user_id TEXT NOT NULL,
  space_id TEXT NOT NULL REFERENCES community_spaces(id),
  PRIMARY KEY (user_id, space_id)
);
