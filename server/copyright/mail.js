// Telling the uploader (docs/copyright.md, step 3): when an accepted notice takes something of theirs down, the
// account that uploaded it gets one email with the work and where (never the claimant's details) and a link to
// send a counter-notice. Failures are recorded by sendEmail and never undo the decision.
import { first } from "../lib/db.js";
import { sendEmail } from "../email/index.js";

export async function tellUploader(app, noticeId) {
  const n = await first(app.db, `SELECT n.id, n.work, n.location, u.email FROM copyright_notices n JOIN "user" u ON u.id = n.uploader_user_id
    WHERE n.id = ? AND n.status = 'accepted'`, noticeId);
  if (!n) return;
  try {
    await sendEmail(app, "copyright-takedown", n.email, { work: n.work.slice(0, 500), location: n.location.slice(0, 500),
      url: `${app.config.siteUrl}/copyright-notice?counter=${encodeURIComponent(n.id)}` }, { dedupeKey: `copyright-takedown:${n.id}` });
  } catch (e) { console.error("copyright takedown email", e && e.message); }
}
