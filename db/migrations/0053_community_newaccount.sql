-- New-account rules (feature newaccount): one row per space that set them. account_days: accounts younger than this
-- many days are "new" (0 = rule off); space_posts: people with fewer than this many visible posts in the space are
-- "new to it" (0 = off); mode: hold their posts for the team, or refuse posts with links.
CREATE TABLE community_newaccount_rules (
  space_id TEXT PRIMARY KEY REFERENCES community_spaces(id),
  account_days INTEGER NOT NULL DEFAULT 0 CHECK (account_days BETWEEN 0 AND 90),
  space_posts INTEGER NOT NULL DEFAULT 0 CHECK (space_posts BETWEEN 0 AND 20),
  mode TEXT NOT NULL DEFAULT 'hold' CHECK (mode IN ('hold', 'nolinks')),
  updated_at TEXT NOT NULL
);
