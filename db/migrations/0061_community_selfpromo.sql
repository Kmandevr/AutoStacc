-- Self-promotion rule (feature selfpromo): where a space's team switched it off. channel_id '' means the whole space.
CREATE TABLE community_selfpromo_off (
  space_id TEXT NOT NULL REFERENCES community_spaces(id),
  channel_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (space_id, channel_id)
);
