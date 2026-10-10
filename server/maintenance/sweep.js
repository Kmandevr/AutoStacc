// The daily retention sweep (docs/packs.md): each area cleans up what it owns, in an order where each step can only
// make the next one find more to do. Retired files past their 30 days stop being active; unused stored originals get a
// day's grace and are then deleted; stuck and abandoned Pac versions are settled; leftover archives and expired bundle
// rows go. Bounded per run; anything left waits for the next day.
import { deactivateExpiredRetired } from "../files/files.js";
import { sweepVersions } from "../packs/sweep.js";
import { sweepBlobs } from "../blobs/sweep.js";
import { deleteExpiredBundles } from "../downloads/bundle.js";

export async function sweep(app, { nowMs = Date.now() } = {}) {
  const retiredFiles = await deactivateExpiredRetired(app.db, nowMs);
  const versions = await sweepVersions(app, { nowMs });
  const blobs = await sweepBlobs(app, { nowMs });
  const bundles = await deleteExpiredBundles(app.db, nowMs);
  return { retiredFiles, versions, blobs, bundles };
}
