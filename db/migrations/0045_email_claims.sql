-- A send in flight: sendEmail claims its dedupe key here before mailing, so two requests with the same key at once
-- can't both send (the check against email_events alone has a gap). The row is removed when the send is recorded;
-- one left behind by a crash expires after a few minutes. Holds a key (which can embed an address) only that long.
CREATE TABLE email_claims (
  dedupe_key TEXT PRIMARY KEY,
  claimed_at TEXT NOT NULL
);
