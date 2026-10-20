// What a copyright notice can take down, and how each owning module removes and restores it (docs/copyright.md,
// step 3). The one file here that calls other areas, always through their own exported functions; copyright stores
// only what it did (copyright_notice_targets). Kinds:
//   product_file   a product's file: held (reaches nobody, past buyers included; bytes kept) and released
//   thread, post   a community take or post: a legal removal (community core) and its undoing
import { holdFile, releaseFile, fileProduct, unpublishEmptyStudioProducts } from "../files/files.js";
import { loadTarget, legalRemove, legalRestore } from "../community/core/moderate.js";

export const KINDS = {
  product_file: {
    exists: async (app, id) => Boolean(await fileProduct(app.db, id)),
    remove: async (app, id) => {
      const changed = await holdFile(app.db, id);
      // A Studio product left with nothing to download goes back to draft, as when its files are removed.
      if (changed) await unpublishEmptyStudioProducts(app.db);
      return changed;
    },
    restore: (app, id) => releaseFile(app.db, id)
  },
  thread: community("thread"),
  post: community("post")
};

function community(type) {
  return {
    exists: async (app, id) => Boolean(await loadTarget(app.db, type, id)),
    remove: async (app, id, reason) => {
      const t = await loadTarget(app.db, type, id);
      if (!t || (t.state === "removed" && t.removedReason === "legal")) return false;
      await legalRemove(app, t, { reason });
      return true;
    },
    restore: async (app, id) => {
      const t = await loadTarget(app.db, type, id);
      return Boolean(t) && legalRestore(app, t);
    }
  };
}

export const MAX_TARGETS = 20;
