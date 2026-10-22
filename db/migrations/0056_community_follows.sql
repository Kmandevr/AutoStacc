-- Following a take (feature follows): the people who hear about replies to it. auto = 1 when following came from
-- posting in it, so the page can tell "you follow this because you posted" from a choice.
CREATE TABLE community_thread_follows (
  user_id TEXT NOT NULL,
  thread_id TEXT NOT NULL REFERENCES community_threads(id),
  auto INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, thread_id)
);
CREATE INDEX community_thread_follows_thread ON community_thread_follows(thread_id);
