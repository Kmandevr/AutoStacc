// Auto-Stacc: grants every free, visible product of the projects an account follows with Auto-Stacc on. Uses the same
// idempotent grant as claiming a free product by hand (source "free", one per account), so it is safe to run on every
// library load and never duplicates. Paid products are never granted here.
import { grantStmt } from "./grants.js";
import { autoStaccProjectIds } from "../projects/follows.js";
import { listProjectProducts, isFree } from "../catalog/products.js";

export const AUTO_NOTE = "auto-stacc";

// Returns how many products were newly added.
export async function autoStacc(db, user) {
  const projectIds = await autoStaccProjectIds(db, user.id);
  if (!projectIds.length) return 0;
  const free = (await listProjectProducts(db, projectIds)).filter(isFree);
  if (!free.length) return 0;
  const results = await db.batch(free.map((p) =>
    grantStmt(db, { userId: user.id, email: user.email, productId: p.id, sourceType: "free", sourceId: user.id, note: AUTO_NOTE })));
  return results.reduce((n, r) => n + ((r.meta && r.meta.changes) || 0), 0);
}
