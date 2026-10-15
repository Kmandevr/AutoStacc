// Admin, creator sales switch: whether creators' products can be bought. GET shows the state (open, paused by the
// owner, or waiting for the marketplace Stripe key); PUT {open} pauses or reopens them; pausing closes the payment pages
// already open for them (closedCheckouts). Reopening without the key set
// is allowed but stays closed until it is (server/payments/creator-sales.js). Audited.
import { json, readJson, fail } from "../lib/http.js";
import { requireAdmin } from "../auth/session.js";
import { audit } from "../audit/log.js";
import { setSetting } from "../settings/settings.js";
import { creatorSalesState, closeCreatorCheckouts } from "../payments/creator-sales.js";

async function show(app) {
  await requireAdmin(app);
  return json({ creatorSales: await creatorSalesState(app) });
}

async function change(app) {
  const user = await requireAdmin(app);
  const body = await readJson(app.request, 1024);
  if (typeof body.open !== "boolean") fail(400, "invalid_field", "open must be true or false.", { field: "open" });
  await setSetting(app.db, "creator_sales", body.open ? "open" : "paused", user.id);
  const closedCheckouts = body.open ? 0 : await closeCreatorCheckouts(app);
  await audit(app, body.open ? "settings.creator_sales_opened" : "settings.creator_sales_paused",
    { targetType: "setting", targetId: "creator_sales", ...(body.open ? {} : { detail: { closedCheckouts } }) });
  return json({ creatorSales: await creatorSalesState(app), ...(body.open ? {} : { closedCheckouts }) });
}

export const routes = [
  ["GET", "/api/admin/creator-sales", show],
  ["PUT", "/api/admin/creator-sales", change]
];
