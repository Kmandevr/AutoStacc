-- Pattern rules (feature patterns): a space team's "if a post matches, then hold or refuse it", built from a form.
CREATE TABLE community_pattern_rules (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES community_spaces(id),
  name TEXT NOT NULL,
  field TEXT NOT NULL CHECK (field IN ('title', 'body', 'any')),
  test TEXT NOT NULL CHECK (test IN ('contains', 'starts', 'link', 'caps', 'short')),
  value TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL CHECK (action IN ('hold', 'refuse')),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX community_pattern_rules_space ON community_pattern_rules(space_id);
