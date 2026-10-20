-- Fully nested replies (owner, 2026-10-20; docs/community.md, "Look and words"): a reply may answer another post in the
-- same thread. NULL is a reply to the take itself (and the opening post). Nothing writes it while community.forum is off.
ALTER TABLE community_posts ADD COLUMN parent_post_id TEXT;
CREATE INDEX community_posts_parent ON community_posts(parent_post_id);
