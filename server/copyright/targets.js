// What a copyright notice can take down, and how each owning module removes and restores it (docs/copyright.md,
// step 3). The one file here that calls other areas, always through their own exported functions; copyright stores
// only what it did (copyright_notice_targets). Only something that's up can be taken down (security review): a file
// already held or not published, or a post already removed or hidden, is refused, so restoring always means "back
// to how it was" and one notice's counter-notice can never undo another's hold or another kind of removal. Kinds:
//   product_file   a product's file: held (reaches nobody, past buyers included; bytes kept) and released
//   thread, post   a community take or post: a legal removal (community core) and its undoing
import { holdFile, releaseFile, fileProduct, unpublishEmptyStudioProducts } from "../files/files.js";
import { sellersOfProducts } from "../creators/creators.js";
import { refreshContents } from "../discovery/contents.js";
import { loadTarget, legalRemove, legalRestore } from "../community/core/moderate.js";

export const KINDS = {
  product_file: {
    // → null if it can be taken down for this notice, else why not.
    problem: async (app, id, creatorId) => {
      const f = await fileProduct(app.db, id);
      if (!f) return "missing";
      if (f.held_at || f.status !== "published" || !f.active) return "not_up";
      if (creatorId) {
        const [seller] = await sellersOfProducts(app.db, [f.product_id]);
        if (!seller || seller.creator_id !== creatorId) return "other_creator";
      }
      return null;
    },
    remove: async (app, id) => {
      const changed = await holdFile(app.db, id);
      // A Studio product left with nothing to download goes back to draft, as when its files are removed; what the
      // store says it contains is worked out again without the held file.
      if (changed) await afterChange(app, id);
      return changed;
    },
    restore: async (app, id) => {
      const changed = await releaseFile(app.db, id);
      if (changed) await afterChange(app, id);
      return changed;
    }
  },
  thread: community("thread"),
  post: community("post")
};

async function afterChange(app, fileId) {
  await unpublishEmptyStudioProducts(app.db);
  const f = await fileProduct(app.db, fileId);
  if (f) await refreshContents(app, f.product_id).catch((e) => console.error("copyright contents refresh", e && e.message));
}

function community(type) {
  return {
    problem: async (app, id) => {
      const t = await loadTarget(app.db, type, id);
      if (!t) return "missing";
      return t.state === "visible" && t.thread.state === "visible" ? null : "not_up";
    },
    remove: async (app, id, reason) => {
      const t = await loadTarget(app.db, type, id);
      if (!t || t.state !== "visible") return false;
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
