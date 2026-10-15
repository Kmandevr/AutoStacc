-- The visual builder (docs/builder.md): creator profiles built like project sites, the last published versions of
-- every site, scheduled publishing, and site files that stay while old versions or installed pieces still use them.
-- Forward-only; existing sites keep their documents (version 1 documents convert when read: server/sites/convert.js).

-- A Studio creator's profile site, shown at /<creator> (and /<creator>/<page>) once published. Like project_sites:
-- draft is the editor's document, published the document as last published (rendered into profile_pages).
-- live: the published profile is shown; 0 = the generated list of projects as before. scheduled_*: a copy of the draft
-- to publish at scheduled_at (server/sites/schedule.js), and who scheduled it.
CREATE TABLE creator_sites (
  creator_id TEXT PRIMARY KEY REFERENCES creators(id),
  draft TEXT NOT NULL DEFAULT '{}',
  published TEXT,
  draft_updated_at TEXT NOT NULL,
  published_at TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  live INTEGER NOT NULL DEFAULT 0,
  scheduled_at TEXT,
  scheduled_draft TEXT,
  scheduled_by TEXT
);
CREATE INDEX creator_sites_scheduled ON creator_sites(scheduled_at) WHERE scheduled_at IS NOT NULL;

-- The published, rendered pages of a profile. slug '' is the profile's home (/<creator>). A profile page's slug and a
-- project's slug share one namespace per creator (server/sites/addresses.js).
CREATE TABLE profile_pages (
  creator_id TEXT NOT NULL REFERENCES creators(id),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  html TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  published_at TEXT NOT NULL,
  PRIMARY KEY (creator_id, slug)
);

ALTER TABLE project_sites ADD COLUMN scheduled_at TEXT;
ALTER TABLE project_sites ADD COLUMN scheduled_draft TEXT;
ALTER TABLE project_sites ADD COLUMN scheduled_by TEXT;
CREATE INDEX project_sites_scheduled ON project_sites(scheduled_at) WHERE scheduled_at IS NOT NULL;

-- Every publish of a site, newest kept: the last 20 per site (LIMITS.versionsPerSite; older rows are deleted at the
-- next publish). kind 'project' (site_id = project id) or 'profile' (site_id = creator id).
CREATE TABLE site_versions (
  kind TEXT NOT NULL CHECK (kind IN ('project', 'profile')),
  site_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  doc TEXT NOT NULL,
  published_at TEXT NOT NULL,
  published_by TEXT,
  PRIMARY KEY (kind, site_id, version)
);

-- A site file the creator deleted while an old version or an installed piece still uses it: hidden from their files,
-- still served and still counted against their storage until nothing uses it (server/sites/images.js).
ALTER TABLE site_assets ADD COLUMN hidden_at TEXT;
