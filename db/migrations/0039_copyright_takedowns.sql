-- Copyright takedowns and counter-notices (docs/copyright.md, step 3; issue #137).
--
-- A product file held by a copyright notice: it reaches nobody (server/files/files.js DELIVERABLE), past buyers
-- included (owner, 2026-10-20), but stays active so its bytes are kept while a counter-notice could bring it back.
ALTER TABLE product_files ADD COLUMN held_at TEXT;

-- What an accepted notice took down, through each owning module (server/copyright/targets.js), and when it came back.
CREATE TABLE copyright_notice_targets (
  notice_id TEXT NOT NULL REFERENCES copyright_notices(id),
  kind TEXT NOT NULL CHECK (kind IN ('product_file', 'thread', 'post')),
  target_id TEXT NOT NULL,
  removed_at TEXT,
  restored_at TEXT,
  PRIMARY KEY (notice_id, kind, target_id)
);

-- A counter-notice from the person whose upload was taken down: their details (passed to the claimant, as the law
-- requires), statements and signature. status: waiting (restored after restore_after, and only once the claimant was
-- emailed it: claimant_told_at, unless the claimant says they've gone to court), restored, sued, withdrawn. One per notice.
CREATE TABLE copyright_counter_notices (
  id TEXT PRIMARY KEY,
  notice_id TEXT NOT NULL UNIQUE REFERENCES copyright_notices(id),
  user_id TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT NOT NULL,
  statements_at TEXT NOT NULL,
  signature TEXT NOT NULL,
  restore_after TEXT NOT NULL,
  claimant_told_at TEXT,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'restored', 'sued', 'withdrawn')),
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX copyright_counter_due ON copyright_counter_notices(status, restore_after);
