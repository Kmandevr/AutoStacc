// Reading spaces and channels (docs/community.md, "Spaces and channels"). The public pages list open, read-only and
// archived spaces (archived ones are read-only and still readable); creating and changing them comes with posting.
import { first, all } from "../lib/db.js";

const KIND_ORDER = "CASE kind WHEN 'platform' THEN 0 WHEN 'project' THEN 1 ELSE 2 END";

export const listSpaces = (db) => all(db, `SELECT id, slug, name, kind, official, description, state FROM community_spaces
  ORDER BY ${KIND_ORDER}, name COLLATE NOCASE LIMIT 500`);

export const getSpaceBySlug = (db, slug) => first(db, `SELECT id, slug, name, kind, project_id AS projectId, official, description, rules, state,
  created_at AS createdAt FROM community_spaces WHERE slug = ?`, slug);

export const listChannels = (db, spaceId) => all(db, `SELECT id, slug, name, post_types AS postTypes, who_may_start AS whoMayStart
  FROM community_channels WHERE space_id = ? AND archived_at IS NULL ORDER BY position, name`, spaceId);

export const getChannel = (db, spaceId, slug) => first(db, `SELECT id, slug, name, post_types AS postTypes, who_may_start AS whoMayStart
  FROM community_channels WHERE space_id = ? AND slug = ? AND archived_at IS NULL`, spaceId, slug);
