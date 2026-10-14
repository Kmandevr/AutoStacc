// The daily retention sweep (docs/packs.md): each area cleans up what it owns, in an order where each step can only
// make the next one find more to do. Retired files past their 30 days stop being active; unused stored originals get a
// day's grace and are then deleted; stuck and abandoned Pac versions are settled; leftover archives and expired bundle
// rows go; products' derived store details catch up with their files and the store.derivedFacets switch; jobs waiting
// for the processing allowance are sent, a few at a time, when it allows, and the admins hear about meters near it.
// Bounded per run; anything left waits for the next day.
import { deactivateExpiredRetired } from "../files/files.js";
import { sweepVersions } from "../packs/sweep.js";
import { drainWaiting } from "../packs/process.js";
import { checkLevels } from "../usage/usage.js";
import { sweepBlobs } from "../blobs/sweep.js";
import { deleteExpiredBundles } from "../downloads/bundle.js";
import { sweepContents } from "../discovery/contents.js";

export async function sweep(app, { nowMs = Date.now() } = {}) {
  const retiredFiles = await deactivateExpiredRetired(app.db, nowMs);
  const versions = await sweepVersions(app, { nowMs });
  const blobs = await sweepBlobs(app, { nowMs });
  const bundles = await deleteExpiredBundles(app.db, nowMs);
  // Last: what products contain, after the files above may have changed (and following the store.derivedFacets switch).
  const contents = await sweepContents(app);
  const waiting = await drainWaiting(app);
  const usage = (await checkLevels(app)).level;
  return { retiredFiles, versions, blobs, bundles, contents, waiting, usage };
}
