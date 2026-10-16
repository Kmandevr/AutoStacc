-- Paid creator storage (server/billing/, docs/creators.md "Paid storage"): a creator's chosen storage limit above the
-- free allowance, one measurement a day of what they store, a statement a month for what was above the allowance, and a
-- log of every billing change the creator and AutoStacc can both read. Separate from the budget guard (usage_meters):
-- that guards AutoStacc's own Cloudflare bill; this is what a creator pays for storage they choose to use.

-- The upload limit a creator's paid storage gives them while it's in good standing (written only by server/billing/
-- through creators.setPaidStorage; NULL = none). Read by quotaOf (server/creators/policy.js).
ALTER TABLE creators ADD COLUMN storage_paid_bytes INTEGER;

-- One plan per creator. status: active (paid limit applies), past_due (a statement wasn't paid in time: the paid limit is
-- withdrawn, files stay), cancelled (no paid limit; still charged for storage above the allowance until back under it),
-- ended (back under the allowance after cancelling: nothing more is charged).
CREATE TABLE storage_plans (
  creator_id TEXT PRIMARY KEY REFERENCES creators(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'past_due', 'cancelled', 'ended')),
  cap_bytes INTEGER NOT NULL CHECK (cap_bytes > 0),
  started_at TEXT NOT NULL,
  cancelled_at TEXT,
  ended_at TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

-- What a creator stored on one day (UTC), measured once by the daily sweep, with the allowance, the billable part and the
-- rate that applied that day (hundredths of a cent per GB-month; NULL while billing is off). A day missing here is never
-- charged. by_part: the same total split by kind (server/creators/storage.js PARTS), so creators can check it.
CREATE TABLE storage_usage_days (
  creator_id TEXT NOT NULL REFERENCES creators(id),
  day TEXT NOT NULL,
  used_bytes INTEGER NOT NULL,
  included_bytes INTEGER NOT NULL,
  billable_bytes INTEGER NOT NULL,
  rate INTEGER,
  by_part TEXT NOT NULL DEFAULT '{}',
  measured_at TEXT NOT NULL,
  PRIMARY KEY (creator_id, day)
);

-- One statement per creator and month ('YYYY-MM'), issued once (the unique key) after the month ends.
-- usage_cents: that month's charge; carried_in_cents: an earlier amount too small to charge (under the card minimum);
-- amount_cents = both. status: nothing_due, carried (too small, moved to next month's statement), open, paid, waived
-- (AutoStacc cancelled it), refunded. due_at: the end of the grace period.
CREATE TABLE storage_statements (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES creators(id),
  period TEXT NOT NULL,
  days_in_period INTEGER NOT NULL,
  days_measured INTEGER NOT NULL,
  billable_byte_days INTEGER NOT NULL,
  usage_cents INTEGER NOT NULL,
  carried_in_cents INTEGER NOT NULL DEFAULT 0,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('nothing_due', 'carried', 'open', 'paid', 'waived', 'refunded')),
  issued_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  provider TEXT,
  provider_session_id TEXT,
  provider_payment_id TEXT,
  checkout_attempts INTEGER NOT NULL DEFAULT 0,
  livemode INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT,
  refunded_cents INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  UNIQUE (creator_id, period)
);
CREATE INDEX storage_statements_status ON storage_statements(status, due_at);
CREATE INDEX storage_statements_session ON storage_statements(provider, provider_session_id);
CREATE INDEX storage_statements_payment ON storage_statements(provider, provider_payment_id);

-- Every billing change, for the creator's own history and for disputes: plan changes, statements, payments, failures,
-- refunds, waivers. actor: 'system', or the account id that did it.
CREATE TABLE storage_billing_log (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES creators(id),
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  statement_id TEXT,
  detail TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX storage_billing_log_creator ON storage_billing_log(creator_id, at);
