// Studio API, one product's workspace (docs/studio.md, Overview and Release): everything the Product Studio's header
// and Overview need in one answer (the product, its project and creator, the readiness check, the latest release
// history and a 30-day summary), plus the full history. Owners and editors may read it (the creator's share is the
// owner's only); anyone else gets "nothing here". Figures come from server/studio/insights-data.js.
import { json } from "../lib/http.js";
import { requireUser } from "../auth/session.js";
import { LIMITS, SELLING } from "../creators/policy.js";
import { requireOwnProduct, productViews } from "../creators/products.js";
import { loadReadiness } from "../creators/readiness.js";
import { listEvents } from "../creators/events.js";
import { isOn } from "../lib/features.js";
import { periodTotals } from "./insights-data.js";

const DAY = 86400000;

async function workspace(app, { productId }) {
  const user = await requireUser(app);
  const { product, project, creator, role } = await requireOwnProduct(app.db, productId, user);
  // The last 30 whole UTC days, today included (the same days as Insights' 30-day view).
  const until = new Date(Date.parse(new Date().toISOString().slice(0, 10)) + DAY);
  const since = new Date(until.getTime() - 30 * DAY);
  const [view, readiness, activity, totals] = await Promise.all([
    productViews(app.db, [product]), loadReadiness(app.db, product, creator), listEvents(app.db, product.id, 10),
    periodTotals(app, product.id, since, until)
  ]);
  const owner = role === "owner";
  return json({
    product: view[0],
    project: { id: project.id, name: project.name, slug: project.slug, path: `/${creator.slug}/${project.slug}` },
    creator: { id: creator.id, name: creator.name, slug: creator.slug, trusted: Boolean(creator.trusted), status: creator.status },
    role, readiness, activity,
    summary: { days: 30, orders: totals.orders, units: totals.units, netCents: totals.netCents, creatorShareCents: owner ? totals.creatorShareCents : null,
      downloads: totals.downloads, views: totals.views },
    limits: { ...SELLING, filesPerProduct: LIMITS.filesPerProduct },
    features: { packsStudio: isOn(app, "packs.builder") }
  });
}

async function activity(app, { productId }) {
  const user = await requireUser(app);
  const { product } = await requireOwnProduct(app.db, productId, user);
  const n = Number.parseInt(new URL(app.request.url).searchParams.get("limit") || "50", 10);
  return json({ activity: await listEvents(app.db, product.id, Number.isFinite(n) ? n : 50) });
}

export const routes = [
  ["GET", "/api/studio/products/:productId", workspace],
  ["GET", "/api/studio/products/:productId/activity", activity]
];
