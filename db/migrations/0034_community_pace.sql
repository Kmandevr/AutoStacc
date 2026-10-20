-- The community's posting pace (owner, 2026-10-20; docs/community.md, "Features"): each space's slow mode, the wait in
-- seconds between one person's posts in that space (0 = off), set by the space's team. Owned by the pace feature
-- (server/community/features/pace/); nothing reads it while that feature is off.
ALTER TABLE community_spaces ADD COLUMN slow_mode_seconds INTEGER NOT NULL DEFAULT 0;
