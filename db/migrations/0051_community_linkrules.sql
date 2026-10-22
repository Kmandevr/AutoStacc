-- Link approval (feature linkrules): the sites a space's team has allowed, beyond AutoStacc's own safe list.
CREATE TABLE community_allowed_links (
  space_id TEXT NOT NULL REFERENCES community_spaces(id),
  host TEXT NOT NULL,
  added_by TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (space_id, host)
);
