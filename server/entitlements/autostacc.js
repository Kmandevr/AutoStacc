// Auto-Stacc: grants every free, visible product of the projects an account follows with Auto-Stacc on. Uses the same
// idempotent grant as claiming a free product by hand (source "free", one per account), so it is safe to run on every
// library load and never duplicates. Paid products are never granted here, nor free ones from a creator space whose
// selling is paused by copyright strikes.
import { grantStmt } from "./grants.js";
import { autoStaccProjectIds } from "../projects/follows.js";
import { listProjectProducts, isFree } from "../catalog/products.js";
import { pausedByCopyright } from "../payments/creator-sales.js";

export const AUTO_NOTE = "auto-stacc";

// Returns how many products were newly added.
export async function autoStacc(db, user) {
  const projectIds = await autoStaccProjectIds(db, user.id);
  if (!projectIds.length) return 0;
  const candidates = (await listProjectProducts(db, projectIds)).filter(isFree);
  // Not from a creator space whose selling is paused by copyright strikes (it resumes once they expire).
  const paused = candidates.length ? await pausedByCopyright(db, candidates.map((p) => p.id)) : new Set();
  const free = candidates.filter((p) => !paused.has(p.id));
  if (!free.length) return 0;
  const results = await db.batch(free.map((p) =>
    grantStmt(db, { userId: user.id, email: user.email, productId: p.id, sourceType: "free", sourceId: user.id, note: AUTO_NOTE })));
  return results.reduce((n, r) => n + ((r.meta && r.meta.changes) || 0), 0);
}
