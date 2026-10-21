-- Saved cards and automatic monthly charges for paid creator storage (owner, 2026-10-21, #142; docs/creators.md
-- "Paid storage", server/billing/cards.js and charges.js). A creator space's owner saves a card through Stripe Checkout
-- in setup mode on AutoStacc's main account; card details stay at Stripe. Each open statement is then charged
-- off-session to that card, retried by the daily sweep within the grace period, with the pay page as the fallback.
-- Forward-only: a new table and new nullable or defaulted columns, no data changed or dropped.

-- One saved card per creator space. AutoStacc keeps only the Stripe customer id, the payment method id and the card's
-- brand and last 4 to show the owner; never a card number, expiry or CVC. payment_method_id NULL = no card (removed or
-- not yet saved): statements then fall back to the pay page. setup_session_id: the latest setup Checkout session, matched
-- (compare-and-set) by the verified card_saved event. livemode: which Stripe mode the customer belongs to (0 test, 1 live).
CREATE TABLE storage_cards (
  creator_id TEXT PRIMARY KEY REFERENCES creators(id),
  provider TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  livemode INTEGER NOT NULL DEFAULT 0,
  payment_method_id TEXT,
  brand TEXT,
  last4 TEXT,
  setup_session_id TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

-- Automatic charges on a statement. charge_attempts: off-session charges claimed so far (the claim is a compare-and-set
-- on this count; the idempotency key is per statement and attempt). next_charge_at: when the sweep tries next (NULL = no
-- more automatic tries). charge_payment_id: the latest attempt's PaymentIntent. charge_status: NULL (not tried),
-- 'processing', 'declined', 'requires_action' (needs the owner, pay page), 'no_card' or 'succeeded'.
-- charge_error: the decline code only, never card data. Payment itself is still recorded only from verified events.
ALTER TABLE storage_statements ADD COLUMN charge_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE storage_statements ADD COLUMN next_charge_at TEXT;
ALTER TABLE storage_statements ADD COLUMN charge_payment_id TEXT;
ALTER TABLE storage_statements ADD COLUMN charge_status TEXT;
ALTER TABLE storage_statements ADD COLUMN charge_error TEXT;
CREATE INDEX storage_statements_charge ON storage_statements(status, next_charge_at);
