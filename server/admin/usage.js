// Admin, usage and storage (the budget guard, server/usage/): GET shows this month's meters against the free allowance,
// the level (ok, alert from 80%, pause from 95%), whether spending past it is allowed this month, the storage cap and
// how many versions wait for the allowance. PUT { allowThisMonth } lets processing go past the allowance until the
// month ends (or takes that back); PUT { capGb } sets how much storage creators' uploads may fill. Audited.
import { json, readJson, fail } from "../lib/http.js";
import { first } from "../lib/db.js";
import { requireAdmin } from "../auth/session.js";
import { audit } from "../audit/log.js";
import { setSetting } from "../settings/settings.js";
import { budget } from "../usage/usage.js";

async function state(app) {
  const b = await budget(app);
  const waiting = (await first(app.db, "SELECT COUNT(*) AS n FROM processing_jobs WHERE status = 'queued'")).n;
  return { usage: { ...b, waiting } };
}

async function show(app) {
  await requireAdmin(app);
  return json(await state(app));
}

async function change(app) {
  const user = await requireAdmin(app);
  const body = await readJson(app.request, 1024);
  if (body.allowThisMonth === undefined && body.capGb === undefined) fail(400, "invalid_field", "Nothing to change.");
  if (body.allowThisMonth !== undefined) {
    if (typeof body.allowThisMonth !== "boolean") fail(400, "invalid_field", "allowThisMonth must be true or false.", { field: "allowThisMonth" });
    const { month } = await budget(app);
    await setSetting(app.db, "usage_override", body.allowThisMonth ? month : "none", user.id);
    await audit(app, body.allowThisMonth ? "usage.spending_allowed" : "usage.spending_stopped", { targetType: "setting", targetId: "usage_override", detail: { month } });
  }
  if (body.capGb !== undefined) {
    if (!Number.isInteger(body.capGb) || body.capGb < 1 || body.capGb > 9999) fail(400, "invalid_field", "capGb must be a whole number of GB from 1 to 9999.", { field: "capGb" });
    await setSetting(app.db, "storage_cap_gb", String(body.capGb), user.id);
    await audit(app, "usage.storage_cap_set", { targetType: "setting", targetId: "storage_cap_gb", detail: { gb: body.capGb } });
  }
  return json(await state(app));
}

export const routes = [
  ["GET", "/api/admin/usage", show],
  ["PUT", "/api/admin/usage", change]
];
