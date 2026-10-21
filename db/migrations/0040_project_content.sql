-- Project content made in the Studio (docs/creators.md): every creator's releases, news posts and shows, first-party
-- included, plus each project's look (projects.look) so its pages can be rendered by the server. Seeds only the real
-- Glitches & Stitches facts that were in data/music.js and data/news.js (release "hail", post "hail-out-now"), and only
-- where that project exists; never the placeholder drafts. Forward-only: new tables and columns, no data rewritten.

-- A project's own look for server-rendered pages, JSON { skin, sounds } (booleans, data/projects.js): skin = its pages
-- load css/projects/<id>/skin.css; sounds = its pages load the UI sounds. NULL = the plain platform look. Written by
-- the catalog sync for first-party projects.
ALTER TABLE projects ADD COLUMN look TEXT CHECK (look IS NULL OR json_valid(look));

-- Releases, each at /<creator>/<project>/music/<slug>. slug: unique among a project's live rows, never changed once
-- published. artwork: JSON { asset | src, width, height, alt, srcset? } (asset = the creator's site asset id; src only
-- for migrated first-party artwork). tracks: JSON [{ title, duration "m:ss", isrc }]; credits: JSON [{ role, name }];
-- links: JSON [{ name, url }] (https only). featured: the release its project's Listen section plays.
CREATE TABLE project_releases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  slug TEXT NOT NULL CHECK (slug = lower(slug)),
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Single', 'EP', 'Album')),
  release_date TEXT NOT NULL CHECK (release_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  upc TEXT,
  description TEXT NOT NULL DEFAULT '',
  artwork TEXT CHECK (artwork IS NULL OR json_valid(artwork)),
  tracks TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tracks)),
  credits TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(credits)),
  embed_url TEXT,
  fallback_embed_url TEXT,
  links TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(links)),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX project_releases_slug ON project_releases(project_id, slug) WHERE deleted_at IS NULL;
CREATE INDEX project_releases_date ON project_releases(published, release_date) WHERE deleted_at IS NULL;

-- News posts, each at /<creator>/<project>/news/<slug>. summary: plain text (cards and search description). body: the
-- safe-text markup of js/site-text.js (never HTML), rendered by the server. release_slug: optional slug of a release of
-- the same project that the post is about.
CREATE TABLE project_news (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  slug TEXT NOT NULL CHECK (slug = lower(slug)),
  post_date TEXT NOT NULL CHECK (post_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  title TEXT NOT NULL,
  tag TEXT NOT NULL DEFAULT '',
  release_slug TEXT,
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX project_news_slug ON project_news(project_id, slug) WHERE deleted_at IS NULL;
CREATE INDEX project_news_date ON project_news(published, post_date) WHERE deleted_at IS NULL;

-- Shows (dates, no page of their own). ticket_url: https only, optional.
CREATE TABLE project_shows (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  show_date TEXT NOT NULL CHECK (show_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  city TEXT NOT NULL,
  venue TEXT NOT NULL DEFAULT '',
  ticket_url TEXT,
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX project_shows_project ON project_shows(project_id, show_date) WHERE deleted_at IS NULL;
CREATE INDEX project_shows_date ON project_shows(published, show_date) WHERE deleted_at IS NULL;

-- The real facts from data/ (a no-op where the project is missing or the slug is already there). Streaming links that
-- were empty (not set yet) are left out.
UPDATE projects SET look = '{"skin":true,"sounds":true}'
WHERE id = 'glitches-and-stitches' AND look IS NULL AND deleted_at IS NULL;

INSERT INTO project_releases (id, project_id, slug, title, type, release_date, upc, description, artwork, tracks, credits,
  embed_url, fallback_embed_url, links, featured, published, created_by, created_at, updated_at)
SELECT 'rel_' || lower(hex(randomblob(10))), 'glitches-and-stitches', 'hail', 'HAIL', 'Single', '2025-10-15', '199746791737',
  'HAIL is a single by Glitches & Stitches, released on 15 October 2025. One track, 2:27, streaming on Apple Music, YouTube Music and Deezer.',
  '{"src":"/img/releases/hail.jpg","width":1000,"height":1000,"alt":"HAIL cover art: logs burning in a bright orange fire against a black background","srcset":[{"src":"/img/releases/hail-500.webp","width":500,"type":"image/webp"},{"src":"/img/releases/hail.webp","width":1000,"type":"image/webp"},{"src":"/img/releases/hail-500.jpg","width":500,"type":"image/jpeg"},{"src":"/img/releases/hail.jpg","width":1000,"type":"image/jpeg"}]}',
  '[{"title":"HAIL","duration":"2:27","isrc":"QT3FF2517426"}]',
  '[]',
  'https://www.youtube.com/embed/EzVo6Mc8Yt0',
  'https://widget.deezer.com/widget/dark/track/3605198432',
  '[{"name":"YouTube Music","url":"https://music.youtube.com/watch?v=EzVo6Mc8Yt0"},{"name":"Apple Music","url":"https://music.apple.com/us/album/hail/1847091235?i=1847091237"},{"name":"Deezer","url":"https://www.deezer.com/album/838974702"}]',
  1, 1, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE EXISTS (SELECT 1 FROM projects WHERE id = 'glitches-and-stitches' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM project_releases WHERE project_id = 'glitches-and-stitches' AND slug = 'hail' AND deleted_at IS NULL);

INSERT INTO project_news (id, project_id, slug, post_date, title, tag, release_slug, summary, body, published, created_by,
  created_at, updated_at)
SELECT 'nws_' || lower(hex(randomblob(10))), 'glitches-and-stitches', 'hail-out-now', '2025-10-15', 'HAIL is out now', 'Release', 'hail',
  'The single HAIL is out on Apple Music, YouTube Music, Deezer and more.',
  'HAIL is out now. Play it on the [HAIL release page](/autostacc/glitches-and-stitches/music/hail), or stream it on [Apple Music](https://music.apple.com/us/album/hail/1847091235?i=1847091237), [YouTube Music](https://music.youtube.com/watch?v=EzVo6Mc8Yt0) and [Deezer](https://www.deezer.com/album/838974702).',
  1, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE EXISTS (SELECT 1 FROM projects WHERE id = 'glitches-and-stitches' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM project_news WHERE project_id = 'glitches-and-stitches' AND slug = 'hail-out-now' AND deleted_at IS NULL);
