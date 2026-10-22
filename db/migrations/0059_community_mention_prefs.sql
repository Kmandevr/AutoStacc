-- Mention alerts (feature mentions): a person who switched them off. No row means on.
CREATE TABLE community_mention_prefs (
  user_id TEXT PRIMARY KEY,
  alerts INTEGER NOT NULL DEFAULT 1
);
