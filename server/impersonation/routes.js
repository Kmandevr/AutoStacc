// Impersonation API. POST /api/admin/customers/:userId/impersonate (admin only) starts a support impersonation of an
// existing, non-admin customer; the customer is looked up from the database, never taken from the browser beyond its
// id. POST /api/impersonation/exit ends it and returns to the admin. Rules: server/impersonation/sessions.js, policy.js.
import { json, fail, readJson, str } from "../lib/http.js";
import { requireAdmin, realSession, isAdmin } from "../auth/session.js";
import { startImpersonation, endImpersonation, userById } from "./sessions.js";

export const USER_ID = /^[A-Za-z0-9_-]{8,64}$/;

// The customer an admin may impersonate: exists, isn't an admin, isn't the admin themselves. Not found = 404.
export async function impersonableCustomer(app, admin, userId) {
  const customer = await userById(app.db, str(userId, "userId", { max: 64, pattern: USER_ID }));
  if (!customer) fail(404, "not_found", "No customer with that id.");
  if (customer.id === admin.id || isAdmin(app, customer)) fail(409, "not_impersonable", "Admin accounts can't be impersonated.");
  return customer;
}

// Starts one for the admin's own current session. Used by support impersonation and test purchases.
export async function beginImpersonation(app, { customer, purpose, note, redirect }) {
  const admin = await requireAdmin(app);
  const real = await realSession(app);
  const started = await startImpersonation(app, { admin, sessionId: real.session.id, customer, purpose, note });
  return json({ ok: true, impersonationId: started.id, expiresAt: started.expiresAt, redirect }, 201, { "Set-Cookie": started.setCookie });
}

async function start(app, { userId }) {
  const admin = await requireAdmin(app);
  const body = await readJson(app.request);
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : "";
  const customer = await impersonableCustomer(app, admin, userId);
  return beginImpersonation(app, { customer, purpose: "support", note, redirect: "/dashboard" });
}

async function exit(app) {
  const real = await realSession(app);
  const ended = await endImpersonation(app, real && real.user);
  return json({ ok: true, ended: ended.ended, redirect: real && isAdmin(app, real.user) ? "/admin" : "/" }, 200, { "Set-Cookie": ended.setCookie });
}

export const routes = [
  ["POST", "/api/admin/customers/:userId/impersonate", start],
  ["POST", "/api/impersonation/exit", exit, { impersonation: "exit" }]
];
