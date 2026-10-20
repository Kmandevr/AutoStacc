-- Copyright notices and strikes (docs/community-safety.md, "Copyright: tiered strikes"; docs/decisions.md 2026-10-20;
-- issue #137): server/copyright/ owns these tables.
--
-- A notice: a claim that something on AutoStacc infringes. source: email (an admin records one sent to the support
-- address) or form (the public form, a later step). status: received, accepted (valid: strikes given), rejected, or
-- withdrawn by the claimant. The claimant's details are kept as the notice gave them; the uploader never sees them
-- (a counter-notice's details go to the claimant, as the law requires).
CREATE TABLE copyright_notices (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('email', 'form')),
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'accepted', 'rejected', 'withdrawn')),
  claimant_name TEXT NOT NULL,
  claimant_email TEXT NOT NULL,
  claimant_address TEXT NOT NULL DEFAULT '',
  work TEXT NOT NULL,
  location TEXT NOT NULL,
  statements_at TEXT,
  creator_id TEXT,
  uploader_user_id TEXT,
  decided_by TEXT,
  decided_at TEXT,
  decision_note TEXT NOT NULL DEFAULT '',
  withdrawn_by TEXT,
  withdrawn_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX copyright_notices_status ON copyright_notices(status, created_at);

-- A strike against an account (the uploader) or a creator space. units: 2 a whole strike, 1 a half (a member's strike
-- counts half for the space; the owner's own upload counts whole; docs/decisions.md). Active while state is active and
-- expires_at is ahead: levels are computed when asked (server/copyright/standing.js), so expiry needs no sweep.
CREATE TABLE copyright_strikes (
  id TEXT PRIMARY KEY,
  notice_id TEXT NOT NULL REFERENCES copyright_notices(id),
  subject TEXT NOT NULL CHECK (subject IN ('account', 'creator')),
  subject_id TEXT NOT NULL,
  units INTEGER NOT NULL CHECK (units IN (1, 2)),
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'countered', 'withdrawn')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ended_by TEXT,
  ended_at TEXT,
  ended_note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX copyright_strikes_subject ON copyright_strikes(subject, subject_id, state, expires_at);
CREATE INDEX copyright_strikes_notice ON copyright_strikes(notice_id);

-- An admin keeping an account or space at the top level after its strikes expire (serious cases; docs/community-safety.md).
CREATE TABLE copyright_holds (
  subject TEXT NOT NULL CHECK (subject IN ('account', 'creator')),
  subject_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (subject, subject_id)
);
