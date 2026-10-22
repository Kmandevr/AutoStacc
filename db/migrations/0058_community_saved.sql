-- Save for later (feature saved): a person's private list of takes.
CREATE TABLE community_saved (
  user_id TEXT NOT NULL,
  thread_id TEXT NOT NULL REFERENCES community_threads(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, thread_id)
);
