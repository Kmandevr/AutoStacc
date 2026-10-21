-- Shows become events (#178): project_shows is renamed project_events and gains what an event page needs (its own
-- address /<creator>/<project>/events/<slug>, a title, a start time, an end date, the IANA time zone, the country, tags
-- and a description); releases gain tags (#178). Tags follow the store's rule (server/lib/tags.js): a JSON list of up
-- to 8 lowercase words. Forward-only: the table and its column are renamed, every row and value is kept, new columns are
-- backfilled from what the row already says (slug from its id, title from its venue and city). project_news is left as
-- it is: news is off for now and its rows wait for each creator's community (#174, docs/community.md).

ALTER TABLE project_shows RENAME TO project_events;
ALTER TABLE project_events RENAME COLUMN show_date TO event_date;

-- slug: unique among a project's live events, never changed once published. start_time: 'HH:MM' local time, NULL for
-- an all-day event. end_date: the last day of an event that runs over several days, else NULL. time_zone: the IANA
-- zone the time is in (e.g. 'Europe/Berlin'), NULL when unknown. country: ISO 3166-1 alpha-2 code, '' when unknown.
ALTER TABLE project_events ADD COLUMN slug TEXT NOT NULL DEFAULT '';
ALTER TABLE project_events ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE project_events ADD COLUMN start_time TEXT;
ALTER TABLE project_events ADD COLUMN end_date TEXT;
ALTER TABLE project_events ADD COLUMN time_zone TEXT;
ALTER TABLE project_events ADD COLUMN country TEXT NOT NULL DEFAULT '';
ALTER TABLE project_events ADD COLUMN tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags));
ALTER TABLE project_events ADD COLUMN description TEXT NOT NULL DEFAULT '';

UPDATE project_events SET slug = replace(lower(id), '_', '-') WHERE slug = '';
UPDATE project_events SET title = CASE WHEN venue <> '' THEN venue || ', ' || city ELSE city END WHERE title = '';

DROP INDEX IF EXISTS project_shows_project;
DROP INDEX IF EXISTS project_shows_date;
CREATE UNIQUE INDEX project_events_slug ON project_events(project_id, slug) WHERE deleted_at IS NULL;
CREATE INDEX project_events_project ON project_events(project_id, event_date) WHERE deleted_at IS NULL;
CREATE INDEX project_events_date ON project_events(published, event_date) WHERE deleted_at IS NULL;

ALTER TABLE project_releases ADD COLUMN tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags));
