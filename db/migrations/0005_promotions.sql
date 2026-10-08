-- Sales and promo codes (docs/admin.md#sales-and-promo-codes), set up by the admin. A sale lowers prices on its own
-- while it runs; a code takes money off an order when the buyer enters it. Prices themselves still come only from
-- the catalog (products.price_cents); a promotion never changes them, it's applied when a cart is priced.
CREATE TABLE promotions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('sale', 'code')),
  name TEXT NOT NULL,
  code TEXT,
  percent_off INTEGER CHECK (percent_off BETWEEN 1 AND 90),
  amount_off_cents INTEGER CHECK (amount_off_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  scope TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'products', 'project')),
  scope_ids TEXT NOT NULL DEFAULT '[]',
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  max_redemptions INTEGER CHECK (max_redemptions > 0),
  once_per_customer INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((percent_off IS NULL) <> (amount_off_cents IS NULL)),
  CHECK ((kind = 'code') = (code IS NOT NULL))
);
CREATE UNIQUE INDEX promotions_code ON promotions(code) WHERE code IS NOT NULL;
CREATE INDEX promotions_running ON promotions(kind, starts_at, ends_at);

-- What an order got: the sale price per line (unit_price_cents) next to the catalog price it came from, and the
-- code applied to the order (orders.discount_cents already holds the amount).
ALTER TABLE order_items ADD COLUMN list_price_cents INTEGER;
ALTER TABLE order_items ADD COLUMN sale_id TEXT;
ALTER TABLE orders ADD COLUMN promotion_id TEXT;
ALTER TABLE orders ADD COLUMN promo_code TEXT;
CREATE INDEX orders_promotion ON orders(promotion_id, status, email) WHERE promotion_id IS NOT NULL;
CREATE INDEX order_items_sale ON order_items(sale_id) WHERE sale_id IS NOT NULL;

-- Usage limits, checked by the database as the order is written, so two signed-in buyers at the same moment can't both
-- take the last use. A use is a paid or refunded order, or a pending one placed by another signed-in account whose
-- payment page may still be open (35 min: the 30-minute page plus a margin). Guests' pending orders never hold a use,
-- so nobody can lock a code up with throwaway checkouts; once per customer counts paid orders only, so nobody can
-- spend someone else's by typing their email.
CREATE TRIGGER promotions_limit BEFORE INSERT ON orders WHEN NEW.promotion_id IS NOT NULL BEGIN
  SELECT RAISE(ABORT, 'promotion_used_up') WHERE (
    SELECT max_redemptions FROM promotions WHERE id = NEW.promotion_id) IS NOT NULL
    AND (SELECT COUNT(*) FROM orders WHERE promotion_id = NEW.promotion_id
      AND (status IN ('paid', 'refunded') OR (status = 'pending' AND user_id IS NOT NULL AND user_id IS NOT NEW.user_id
        AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-35 minutes'))))
      >= (SELECT max_redemptions FROM promotions WHERE id = NEW.promotion_id);
  SELECT RAISE(ABORT, 'promotion_already_used') WHERE (
    SELECT once_per_customer FROM promotions WHERE id = NEW.promotion_id) = 1
    AND EXISTS (SELECT 1 FROM orders WHERE promotion_id = NEW.promotion_id AND email = NEW.email AND status IN ('paid', 'refunded'));
END;
