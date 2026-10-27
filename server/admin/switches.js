// Admin, Settings › Switches (owner, 2026-10-16): store-wide on/off switches and the site notice, flipped without a
// deploy. GET lists them with their values; PUT {key, value} changes one of them, audited with the value it replaced.
// Each switch is enforced where its action happens (checkout, free claims, payout requests, sign-up, new creators,
// reviews) and how many communities one account may start; the notice is public through GET /api/site-status (server/settings/status.js). Creator sales, paid
// storage and the usage budget keep their own endpoints, which the Switches section also uses.
import { json, readJson, fail } from "../lib/http.js";
import { requireAdmin } from "../auth/session.js";
import { audit } from "../audit/log.js";
import { getSetting, setSetting, SETTINGS } from "../settings/settings.js";

export const SWITCHES = ["store_sales", "payout_requests", "signups", "creator_signups", "reviews", "site_notice", "community_space_cap"];

const all = async (db) => Object.fromEntries(await Promise.all(SWITCHES.map(async (k) => [k, await getSetting(db, k)])));

async function show(app) {
  await requireAdmin(app);
  return json({ switches: await all(app.db) }, 200, { "Cache-Control": "no-store" });
}

async function change(app) {
  const user = await requireAdmin(app);
  const body = await readJson(app.request, 2048);
  if (!SWITCHES.includes(body.key)) fail(400, "invalid_field", "Unknown switch.", { field: "key" });
  const value = typeof body.value === "string" ? (body.key === "site_notice" ? body.value.trim() : body.value) : null;
  const def = SETTINGS[body.key];
  if (value === null || (def.values ? !def.values.includes(value) : !def.valid(value))) {
    fail(400, "invalid_field", def.values ? `value must be ${def.values.join(" or ")}.` : body.key === "community_space_cap" ? "A whole number from 0 to 99." : "The notice is at most 200 characters on one line.", { field: "value" });
  }
  const was = await getSetting(app.db, body.key);
  if (was !== value) {
    await setSetting(app.db, body.key, value, user.id);
    await audit(app, `settings.${body.key}`, { targetType: "setting", targetId: body.key, detail: { value, was } });
  }
  return json({ switches: await all(app.db) });
}

export const routes = [
  ["GET", "/api/admin/switches", show],
  ["PUT", "/api/admin/switches", change]
];
