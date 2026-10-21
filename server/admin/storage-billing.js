// Admin, paid creator storage (server/billing/): the owner's switches (billing on or off, the rate), every plan with its
// latest measurement, statements waiting or overdue, the billing log, and per creator the daily measurements behind a
// statement, to answer a question or a dispute. Waiving an open statement (a credit) and refunding a paid one are
// audited and land in the creator's own billing log. Turning billing on needs a rate; nothing here charges anyone.
// Also AutoStacc's storage cap as base + paid = effective (the paid part grows with active plans; server/usage/).
import { json, readJson, fail, id, str } from "../lib/http.js";
import { requireAdmin } from "../auth/session.js";
import { audit } from "../audit/log.js";
import { all, first } from "../lib/db.js";
import { setSetting } from "../settings/settings.js";
import { capParts } from "../usage/usage.js";
import { billingSettings, planOf, logOf, rescalePlans } from "../billing/plans.js";
import { statementsOf, daysOf, publicStatement } from "../billing/statements.js";
import { waive, refund } from "../billing/payments.js";

async function state(app) {
  const { db } = app;
  const [settings, plans, statements, log, cap] = await Promise.all([
    billingSettings(db),
    all(db, `SELECT p.creator_id, p.status, p.cap_cents, p.cap_bytes, p.started_at, c.name, c.slug,
        (SELECT used_bytes FROM storage_usage_days d WHERE d.creator_id = p.creator_id ORDER BY day DESC LIMIT 1) AS last_used_bytes,
        (SELECT day FROM storage_usage_days d WHERE d.creator_id = p.creator_id ORDER BY day DESC LIMIT 1) AS last_day
      FROM storage_plans p JOIN creators c ON c.id = p.creator_id ORDER BY p.updated_at DESC LIMIT 500`),
    all(db, `SELECT s.*, c.name FROM storage_statements s JOIN creators c ON c.id = s.creator_id
      WHERE s.status IN ('open', 'carried', 'disputed') OR s.issued_at > ? ORDER BY s.issued_at DESC LIMIT 200`, new Date(Date.now() - 90 * 86400000).toISOString()),
    all(db, "SELECT l.*, c.name FROM storage_billing_log l JOIN creators c ON c.id = l.creator_id ORDER BY l.at DESC LIMIT 100"),
    capParts(db)
  ]);
  const now = new Date().toISOString();
  const activeCaps = plans.filter((p) => p.status === "active").reduce((a, p) => a + p.cap_bytes, 0);
  return {
    settings,
    // AutoStacc's storage cap grows by what active plans hold above free storage (server/usage/; #142): base + paid = cap.
    platform: { baseCapBytes: cap.baseBytes, paidCapBytes: cap.paidBytes, capBytes: cap.capBytes, activePaidLimitBytes: activeCaps },
    plans: plans.map((p) => ({ creatorId: p.creator_id, name: p.name, slug: p.slug, status: p.status, capCents: p.cap_cents, capBytes: p.cap_bytes, startedAt: p.started_at, lastUsedBytes: p.last_used_bytes, lastDay: p.last_day })),
    statements: statements.map((s) => ({ ...publicStatement(s), creatorId: s.creator_id, name: s.name, overdue: s.status === "disputed" || (s.status === "open" && s.due_at < now) })),
    log: log.map((l) => ({ at: l.at, creatorId: l.creator_id, name: l.name, actor: l.actor, action: l.action, statementId: l.statement_id, detail: JSON.parse(l.detail || "{}") }))
  };
}

async function show(app) {
  await requireAdmin(app);
  return json(await state(app), 200, { "Cache-Control": "no-store" });
}

async function change(app) {
  const user = await requireAdmin(app);
  const body = await readJson(app.request, 1024);
  if (body.state === undefined && body.rate === undefined) fail(400, "invalid_field", "Nothing to change.");
  if (body.state !== undefined && !["on", "off"].includes(body.state)) fail(400, "invalid_field", "state must be on or off.", { field: "state" });
  if (body.rate !== undefined && body.rate !== null && (!Number.isInteger(body.rate) || body.rate < 1 || body.rate > 999999)) {
    fail(400, "invalid_field", "rate is hundredths of a cent per GB-month, a whole number from 1 to 999999 (500 = $0.05), or null.", { field: "rate" });
  }
  const current = await billingSettings(app.db);
  const rate = body.rate === undefined ? current.rate : body.rate;
  if ((body.state ?? current.state) === "on" && !rate) fail(409, "rate_unset", "Set a rate before turning paid storage on.");
  if (body.rate !== undefined) {
    await setSetting(app.db, "storage_rate", rate === null ? "unset" : String(rate), user.id);
    // Every plan's monthly cap buys a different limit at the new rate (logged for each creator).
    const plans = rate === current.rate ? 0 : await rescalePlans(app.db, rate, user.id);
    await audit(app, "storage_billing.rate_set", { targetType: "setting", targetId: "storage_rate", detail: { rate, was: current.rate, plans } });
  }
  if (body.state !== undefined) {
    await setSetting(app.db, "storage_billing", body.state, user.id);
    await audit(app, body.state === "on" ? "storage_billing.on" : "storage_billing.off", { targetType: "setting", targetId: "storage_billing", detail: { rate } });
  }
  return json(await state(app));
}

async function creator(app, { creatorId }) {
  await requireAdmin(app);
  const c = await first(app.db, "SELECT id, name, slug FROM creators WHERE id = ?", id(creatorId, "creatorId"));
  if (!c) fail(404, "not_found", "Nothing here.");
  const url = new URL(app.request.url);
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(url.searchParams.get("period") || "") ? url.searchParams.get("period") : new Date().toISOString().slice(0, 7);
  const [plan, statements, log, days] = await Promise.all([planOf(app.db, c.id), statementsOf(app.db, c.id), logOf(app.db, c.id, 200), daysOf(app.db, c.id, period)]);
  return json({ creator: c, plan, period, days: days.map((d) => ({ ...d, by_part: JSON.parse(d.by_part || "{}") })), statements: statements.map(publicStatement),
    log: log.map((l) => ({ ...l, detail: JSON.parse(l.detail || "{}") })) }, 200, { "Cache-Control": "no-store" });
}

const act = (verb, fn) => async (app, { statementId }) => {
  const user = await requireAdmin(app);
  const body = await readJson(app.request, 1024);
  const note = str(body.note, "note", { min: 3, max: 300 }).trim();
  const s = await first(app.db, "SELECT * FROM storage_statements WHERE id = ?", id(statementId, "statementId"));
  if (!s) fail(404, "not_found", "Nothing here.");
  await fn(app, s, user.id, note);
  await audit(app, `storage_billing.${verb}`, { targetType: "storage_statement", targetId: s.id, detail: { creatorId: s.creator_id, period: s.period, amountCents: s.amount_cents, note } });
  return json(await state(app));
};

export const routes = [
  ["GET", "/api/admin/storage-billing", show],
  ["PUT", "/api/admin/storage-billing", change],
  ["GET", "/api/admin/storage-billing/creators/:creatorId", creator],
  ["POST", "/api/admin/storage-billing/statements/:statementId/waive", act("waived", waive)],
  ["POST", "/api/admin/storage-billing/statements/:statementId/refund", act("refunded", refund)]
];
