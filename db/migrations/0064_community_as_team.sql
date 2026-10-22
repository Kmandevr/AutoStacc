-- Posting as the space's team (docs/community.md, "Post as"): a take or reply a team member posts under the space's
-- name (AutoStacc in AutoStacc's own space, the project's name in a project space). The name is kept as it was
-- shown at posting time; NULL means the author's own community name.
ALTER TABLE community_threads ADD COLUMN as_team TEXT;
ALTER TABLE community_posts ADD COLUMN as_team TEXT;
