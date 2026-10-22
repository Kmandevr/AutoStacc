-- Joining a space (feature joined): the spaces whose takes come first on someone's front page.
CREATE TABLE community_space_joins (
  user_id TEXT NOT NULL,
  space_id TEXT NOT NULL REFERENCES community_spaces(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, space_id)
);
