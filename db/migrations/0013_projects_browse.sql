-- Projects browser (/projects, server/projects/browse.js): what a project is about and how recently it was active, for
-- AutoStacc's own projects, synced from data/ by db/catalog.sql. Studio projects derive the same from their products.
-- Forward-only: new columns only.

-- A one-line description and an image (path on this site), shown on project cards.
ALTER TABLE projects ADD COLUMN tagline TEXT;
ALTER TABLE projects ADD COLUMN image TEXT;
-- Genre and style values from the store vocabulary (server/discovery/vocabulary.js), as a JSON list of "facet:value".
ALTER TABLE projects ADD COLUMN genres TEXT NOT NULL DEFAULT '[]';
-- Dates of its releases, news posts and shows (JSON { releases: [...], news: [...], shows: [...] }, newest first, at most
-- 20 each), so "recently active" and "show coming up" are answered without the static data files.
ALTER TABLE projects ADD COLUMN activity TEXT NOT NULL DEFAULT '{}';
