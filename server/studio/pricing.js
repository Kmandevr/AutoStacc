// Studio API, a product's Pricing section (docs/studio.md): its list price, the creator's own sales (one running or
// scheduled at a time, never edited: end it and make another) and an estimate of what each sale of it earns, from the
// server's own split (server/revenue/split.js). The price buyers pay is still combined only in server/cart/pricing.js;
// if a store-wide sale from AutoStacc is lower, that one applies and storeSale says so. Owners and editors may use it
// (earnings figures are the owner's only); anyone else gets "nothing here". Rows: server/promotions/creator-sales.js.
import { json, readJson, fail } from "../lib/http.js";
import { requireUser } from "../auth/session.js";
import { limit } from "../lib/ratelimit.js";
import { SELLING, feeBpsOf } from "../creators/policy.js";
import { requireOwnProduct } from "../creators/products.js";
import { recordEvent } from "../creators/events.js";
import { splitLine } from "../revenue/split.js";
import { mayPublish } from "../copyright/standing.js";
import { runningSales, salePrice, MIN_CHARGE_CENTS } from "../promotions/promotions.js";
import { CREATOR_SALE, cleanSaleInput, listCreatorSales, createCreatorSale, endCreatorSale, saleStatus } from "../promotions/creator-sales.js";

// Price, net, fee and share for one buyer paying priceCents (fee and share null for editors).
function estimate(priceCents, feeBps, owner) {
  const s = splitLine({ lineTotalCents: priceCents, feeBps });
  return { priceCents, netCents: s.netCents, platformFeeCents: owner ? s.platformFeeCents : null, creatorShareCents: owner ? s.creatorShareCents : null };
}

const saleView = (p, product, t) => ({
  id: p.id, percentOff: p.percent_off || null, amountOffCents: p.amount_off_cents || null, startsAt: p.starts_at, endsAt: p.ends_at || null,
  status: saleStatus(p, t), salePriceCents: salePrice(product, [{ ...p, starts_at: "", ends_at: null }]).priceCents
});

export async function pricingOf(db, { product, creator, role }) {
  const t = new Date().toISOString();
  const [mine, running] = await Promise.all([listCreatorSales(db, { productId: product.id, creatorId: creator.id }), runningSales(db, t)]);
  const owner = role === "owner";
  const feeBps = feeBpsOf(creator);
  const sales = mine.map((p) => saleView(p, product, t));
  const best = salePrice(product, running);
  // The sale estimate: the price buyers get now when a sale lowers it, else the creator's scheduled sale's price.
  const scheduled = sales.find((s) => s.status === "scheduled");
  const saleCents = best.sale ? best.priceCents : scheduled ? scheduled.salePriceCents : null;
  const storeSale = best.sale && !best.sale.creator_id
    ? { name: best.sale.name, percentOff: best.sale.percent_off || null, amountOffCents: best.sale.amount_off_cents || null, endsAt: best.sale.ends_at || null, priceCents: best.priceCents }
    : null;
  return {
    priceCents: product.price_cents, currency: product.currency, feeBps: owner ? feeBps : null,
    effectivePriceCents: best.priceCents,
    estimate: { list: product.price_cents > 0 ? estimate(product.price_cents, feeBps, owner) : null, sale: saleCents !== null ? estimate(saleCents, feeBps, owner) : null },
    sales, storeSale,
    limits: { ...CREATOR_SALE, minChargeCents: MIN_CHARGE_CENTS, minPriceCents: SELLING.minPriceCents, maxPriceCents: SELLING.maxPriceCents }
  };
}

async function get(app, { productId }) {
  const user = await requireUser(app);
  const own = await requireOwnProduct(app.db, productId, user);
  return json(await pricingOf(app.db, own));
}

async function create(app, { productId }) {
  const user = await requireUser(app);
  await limit(app, "studio-sale", 30, 3600);
  const own = await requireOwnProduct(app.db, productId, user);
  if (!(await mayPublish(app.db, user.id))) fail(403, "copyright_paused", "Your account has copyright strikes, so it can't price products for now. See the copyright policy.");
  const sale = cleanSaleInput(await readJson(app.request, 2048), own.product.price_cents);
  const row = await createCreatorSale(app.db, { product: own.product, creatorId: own.creator.id, userId: user.id, sale });
  await recordEvent(app.db, { productId: own.product.id, kind: "sale_created", actorId: user.id,
    detail: { saleId: row.id, percentOff: sale.percentOff, amountOffCents: sale.amountOffCents, startsAt: sale.startsAt, endsAt: sale.endsAt } });
  return json({ sale: saleView(row, own.product, new Date().toISOString()), pricing: await pricingOf(app.db, own) }, 201);
}

async function end(app, { productId, saleId }) {
  const user = await requireUser(app);
  const own = await requireOwnProduct(app.db, productId, user);
  const r = await endCreatorSale(app.db, { product: own.product, creatorId: own.creator.id, saleId });
  if (r.changed) await recordEvent(app.db, { productId: own.product.id, kind: "sale_ended", actorId: user.id, detail: { saleId: r.sale.id, was: r.was } });
  return json({ ok: true, status: r.was === "scheduled" && r.changed ? "deleted" : "ended", pricing: await pricingOf(app.db, own) });
}

export const routes = [
  ["GET", "/api/studio/products/:productId/pricing", get],
  ["POST", "/api/studio/products/:productId/sales", create],
  ["DELETE", "/api/studio/products/:productId/sales/:saleId", end]
];
