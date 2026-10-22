// Reading spaces and channels (docs/community.md, "Spaces and channels"). The public pages list open, read-only and
// archived spaces (archived ones are read-only and still readable); creating and changing them comes with posting.
import { first, all } from "../../lib/db.js";

// A project space's canonical address, /<creator>/<project>/community (docs/community.md, "Addresses"); null for others.
export const CANONICAL = `(SELECT '/' || c.slug || '/' || COALESCE(p.slug, p.id) || '/community' FROM projects p JOIN creators c ON c.id = p.creator_id WHERE p.id = community_spaces.project_id) AS canonical`;

// Whether a space shows to the public: every space does, except a project space whose project isn't live (published,
// not deleted, creator active) or no longer has the community feature. `col` is the space id column of the query.
export const SHOWN = (col) => `(NOT EXISTS (SELECT 1 FROM community_spaces vs WHERE vs.id = ${col} AND vs.kind = 'project') OR EXISTS
  (SELECT 1 FROM community_spaces vs JOIN projects vp ON vp.id = vs.project_id JOIN creators vc ON vc.id = vp.creator_id
   WHERE vs.id = ${col} AND vp.published = 1 AND vp.deleted_at IS NULL AND vp.features LIKE '%"community"%'
     AND (vp.source = 'catalog' OR (vc.status = 'active' AND vc.deleted_at IS NULL))))`;

// Whether one space shows to the public (SHOWN, for a single id).
export const spaceShown = async (db, spaceId) => Boolean(await first(db, `SELECT 1 AS n FROM community_spaces WHERE id = ? AND ${SHOWN("community_spaces.id")}`, spaceId));

const KIND_ORDER = "CASE kind WHEN 'platform' THEN 0 WHEN 'project' THEN 1 ELSE 2 END";

export const listSpaces = (db) => all(db, `SELECT id, slug, name, kind, official, description, state, ${CANONICAL} FROM community_spaces
  WHERE ${SHOWN("community_spaces.id")} ORDER BY ${KIND_ORDER}, name COLLATE NOCASE LIMIT 500`);

// The whole row, so columns a feature adds in its own migration reach its slots without the core naming them.
export const getSpaceBySlug = (db, slug) => first(db, `SELECT *, project_id AS projectId, created_at AS createdAt, ${CANONICAL} FROM community_spaces WHERE slug = ? AND ${SHOWN("community_spaces.id")}`, slug);

export const listChannels = (db, spaceId) => all(db, `SELECT id, slug, name, position, post_types AS postTypes, who_may_start AS whoMayStart
  FROM community_channels WHERE space_id = ? AND archived_at IS NULL ORDER BY position, name`, spaceId);

export const getChannel = (db, spaceId, slug) => first(db, `SELECT id, slug, name, position, post_types AS postTypes, who_may_start AS whoMayStart
  FROM community_channels WHERE space_id = ? AND slug = ? AND archived_at IS NULL`, spaceId, slug);

// Takes started in each space in the last week, for the activity meter on the front page's mixer row.
export const weeklyActivity = async (db) => new Map((await all(db, `SELECT space_id AS spaceId, COUNT(*) AS n FROM community_threads
  WHERE state = 'visible' AND created_at > ? GROUP BY space_id`, new Date(Date.now() - 7 * 86400000).toISOString())).map((r) => [r.spaceId, r.n]));

