// Alerts to the admins (ADMIN_EMAILS) about something waiting for them in the Control Center. One mail per admin per
// key, so a retried request never alerts twice.
import { sendEmail } from "./index.js";

export async function alertAdmins(app, { key, title, lines }) {
  for (const to of app.config.adminEmails) {
    await sendEmail(app, "admin-alert", to, { title, lines, adminUrl: `${app.config.siteUrl}/admin` }, { dedupeKey: `admin-alert:${key}:${to}` });
  }
}
