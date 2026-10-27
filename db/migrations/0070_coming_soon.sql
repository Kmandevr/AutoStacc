-- Coming soon products (owner, 2026-10-27, #218): an unpublished Studio product with a date shows its page and card
-- as Coming soon, can't be bought (it isn't published, so the cart and checkout refuse it as before), and the daily
-- sweep puts it on sale on that day (UTC) if it passes the readiness check; otherwise it stays Coming soon and the
-- creator's owner is emailed once. NULL: an ordinary draft or a product on sale.
ALTER TABLE products ADD COLUMN coming_soon_on TEXT;
CREATE INDEX products_coming_soon ON products(coming_soon_on) WHERE coming_soon_on IS NOT NULL;
