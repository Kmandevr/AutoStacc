-- Takes and replies held for a space's team before anyone sees them (docs/community.md, "Links" and "Automatic
-- moderation"). A rule feature asks the core to hold a post (it is stored hidden); this row says why, and goes when the
-- team approves it (visible) or rejects it (removed under the space's rules).
CREATE TABLE community_holds (
  target_type TEXT NOT NULL CHECK (target_type IN ('thread', 'post')),
  target_id TEXT NOT NULL,
  space_id TEXT NOT NULL REFERENCES community_spaces(id),
  author_user_id TEXT,
  rule TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (target_type, target_id)
);
CREATE INDEX community_holds_space ON community_holds(space_id, created_at);
CREATE INDEX community_holds_author ON community_holds(author_user_id);
