// A new version as a revision of the live one (docs/packs.md, Phase 6): which of its files are the live version's files
// (js/pack-diff.js: same, moved, replaced; hash first), so those keep their asset and with it their values, published
// file id and buyers' selections; which folders are the same folders (by path), so they keep their id and defaults; and
// a summary for the version's stats (counts, every changed file, the files it removes). No live version: all new.
import { first } from "../lib/db.js";
import { loadManifest } from "./manifest.js";
import diff from "../../js/pack-diff.js";

const pathOf = (f) => (f.folderPath ? `${f.folderPath}/${f.filename}` : f.filename);
// What the stats keep of the removed files (the review and Your Stacc list them; more are counted, not named).
const NAMED = 500;

/** files: the new version's kept files [{ logical, sha256 }]. */
export async function revisionOf(db, version, files) {
  const pac = await first(db, "SELECT live_version_id FROM pacs WHERE id = ?", version.pac_id);
  const liveId = pac && pac.live_version_id;
  if (!liveId) return { liveId: null, assetOf: () => null, folderIdOf: () => null, previous: null, risk: null, summary: null };
  const live = await loadManifest(db, liveId);
  const d = diff.match(files.map((f) => ({ path: f.logical, sha256: f.sha256 })), live.files.map((f) => ({ assetId: f.assetId, path: pathOf(f), sha256: f.sha256 })));
  const folders = new Map(live.folders.map((f) => [f.path, f.id]));
  const changes = {};
  d.matches.forEach((m, i) => { if (m && m.change !== "same") changes[m.assetId] = m.change; });
  const byAsset = new Map(live.files.map((f) => [f.assetId, f]));
  const removed = d.removed.map((b) => byAsset.get(b.assetId));
  const replaced = d.matches.filter((m) => m && m.change === "replaced").map((m) => byAsset.get(m.assetId));
  return {
    liveId,
    assetOf: (i) => (d.matches[i] ? d.matches[i].assetId : null),
    folderIdOf: (path) => folders.get(path) || null,
    previous: Object.fromEntries(live.files.map((f) => [f.sha256, f.sizeBytes])),
    // For the automated review: how much of the live version this one removes (files) or takes away (bytes).
    risk: { files: live.files.length, bytes: live.files.reduce((n, f) => n + f.sizeBytes, 0), removed: removed.length,
      goneBytes: [...removed, ...replaced].reduce((n, f) => n + f.sizeBytes, 0) },
    summary: { base: liveId, counts: d.counts, changes,
      removed: removed.slice(0, NAMED).map((f) => ({ filename: f.filename, folderPath: f.folderPath })) }
  };
}
