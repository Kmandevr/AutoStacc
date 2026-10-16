// Studio API, storage and paid storage (server/billing/, docs/creators.md "Paid storage"). Every member sees what the
// creator stores, split by kind, against its limit (the same figures uploads are checked against). Only the owner sees
// and changes paid storage: the plan, this month so far, statements with their daily measurements, the billing log and
// paying a statement. Other creators' storage looks like nothing there.
import { json, readJson, fail, id } from "../lib/http.js";
import { requireUser } from "../auth/session.js";
import { limit } from "../lib/ratelimit.js";
import { requireCreator } from "../creators/creators.js";
import { quotaOf, includedQuotaOf } from "../creators/policy.js";
import { storageByPart } from "../creators/storage.js";
import { planOf, setPlan, cancelPlan, billingSettings, logOf } from "../billing/plans.js";
import { statementsOf, statementOfCreator, daysOf, monthToDate, publicStatement } from "../billing/statements.js";
import { startCheckout } from "../billing/payments.js";
import { maxMonthlyCents } from "../billing/policy.js";
import { processPaymentEvent } from "../payments/events.js";
import { first, randomToken } from "../lib/db.js";

const NO_STORE = { "Cache-Control": "no-store" };
const publicPlan = (p) => p && { status: p.status, capBytes: p.cap_bytes, startedAt: p.started_at, cancelledAt: p.cancelled_at, endedAt: p.ended_at };
const publicDay = (d) => ({ day: d.day, usedBytes: d.used_bytes, includedBytes: d.included_bytes, billableBytes: d.billable_bytes, rate: d.rate, byPart: JSON.parse(d.by_part || "{}") });
const publicLog = (l) => ({ at: l.at, by: l.actor === "system" ? "AutoStacc" : "account", action: l.action, statementId: l.statement_id, detail: JSON.parse(l.detail || "{}") });

async function show(app, { creatorId }) {
  const user = await requireUser(app);
  const { creator, role } = await requireCreator(app.db, creatorId, user);
  const parts = await storageByPart(app.db, creator.id);
  const usedBytes = Object.values(parts).reduce((a, b) => a + Number(b), 0);
  const storage = { usedBytes, byPart: parts, includedBytes: includedQuotaOf(creator), quotaBytes: quotaOf(creator) };
  if (role !== "owner") return json({ storage }, 200, NO_STORE);
  const [settings, plan, statements, log, month] = await Promise.all([billingSettings(app.db), planOf(app.db, creator.id), statementsOf(app.db, creator.id),
    logOf(app.db, creator.id, 50), monthToDate(app.db, creator.id)]);
  return json({ storage, billing: { available: settings.on, rate: settings.rate, currency: settings.currency, graceDays: settings.graceDays,
    minChargeCents: settings.minChargeCents, maxCapGb: settings.maxCapGb,
    maxMonthlyCents: plan && plan.status === "active" ? maxMonthlyCents(plan.cap_bytes, storage.includedBytes, settings.rate) : null },
  plan: publicPlan(plan), monthToDate: month, statements: statements.map(publicStatement), log: log.map(publicLog) }, 200, NO_STORE);
}

const owner = async (app, creatorId) => {
  const user = await requireUser(app);
  return { user, ...(await requireCreator(app.db, creatorId, user, ["owner"])) };
};

async function changePlan(app, { creatorId }) {
  const { user, creator } = await owner(app, creatorId);
  await limit(app, "studio-storage-plan", 20, 3600);
  const body = await readJson(app.request, 512);
  const plan = await setPlan(app, creator, user.id, body.capGb, includedQuotaOf(creator));
  return json({ plan: publicPlan(plan) });
}

async function cancel(app, { creatorId }) {
  const { user, creator } = await owner(app, creatorId);
  return json({ plan: publicPlan(await cancelPlan(app, creator, user.id)) });
}

async function statement(app, { creatorId, statementId }) {
  const { creator } = await owner(app, creatorId);
  const s = await statementOfCreator(app.db, creator.id, id(statementId, "statementId"));
  if (!s) fail(404, "not_found", "Nothing here.");
  return json({ statement: publicStatement(s), days: (await daysOf(app.db, creator.id, s.period)).map(publicDay) }, 200, NO_STORE);
}

async function pay(app, { creatorId, statementId }) {
  const { user, creator } = await owner(app, creatorId);
  await limit(app, "studio-storage-pay", 10, 3600);
  const s = await statementOfCreator(app.db, creator.id, id(statementId, "statementId"));
  if (!s) fail(404, "not_found", "Nothing here.");
  return json(await startCheckout(app, creator, s, user), 201);
}

// Development and tests only: what Stripe would report for a mock storage payment page.
async function mockPay(app) {
  if (!app.config.devLike || app.config.paymentProvider !== "mock") fail(404, "not_found", "Nothing here.");
  const body = await readJson(app.request);
  const outcome = String(body.outcome || "");
  if (!["paid", "failed", "expired"].includes(outcome)) fail(400, "invalid_field", "outcome must be paid, failed or expired.", { field: "outcome" });
  const s = await first(app.db, "SELECT * FROM storage_statements WHERE id = ? AND provider = 'mock' AND provider_session_id = ?", String(body.statementId || ""), String(body.sessionId || ""));
  if (!s) fail(404, "not_found", "No mock storage payment like that.");
  const ev = { provider: "mock", id: body.eventId ? String(body.eventId).slice(0, 60) : `mock_evt_${randomToken(12)}`, rawType: `mock.storage.${outcome}`, livemode: false,
    statementId: s.id, sessionId: s.provider_session_id, type: outcome, amount: body.amountCents ?? s.amount_cents, currency: s.currency, paymentId: `mock_pi_${s.id}` };
  return json({ outcome: (await processPaymentEvent(app, ev)).outcome });
}

export const routes = [
  ["GET", "/api/studio/creators/:creatorId/storage", show],
  ["PUT", "/api/studio/creators/:creatorId/storage/plan", changePlan],
  ["DELETE", "/api/studio/creators/:creatorId/storage/plan", cancel],
  ["GET", "/api/studio/creators/:creatorId/storage/statements/:statementId", statement],
  ["POST", "/api/studio/creators/:creatorId/storage/statements/:statementId/checkout", pay],
  ["POST", "/api/dev/mock-storage-payment", mockPay, { impersonation: "test-payments" }]
];
