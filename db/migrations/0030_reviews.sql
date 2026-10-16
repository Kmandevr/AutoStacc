-- Reviews from confirmed buyers (server/reviews/, issue #96; owner 2026-10-16: stars and optional text). One per
-- account and product, editable. Shown only while its author still owns the product (an active entitlement, read at
-- show time), so a refund or a revoked grant takes the review off the page without deleting it. hidden_*: AutoStacc
-- hid it (audited). Deleted with the account.
CREATE TABLE product_reviews (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  user_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  hidden_at TEXT,
  hidden_by TEXT,
  hidden_note TEXT,
  UNIQUE (product_id, user_id)
);
CREATE INDEX product_reviews_product ON product_reviews(product_id, updated_at);
CREATE INDEX product_reviews_user ON product_reviews(user_id);
