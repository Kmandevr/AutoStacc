// Copyright standing (docs/community-safety.md, "Copyright: tiered strikes"): how many active strikes an account or a
// creator space has, and what that stops. The one place other modules ask; they never read copyright tables.
//   level 0: nothing    1: a warning    2: selling paused    3: text only (no selling, uploads or Studio)
// A whole strike is 2 units, a half strike 1 (a member's strike counts half for their creator space); the level is
// the whole strikes, rounded down, up to 3. A strike is active until it's countered, withdrawn or 12 months old, so
// levels are computed when asked and expiry needs nothing to run. An admin's hold keeps level 3 past expiry.
import { all, first } from "../lib/db.js";

export const STRIKE_DAYS = 365;
export const UNITS = { whole: 2, half: 1 };

export const levelOf = (units, held = false) => (held ? 3 : Math.min(3, Math.floor(units / UNITS.whole)));

async function standings(db, subject, ids, nowIso = new Date().toISOString()) {
  const out = new Map(ids.map((i) => [i, { units: 0, held: false }]));
  if (!ids.length) return out;
  const list = JSON.stringify(ids);
  const [units, holds] = await Promise.all([
    all(db, `SELECT subject_id AS id, SUM(units) AS units FROM copyright_strikes WHERE subject = ? AND state = 'active' AND expires_at > ?
      AND subject_id IN (SELECT value FROM json_each(?)) GROUP BY subject_id`, subject, nowIso, list),
    all(db, "SELECT subject_id AS id FROM copyright_holds WHERE subject = ? AND subject_id IN (SELECT value FROM json_each(?))", subject, list)
  ]);
  for (const r of units) out.get(r.id).units = r.units;
  for (const r of holds) out.get(r.id).held = true;
  return out;
}

const level = async (db, subject, id) => {
  const s = (await standings(db, subject, [id])).get(id);
  return { level: levelOf(s.units, s.held), units: s.units, held: s.held };
};

export const accountLevel = (db, userId) => level(db, "account", userId);
export const creatorLevel = (db, creatorId) => level(db, "creator", creatorId);

// The creator spaces among these whose selling is paused (level 2 or more): their products can't be bought or
// claimed free, and Auto-Stacc skips them; what people already have stays theirs.
export async function creatorsSellingPaused(db, creatorIds) {
  const ids = [...new Set(creatorIds.filter(Boolean))];
  const s = await standings(db, "creator", ids);
  return new Set(ids.filter((id) => levelOf(s.get(id).units, s.get(id).held) >= 2));
}

// Whether any creator space has an active strike or a hold at all: one cheap read that lets every cart and checkout
// skip the rest while nobody has strikes (almost always).
export const anyCreatorStanding = async (db) => Boolean(await first(db, `SELECT 1 AS n WHERE EXISTS (SELECT 1 FROM copyright_strikes
  WHERE subject = 'creator' AND state = 'active' AND expires_at > ?) OR EXISTS (SELECT 1 FROM copyright_holds WHERE subject = 'creator')`, new Date().toISOString()));

// Whether this account may publish or price products (owner: a member at 2 strikes can't, in any creator space).
export const mayPublish = async (db, userId) => (await accountLevel(db, userId)).level < 2;
