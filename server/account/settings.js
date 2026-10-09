// Settings API for the signed-in account: its signed-in devices (list, sign one out, sign out everywhere else) and
// its optional emails. Name and password stay Better Auth endpoints (/api/auth/update-user, /change-password).
// None of this is for support staff: an impersonating admin sees no devices and can't change anything here
// (writes are refused by server/impersonation/policy.js, and the device list refuses itself).
import { json, fail, readJson, str } from "../lib/http.js";
import { requireUser, realSession, impersonationIdOf } from "../auth/session.js";
import { createAuth } from "../auth/index.js";
import { listDevices, tokenOf } from "../auth/devices.js";
import { getPreferences, setPreferences, KINDS } from "../email/preferences.js";
import { limit } from "../lib/ratelimit.js";
import { syncNewsList } from "../email/contacts.js";

async function ownAccount(app) {
  const user = await requireUser(app);
  if (impersonationIdOf(app)) fail(403, "impersonation_blocked", "That isn't available while impersonating a customer. Exit impersonation first.");
  return user;
}

async function devices(app) {
  const user = await ownAccount(app);
  const [real, devices] = await Promise.all([realSession(app), listDevices(app.db, user.id)]);
  const list = devices.map((d) => ({ ...d, current: d.id === real.session.id }));
  return json({ devices: list });
}

// Signing out one device: Better Auth deletes the session after checking it is this account's. Someone else's
// session id, or one already gone, answers 404 like any other session that isn't there.
async function revoke(app, { sessionId }) {
  const user = await ownAccount(app);
  await limit(app, "devices", 20, 60);
  const sid = str(sessionId, "sessionId", { max: 100 });
  if (sid === (await realSession(app)).session.id) fail(400, "current_session", "That's this device. Use Log out instead.");
  const token = await tokenOf(app.db, user.id, sid);
  if (!token) fail(404, "not_found", "No such device.");
  await createAuth(app).api.revokeSession({ body: { token }, headers: app.request.headers });
  return json({ ok: true });
}

async function revokeOthers(app) {
  await ownAccount(app);
  await limit(app, "devices", 20, 60);
  await createAuth(app).api.revokeOtherSessions({ headers: app.request.headers });
  return json({ ok: true });
}

async function preferences(app) {
  const user = await requireUser(app);
  return json({ preferences: await getPreferences(app.db, user.id) });
}

async function updatePreferences(app) {
  const user = await ownAccount(app);
  await limit(app, "email-preferences", 30, 60);
  const body = await readJson(app.request);
  const changes = {};
  for (const [name, value] of Object.entries(body)) {
    if (!(name in KINDS)) fail(400, "invalid_field", `Unknown email preference: ${String(name).slice(0, 40)}.`);
    if (typeof value !== "boolean") fail(400, "invalid_field", `${name} must be true or false.`);
    changes[name] = value;
  }
  const before = await getPreferences(app.db, user.id);
  const next = await setPreferences(app.db, user.id, changes);
  if (before.platformNews !== next.platformNews) syncNewsList(app, user.email, next.platformNews);
  return json({ preferences: next });
}

export const routes = [
  ["GET", "/api/account/devices", devices],
  ["POST", "/api/account/devices/sign-out-others", revokeOthers],
  ["POST", "/api/account/devices/:sessionId/sign-out", revoke],
  ["GET", "/api/account/email-preferences", preferences],
  ["PUT", "/api/account/email-preferences", updatePreferences]
];
