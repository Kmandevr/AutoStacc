-- Creators sell from the Studio (docs/creators.md): who made a Studio product, and payout requests. A creator's money
-- is the creator_share_cents already recorded on each order line; a payout request asks the owner to pay out what has
-- cleared the hold. The owner pays by hand for now and marks the request paid (server/revenue/, server/admin/payouts.js).
-- Forward-only; nothing existing is rewritten.
ALTER TABLE products ADD COLUMN created_by TEXT;
CREATE INDEX products_project_source ON products(project_id, source);

CREATE TABLE payout_requests (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES creators(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'paid', 'declined')),
  payout_details TEXT,
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  handled_by TEXT,
  handled_at TEXT,
  admin_note TEXT
);
CREATE INDEX payout_requests_creator ON payout_requests(creator_id, status);
-- One open request per creator at a time, enforced by the database so two clicks can't both succeed.
CREATE UNIQUE INDEX payout_requests_one_open ON payout_requests(creator_id) WHERE status = 'requested';
