-- A project's personality on AutoStacc's cards (owner, 2026-10-22; server/projects/personality.js): an accent from
-- AutoStacc's track colours and a small signature animation, both picked from presets in the Studio. No row: automatic
-- (first-party projects from data/projects.js, others the defaults).
CREATE TABLE project_personality (
  project_id TEXT PRIMARY KEY REFERENCES projects(id),
  accent TEXT NOT NULL,
  motion TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
