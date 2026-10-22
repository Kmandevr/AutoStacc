-- A space's look (feature look): an accent colour and a banner, both picked from AutoStacc's presets.
CREATE TABLE community_space_look (
  space_id TEXT PRIMARY KEY REFERENCES community_spaces(id),
  accent TEXT NOT NULL,
  banner TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
