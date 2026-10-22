-- The community's notifications (core/notify.js): what features tell a person (a reply, a mention, a best-answer pick,
-- a followed take moving). One row per person and thing (ref is the post, or the take), so a retry or two features
-- telling the same person about the same post leaves one. read_at is set when they've seen it.
CREATE TABLE community_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('reply', 'mention', 'answer', 'followed')),
  ref TEXT NOT NULL,
  thread_id TEXT NOT NULL REFERENCES community_threads(id),
  post_id TEXT,
  actor_user_id TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT,
  UNIQUE (user_id, ref)
);
CREATE INDEX community_notifications_user ON community_notifications(user_id, created_at);
