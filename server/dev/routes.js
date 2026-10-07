// Development and test helpers, answered with 404 anywhere else (APP_ENV must be development or test).
// GET /api/dev/outbox: the emails the "log" provider kept (verification and reset links for local testing).
import { json, fail } from "../lib/http.js";
import { all } from "../lib/db.js";

async function outbox(app) {
  if (!app.config.devLike || app.config.emailProvider !== "log") fail(404, "not_found", "Nothing here.");
  const to = new URL(app.request.url).searchParams.get("to");
  const mails = await all(app.db,
    "SELECT kind, to_email, subject, body_text, created_at FROM email_events WHERE (? IS NULL OR to_email = ?) ORDER BY created_at DESC LIMIT 50",
    to ? to.toLowerCase() : null, to ? to.toLowerCase() : null);
  return json({ mails });
}

export const routes = [["GET", "/api/dev/outbox", outbox]];
