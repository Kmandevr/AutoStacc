// Level 3, "text only" (docs/community-safety.md, "Copyright: tiered strikes"): an account at three strikes can't
// change anything in the Studio (making or editing products, uploads, Pacs, sites, images, library pieces, team
// invites), checked once for every state-changing /api/studio/* request by server/app.js. What stays open: deleting
// things (people can always take their own work down), getting paid what they've earned (payouts, the payout
// account), paying storage statements, and looking at an invitation. Routes opt out with { copyright: "allow" }.
// Reading the Studio stays open, so earnings and history are still there.
import { fail } from "../lib/http.js";
import { currentUser } from "../auth/session.js";
import { accountLevel, anyAccountStanding } from "./standing.js";

const WRITES = new Set(["POST", "PUT", "PATCH"]);

export async function copyrightGate(app, { path, route }) {
  if (!WRITES.has(app.request.method) || !path.startsWith("/api/studio/") || !route || route.opts.copyright === "allow") return;
  if (!(await anyAccountStanding(app.db))) return;
  const user = await currentUser(app);
  if (!user) return; // the route itself answers 401
  if ((await accountLevel(app.db, user.id)).level >= 3) {
    fail(403, "copyright_text_only", "Your account has three copyright strikes, so the Studio is closed to it for now (you can still delete things and be paid what you've earned). See the copyright policy.");
  }
}
