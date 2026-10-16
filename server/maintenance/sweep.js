// The daily retention sweep (docs/packs.md): each area cleans up what it owns, in an order where each step can only
// make the next one find more to do. Retired files past their 30 days stop being active, and removed files' bytes go
// a day later; unused stored originals get a
// day's grace and are then deleted; stuck and abandoned Pac versions are settled; leftover archives and expired bundle
// rows go; products' derived store details catch up with their files and the store.derivedFacets switch; jobs waiting
// for the processing allowance are sent, a few at a time, when it allows; a few older files get their checksums
// (files/legacy.js); creator sites scheduled for earlier publish (sites/schedule.js) and files of deleted library pieces no site uses
// anymore (library/sweep.js); and the admins hear about meters
// near the allowance; last, paid creator storage is measured, last month's statements issued and overdue ones acted on
// (billing/statements.js).
// Bounded per run; anything left waits for the next day.
import { deactivateExpiredRetired } from "../files/files.js";
import { hashLegacyFiles } from "../files/legacy.js";
import { purgeRemovedFiles } from "../files/retention.js";
import { makeVariants } from "../downloads/variants.js";
import { sweepVersions } from "../packs/sweep.js";
import { drainWaiting } from "../packs/process.js";
import { sweepAdditions } from "../packs/additions.js";
import { checkLevels } from "../usage/usage.js";
import { sweepBlobs } from "../blobs/sweep.js";
import { deleteExpiredBundles } from "../downloads/bundle.js";
import { sweepContents } from "../discovery/contents.js";
import { runDue } from "../sites/schedule.js";
import { sweepReleased } from "../library/sweep.js";
import { runStorageBilling } from "../billing/statements.js";

export async function sweep(app, { nowMs = Date.now() } = {}) {
  const retiredFiles = await deactivateExpiredRetired(app.db, nowMs);
  const purgedFiles = await purgeRemovedFiles(app, { nowMs });
  const versions = await sweepVersions(app, { nowMs });
  const blobs = await sweepBlobs(app, { nowMs });
  const bundles = await deleteExpiredBundles(app.db, nowMs);
  // Last: what products contain, after the files above may have changed (and following the store.derivedFacets switch).
  const contents = await sweepContents(app);
  const waiting = await drainWaiting(app);
  const additions = await sweepAdditions(app, { nowMs });
  const legacy = await hashLegacyFiles(app);
  const variants = await makeVariants(app);
  const sites = { ...(await runDue(app)), ...(await sweepReleased(app)) };
  const usage = (await checkLevels(app)).level;
  // After every cleanup above, so a day's measurement sees what is really still stored (server/billing/).
  const storageBilling = await runStorageBilling(app, { nowMs });
  return { retiredFiles, purgedFiles, versions, blobs, bundles, contents, waiting, additions, legacy, variants, sites, usage, storageBilling };
}
