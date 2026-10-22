-- Word and phrase filters (feature wordfilter): a space team's own words; what a post containing one does.
CREATE TABLE community_filter_words (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES community_spaces(id),
  phrase TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('hold', 'refuse')),
  created_at TEXT NOT NULL,
  UNIQUE (space_id, phrase)
);
