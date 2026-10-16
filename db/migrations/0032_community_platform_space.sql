-- AutoStacc's own community space and the channels the owner chose (docs/community.md, 2026-10-16): Announcements
-- (AutoStacc's team only), Help & questions, Feedback & ideas, Show your Stacc and Challenges. Run by AutoStacc's
-- admins, so it has no founder row. Nothing shows while the community.forum switch is off.
INSERT INTO community_spaces (id, slug, name, name_key, kind, official, description, state, last_team_activity_at, created_at)
VALUES ('spc_autostacc', 'autostacc', 'AutoStacc', 'autostacc', 'platform', 1,
  'AutoStacc''s own space: announcements, help with the site, feedback and ideas, and what people make.', 'open',
  '2026-10-16T00:00:00.000Z', '2026-10-16T00:00:00.000Z');

INSERT INTO community_channels (id, space_id, slug, name, position, post_types, who_may_start, created_at) VALUES
  ('chn_autostacc_announcements', 'spc_autostacc', 'announcements', 'Announcements', 0, 'update,discussion', 'team', '2026-10-16T00:00:00.000Z'),
  ('chn_autostacc_help', 'spc_autostacc', 'help', 'Help & questions', 1, 'question,discussion', 'everyone', '2026-10-16T00:00:00.000Z'),
  ('chn_autostacc_feedback', 'spc_autostacc', 'feedback', 'Feedback & ideas', 2, 'discussion,question', 'everyone', '2026-10-16T00:00:00.000Z'),
  ('chn_autostacc_show', 'spc_autostacc', 'show-your-stacc', 'Show your Stacc', 3, 'discussion', 'everyone', '2026-10-16T00:00:00.000Z'),
  ('chn_autostacc_challenges', 'spc_autostacc', 'challenges', 'Challenges', 4, 'discussion', 'team', '2026-10-16T00:00:00.000Z');
