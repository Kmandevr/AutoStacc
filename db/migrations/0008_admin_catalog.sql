-- Products the owner changed in the Control Center (price, published or not, removed). The deploy's catalog sync
-- (db/catalog.sql) leaves these rows alone, so a deploy never undoes an admin change. Forward-only.
ALTER TABLE products ADD COLUMN admin_managed INTEGER NOT NULL DEFAULT 0;
