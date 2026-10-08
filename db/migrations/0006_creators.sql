-- Creators and their sites (docs/creators.md), plus the store foundations a marketplace will need: who sold each order
-- line and the platform's share of it, refunds per line, a lifecycle for paid files, the source of every catalog row
-- and a place for connected social accounts. Forward-only; nothing existing is rewritten.

-- A creator owns projects and is the seller of record for what they sell. Its address is /<slug>; the id never
-- changes, the slug can (a rename holds the old one, below). source: 'catalog' = first-party, synced from
-- data/creators.js by db/catalog.sql; 'studio' = made by an account in the Studio. trusted: its pages may be indexed
-- by search engines (set by an admin). platform_fee_bps / storage_quota_bytes: NULL = the platform defaults
-- (server/creators/policy.js); per-creator values are set by an admin.
CREATE TABLE creators (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'studio' CHECK (source IN ('catalog', 'studio')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  trusted INTEGER NOT NULL DEFAULT 0,
  platform_fee_bps INTEGER CHECK (platform_fee_bps BETWEEN 0 AND 10000),
  storage_quota_bytes INTEGER CHECK (storage_quota_bytes >= 0),
  published INTEGER NOT NULL DEFAULT 1,
  catalog_hash TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (slug = lower(slug))
);
CREATE UNIQUE INDEX creators_slug ON creators(slug);
CREATE INDEX creators_created_by ON creators(created_by);

-- Accounts that run a creator. owner: everything, including renames and members; editor: content only.
CREATE TABLE creator_members (
  creator_id TEXT NOT NULL REFERENCES creators(id),
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (creator_id, user_id)
);
CREATE INDEX creator_members_user ON creator_members(user_id);

-- A slug given up by a rename: nobody else can take it until expires_at, and its address answers a 301 to the
-- renamed creator or project meanwhile. kind 'creator' (scope '') or 'project' (scope = the creator's id).
CREATE TABLE slug_holds (
  kind TEXT NOT NULL CHECK (kind IN ('creator', 'project')),
  scope TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL,
  target_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (kind, scope, slug)
);

-- Projects belong to a creator and have a slug unique within it (ignoring case: slugs are stored lowercase).
-- Catalog projects keep slug = id. Studio projects get a generated id.
ALTER TABLE projects ADD COLUMN creator_id TEXT REFERENCES creators(id);
ALTER TABLE projects ADD COLUMN slug TEXT;
ALTER TABLE projects ADD COLUMN source TEXT NOT NULL DEFAULT 'catalog' CHECK (source IN ('catalog', 'studio'));
ALTER TABLE projects ADD COLUMN created_by TEXT;
CREATE UNIQUE INDEX projects_creator_slug ON projects(creator_id, slug) WHERE deleted_at IS NULL;

-- A Studio project's mini-site. draft: the editor's JSON document (server/sites/document.js validates it);
-- published: the document as last published, kept so pages can be rendered again (after a rename, say) without
-- publishing unfinished edits. Pages are rendered once into site_pages and served from there (edge-cached).
CREATE TABLE project_sites (
  project_id TEXT PRIMARY KEY REFERENCES projects(id),
  draft TEXT NOT NULL DEFAULT '{}',
  published TEXT,
  draft_updated_at TEXT NOT NULL,
  published_at TEXT,
  version INTEGER NOT NULL DEFAULT 0
);

-- The published, rendered pages of a mini-site. slug '' is the project's home (/<creator>/<project>).
CREATE TABLE site_pages (
  project_id TEXT NOT NULL REFERENCES projects(id),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  html TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  published_at TEXT NOT NULL,
  PRIMARY KEY (project_id, slug)
);

-- Images a creator uploaded for their sites, in the public PREVIEWS bucket under sites/<creator>/ and served by
-- /media/sites/<id> while active. Counted against the creator's storage quota.
CREATE TABLE site_assets (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES creators(id),
  r2_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_by TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX site_assets_creator ON site_assets(creator_id, status);

-- Where a catalog row came from: 'catalog' rows are written only by the deploy's sync (db/catalog.sql), which never
-- touches the others; 'studio' is reserved for products creators will make in the Studio.
ALTER TABLE products ADD COLUMN source TEXT NOT NULL DEFAULT 'catalog' CHECK (source IN ('catalog', 'studio'));

-- Who sold each order line and how its money splits, fixed when the order is written (server/revenue/split.js):
-- net = line total minus its share of a promo code; platform fee + creator share = net. refunded_cents per line.
ALTER TABLE order_items ADD COLUMN project_id TEXT;
ALTER TABLE order_items ADD COLUMN creator_id TEXT;
ALTER TABLE order_items ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN net_cents INTEGER;
ALTER TABLE order_items ADD COLUMN platform_fee_cents INTEGER;
ALTER TABLE order_items ADD COLUMN creator_share_cents INTEGER;
ALTER TABLE order_items ADD COLUMN refunded_cents INTEGER NOT NULL DEFAULT 0;
CREATE INDEX order_items_creator ON order_items(creator_id, order_id);
-- The amount the provider says it refunded (partial refunds included).
ALTER TABLE orders ADD COLUMN refunded_cents INTEGER NOT NULL DEFAULT 0;

-- A paid file's lifecycle: pending (uploaded, not yet delivered) → published, or rejected; deleted. Only published,
-- active files are delivered. Existing files are published.
ALTER TABLE product_files ADD COLUMN status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('pending', 'published', 'rejected', 'deleted'));
ALTER TABLE product_files ADD COLUMN status_note TEXT;
ALTER TABLE product_files ADD COLUMN status_at TEXT;
CREATE INDEX product_files_product_status ON product_files(product_id, status, active);

-- External accounts a creator connects (server/integrations/). Nothing writes here yet: the first provider will
-- store only what it needs, with tokens encrypted before they reach this table, never in plain text.
CREATE TABLE connected_accounts (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES creators(id),
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  display_name TEXT,
  scopes TEXT NOT NULL DEFAULT '[]',
  token_ciphertext TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'error')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE (creator_id, provider, provider_account_id)
);

-- The catalog-sync audit triggers (0004) are for first-party rows; Studio projects are a creator's own business.
DROP TRIGGER audit_project_created;
DROP TRIGGER audit_project_published;
CREATE TRIGGER audit_project_created AFTER INSERT ON projects WHEN NEW.source = 'catalog' BEGIN
  INSERT INTO admin_audit (id, at, action, actor_label, target_type, target_id, detail)
  VALUES ('au_' || lower(hex(randomblob(10))), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'project.created', 'catalog sync', 'project', NEW.id,
    json_object('published', NEW.published));
END;
CREATE TRIGGER audit_project_published AFTER UPDATE OF published ON projects WHEN OLD.published IS NOT NEW.published AND NEW.source = 'catalog' BEGIN
  INSERT INTO admin_audit (id, at, action, actor_label, target_type, target_id, detail)
  VALUES ('au_' || lower(hex(randomblob(10))), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    CASE WHEN NEW.published = 1 THEN 'project.published' ELSE 'project.unpublished' END, 'catalog sync', 'project', NEW.id, '{}');
END;
