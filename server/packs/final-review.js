// What a version changes against the live one, worked out from the two manifests themselves (docs/packs.md, "Pac
// editor"): a version built in steps (copied, files added, moved or removed) has no single upload whose diff says it,
// so before it's published the diff and the automated review's revision risk are taken again by asset: an asset in
// both is unchanged, moved or renamed, or replaced (other bytes); one only in this version is new; one only in the live
// version is removed. The review's big_revision flag follows (review.js has the rule); other flags stay as checked.
import { all, stmt, parseJson } from "../lib/db.js";

const NAMED = 50;

async function entriesOf(db, versionId) {
  const [entries, folders] = await Promise.all([
    all(db, `SELECT e.asset_id, e.filename, e.folder_id, b.sha256, b.size_bytes FROM pac_entries e JOIN blobs b ON b.id = e.blob_id WHERE e.version_id = ?`, versionId),
    all(db, "SELECT id, parent_id, name FROM pac_folders WHERE version_id = ?", versionId)
  ]);
  const byId = new Map(folders.map((f) => [f.id, f]));
  const pathOf = (id, seen = new Set()) => {
    const f = byId.get(id);
    if (!f || seen.has(id)) return "";
    seen.add(id);
    return f.parent_id ? `${pathOf(f.parent_id, seen)}/${f.name}` : f.name;
  };
  return new Map(entries.map((e) => [e.asset_id, { ...e, folderPath: e.folder_id ? pathOf(e.folder_id) : "" }]));
}

/** → { diff, risk } against the Pac's live version, or null when there is none. */
export async function currentDiff(db, version) {
  const pac = (await all(db, "SELECT live_version_id FROM pacs WHERE id = ?", version.pac_id))[0];
  if (!pac || !pac.live_version_id || pac.live_version_id === version.id) return null;
  const [mine, live] = await Promise.all([entriesOf(db, version.id), entriesOf(db, pac.live_version_id)]);
  const counts = { same: 0, moved: 0, replaced: 0, added: 0, removed: 0 };
  const changes = {};
  for (const [asset, e] of mine) {
    const was = live.get(asset);
    const change = !was ? "new" : was.sha256 !== e.sha256 ? "replaced" : was.folderPath !== e.folderPath || was.filename !== e.filename ? "moved" : "same";
    counts[change === "new" ? "added" : change]++;
    if (change !== "same") changes[asset] = change;
  }
  const removed = [...live.values()].filter((e) => !mine.has(e.asset_id));
  counts.removed = removed.length;
  const replaced = [...mine.keys()].filter((a) => changes[a] === "replaced").map((a) => live.get(a));
  const all0 = [...live.values()];
  return {
    diff: { base: pac.live_version_id, counts, changes, removed: removed.slice(0, NAMED).map((e) => ({ filename: e.filename, folderPath: e.folderPath })) },
    risk: { files: all0.length, bytes: all0.reduce((n, e) => n + e.size_bytes, 0), removed: removed.length,
      goneBytes: [...removed, ...replaced].reduce((n, e) => n + e.size_bytes, 0) }
  };
}

const big = (r) => r && r.files && (r.removed / r.files > 0.25 || (r.bytes && r.goneBytes / r.bytes > 0.5));

/** The version's stats with the diff and the revision-risk flag taken again (for publishing and the builder's view). */
export async function refreshedStats(db, version) {
  const stats = parseJson(version.stats, {});
  const now = await currentDiff(db, version);
  const out = { ...stats };
  // A version checked before reviews existed has none, and is held for that (review.js clearToPublish): it stays so.
  if (stats.review) {
    const flags = (stats.review.flags || []).filter((f) => f.code !== "big_revision");
    if (now && big(now.risk)) flags.push({ code: "big_revision", hard: false, count: now.risk.removed, examples: [] });
    out.review = { verdict: flags.length ? "hold" : "pass", flags };
  }
  if (now) out.diff = now.diff;
  else delete out.diff;
  return out;
}

/** Stores refreshedStats (only while the version is still ready or held). */
export const saveStatsStmt = (db, versionId, stats) =>
  stmt(db, "UPDATE pac_versions SET stats = ? WHERE id = ? AND status IN ('ready', 'in_review')", JSON.stringify(stats), versionId);
