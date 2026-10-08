-- Admin operations (docs/admin.md): support impersonation, the append-only audit log, test-purchase attribution and
-- the indexes the admin statistics read through. Forward-only; nothing existing is rewritten.

-- One row per impersonation: an admin, signed in with their own session, looking at the store as one customer.
-- Only the SHA-256 of the cookie token is stored. Valid only while ended_at is NULL, before expires_at, recently used
-- (last_seen_at) and only with the admin session that started it (server/impersonation/sessions.js checks all four).
CREATE TABLE impersonations (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  admin_user_id TEXT NOT NULL,
  admin_session_id TEXT NOT NULL,
  customer_user_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('support', 'test-purchase')),
  note TEXT,
  started_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ended_at TEXT,
  end_reason TEXT
);
CREATE INDEX impersonations_admin ON impersonations(admin_user_id, ended_at);
CREATE INDEX impersonations_customer ON impersonations(customer_user_id, started_at);

-- Who did what. actor_* is always the real person (the admin, even while impersonating); subject_user_id is the
-- customer an action concerned; impersonation_id ties an action to the impersonation it happened in. detail is small
-- JSON with secrets stripped (server/audit/log.js). Rows are never changed or deleted: the triggers below refuse it.
CREATE TABLE admin_audit (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_user_id TEXT,
  actor_label TEXT NOT NULL,
  impersonation_id TEXT,
  subject_user_id TEXT,
  target_type TEXT,
  target_id TEXT,
  detail TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX admin_audit_at ON admin_audit(at);
CREATE INDEX admin_audit_action ON admin_audit(action, at);
CREATE INDEX admin_audit_impersonation ON admin_audit(impersonation_id, at);
CREATE INDEX admin_audit_subject ON admin_audit(subject_user_id, at);

CREATE TRIGGER admin_audit_no_update BEFORE UPDATE ON admin_audit BEGIN SELECT RAISE(ABORT, 'admin_audit is append-only'); END;
CREATE TRIGGER admin_audit_no_delete BEFORE DELETE ON admin_audit BEGIN SELECT RAISE(ABORT, 'admin_audit is append-only'); END;

-- Catalog changes arrive through the deploy's sync (db/catalog.sql), not through an admin request, so the database
-- records them itself. The admin's own switches (sales_paused, files) are logged by the admin API with the admin's name.
CREATE TRIGGER audit_product_created AFTER INSERT ON products BEGIN
  INSERT INTO admin_audit (id, at, action, actor_label, target_type, target_id, detail)
  VALUES ('au_' || lower(hex(randomblob(10))), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'product.created', 'catalog sync', 'product', NEW.id,
    json_object('priceCents', NEW.price_cents, 'currency', NEW.currency, 'published', NEW.published));
END;
CREATE TRIGGER audit_product_price AFTER UPDATE OF price_cents ON products WHEN OLD.price_cents IS NOT NEW.price_cents BEGIN
  INSERT INTO admin_audit (id, at, action, actor_label, target_type, target_id, detail)
  VALUES ('au_' || lower(hex(randomblob(10))), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'product.price_changed', 'catalog sync', 'product', NEW.id,
    json_object('fromCents', OLD.price_cents, 'toCents', NEW.price_cents, 'currency', NEW.currency));
END;
CREATE TRIGGER audit_product_published AFTER UPDATE OF published ON products WHEN OLD.published IS NOT NEW.published BEGIN
  INSERT INTO admin_audit (id, at, action, actor_label, target_type, target_id, detail)
  VALUES ('au_' || lower(hex(randomblob(10))), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    CASE WHEN NEW.published = 1 THEN 'product.published' ELSE 'product.unpublished' END, 'catalog sync', 'product', NEW.id, '{}');
END;
CREATE TRIGGER audit_product_removed AFTER UPDATE OF deleted_at ON products WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL BEGIN
  INSERT INTO admin_audit (id, at, action, actor_label, target_type, target_id, detail)
  VALUES ('au_' || lower(hex(randomblob(10))), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'product.removed', 'catalog sync', 'product', NEW.id, '{}');
END;
CREATE TRIGGER audit_project_published AFTER UPDATE OF published ON projects WHEN OLD.published IS NOT NEW.published BEGIN
  INSERT INTO admin_audit (id, at, action, actor_label, target_type, target_id, detail)
  VALUES ('au_' || lower(hex(randomblob(10))), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    CASE WHEN NEW.published = 1 THEN 'project.published' ELSE 'project.unpublished' END, 'catalog sync', 'project', NEW.id, '{}');
END;
CREATE TRIGGER audit_project_created AFTER INSERT ON projects BEGIN
  INSERT INTO admin_audit (id, at, action, actor_label, target_type, target_id, detail)
  VALUES ('au_' || lower(hex(randomblob(10))), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'project.created', 'catalog sync', 'project', NEW.id,
    json_object('published', NEW.published));
END;

-- Orders and downloads made during an impersonation carry it, so they are never mistaken for the customer's own and
-- statistics can leave them out.
ALTER TABLE orders ADD COLUMN impersonation_id TEXT;
ALTER TABLE download_events ADD COLUMN impersonation_id TEXT;
CREATE INDEX orders_impersonation ON orders(impersonation_id) WHERE impersonation_id IS NOT NULL;

-- Statistics read by time range and status; these keep them off full-table scans as the store grows.
CREATE INDEX orders_status_created ON orders(livemode, status, created_at);
CREATE INDEX orders_paid ON orders(livemode, paid_at) WHERE paid_at IS NOT NULL;
CREATE INDEX order_items_product ON order_items(product_id, order_id);
CREATE INDEX entitlements_status_source ON entitlements(status, source_type, product_id);
CREATE INDEX download_events_time ON download_events(created_at, event, product_id, file_id, impersonation_id);
CREATE INDEX download_events_subject ON download_events(subject, created_at);
CREATE INDEX download_events_impersonation ON download_events(impersonation_id) WHERE impersonation_id IS NOT NULL;
CREATE INDEX user_created ON "user"("createdAt");
CREATE INDEX analytics_daily_subject ON analytics_daily(event, subject, day);
