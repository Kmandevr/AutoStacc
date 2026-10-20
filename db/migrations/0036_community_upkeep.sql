-- Community upkeep (docs/community-safety.md, "Retention"; issue #137): when a take or post was removed, so the daily
-- sweep can delete its text 12 months later (server/community/core/retention.js). Anything already removed counts
-- from now.
ALTER TABLE community_posts ADD COLUMN removed_at TEXT;
ALTER TABLE community_threads ADD COLUMN removed_at TEXT;
UPDATE community_posts SET removed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE state = 'removed';
UPDATE community_threads SET removed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE state = 'removed';
CREATE INDEX community_posts_removed ON community_posts(removed_at) WHERE removed_at IS NOT NULL;
CREATE INDEX community_threads_removed ON community_threads(removed_at) WHERE removed_at IS NOT NULL;
