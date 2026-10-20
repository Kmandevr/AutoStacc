-- Community moderation (docs/community.md, "Who enforces what"; issue #137): appeals of a space team's decisions,
-- an index for a take's or post's latest moderation (the author's notice says why), and one open report per person
-- and item.
--
-- An appeal: the author of a take or post that a space's team hid or removed under its rules asks the team to look
-- again, once per take or post. status: open, granted (it's back) or refused. A removal for a legal reason isn't
-- appealed here (copyright counter-notices and AutoStacc's own decisions go through /copyright and support).
-- Deleted with the account (features/moderation erase).
CREATE TABLE community_appeals (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES community_spaces(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('thread', 'post')),
  target_id TEXT NOT NULL,
  user_id TEXT,
  note TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'granted', 'refused')),
  handled_by TEXT,
  handled_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (target_type, target_id)
);
CREATE INDEX community_appeals_queue ON community_appeals(space_id, status, created_at);
CREATE INDEX community_appeals_user ON community_appeals(user_id);

-- One open report per person and item (reports sent at the same moment can't double up; security review).
CREATE UNIQUE INDEX community_reports_one_open ON community_reports(target_type, target_id, reporter_user_id) WHERE status = 'open';

CREATE INDEX community_mod_log_target ON community_mod_log(target_type, target_id, at);
