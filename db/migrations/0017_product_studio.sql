-- Product Studio (docs/studio.md): the release history of a product (who published, paused, repriced, submitted or
-- approved files, and when) and creators' own sales on the shared promotions table. Forward-only: one new table and
-- one new nullable column; nothing existing is rewritten.

-- One row per change to a product that the Studio's Overview and Release sections show. actor_user_id is the account
-- that made the change (NULL for the system or once that account is deleted); detail is a small JSON object of counts,
-- prices or version ids, never emails or other people's data.
CREATE TABLE product_events (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  actor_user_id TEXT,
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX product_events_product ON product_events(product_id, created_at);
CREATE INDEX product_events_actor ON product_events(actor_user_id);

-- A sale a creator made for one of its own products (kind 'sale', scope 'products', one id). NULL: AutoStacc's own.
ALTER TABLE promotions ADD COLUMN creator_id TEXT;
CREATE INDEX promotions_creator ON promotions(creator_id) WHERE creator_id IS NOT NULL;
