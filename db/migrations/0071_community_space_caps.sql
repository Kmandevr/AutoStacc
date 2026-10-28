-- Per-account exceptions to the communities-per-account cap (owner, 2026-10-27, #214): AutoStacc may let one account
-- start more (or fewer) communities than community_space_cap in Settings › Switches. One row per account; without a
-- row the site-wide number applies. Set and removed in the Control Center (audited); deleted with the account.
CREATE TABLE community_space_caps (
  user_id TEXT PRIMARY KEY,
  cap INTEGER NOT NULL CHECK (cap BETWEEN 0 AND 99),
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL
);
