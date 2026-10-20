// Telling the uploader (docs/copyright.md, step 3): when an accepted notice takes something down, the account that
// uploaded it gets one email with the work and where (never the claimant's details) and a link to send a
// counter-notice; when no uploader was named, the creator space's owners get it instead, since they may answer.
// Failures are recorded by sendEmail and never undo the decision.
import { first, all } from "../lib/db.js";
import { sendEmail } from "../email/index.js";

export async function tellUploader(app, noticeId) {
  const n = await first(app.db, "SELECT id, work, location, uploader_user_id, creator_id FROM copyright_notices WHERE id = ? AND status = 'accepted'", noticeId);
  if (!n) return;
  const to = n.uploader_user_id
    ? await all(app.db, 'SELECT id, email FROM "user" WHERE id = ?', n.uploader_user_id)
    : n.creator_id ? await all(app.db, `SELECT u.id, u.email FROM creator_members m JOIN "user" u ON u.id = m.user_id WHERE m.creator_id = ? AND m.role = 'owner'`, n.creator_id) : [];
  for (const u of to) {
    try {
      await sendEmail(app, "copyright-takedown", u.email, { work: n.work.slice(0, 500), location: n.location.slice(0, 500),
        url: `${app.config.siteUrl}/copyright-notice?counter=${encodeURIComponent(n.id)}` }, { dedupeKey: `copyright-takedown:${n.id}:${u.id}` });
    } catch (e) { console.error("copyright takedown email", e && e.message); }
  }
}
