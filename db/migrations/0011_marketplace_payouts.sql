-- Creator sales are charged on a second Stripe account (the "marketplace" account, with Connect), because Stripe's
-- Managed Payments, which AutoStacc's own products use, doesn't allow marketplaces. Each order records which account took
-- the money; each creator can connect a Stripe payout account; a payout is a Stripe transfer to it.
ALTER TABLE orders ADD COLUMN payment_account TEXT NOT NULL DEFAULT 'main' CHECK (payment_account IN ('main', 'marketplace'));
ALTER TABLE creators ADD COLUMN stripe_account_id TEXT;
ALTER TABLE creators ADD COLUMN payout_country TEXT;
ALTER TABLE creators ADD COLUMN payouts_enabled INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX creators_stripe_account ON creators(stripe_account_id) WHERE stripe_account_id IS NOT NULL;
ALTER TABLE payout_requests ADD COLUMN stripe_account_id TEXT;
ALTER TABLE payout_requests ADD COLUMN transfer_id TEXT;
