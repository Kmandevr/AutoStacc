// The acting team member for a space's settings routes (link lists, filters, rules): signed in, on the space's team
// (anyone else finds nothing), a manager when writing (owner, 2026-10-27), under a per-moderator limit when writing. Shared so no feature imports another.
import { id } from "../../lib/http.js";
import { requireUser } from "../../auth/session.js";
import { limit } from "../../lib/ratelimit.js";
import { requireTeam, requireManager } from "./access.js";
import { getSpace } from "./posting.js";

export async function teamSpace(app, spaceId, { write = false, name = "community-settings" } = {}) {
  const user = await requireUser(app);
  if (write) await limit(app, name, 60, 600, { by: user.id });
  const found = await getSpace(app.db, id(spaceId, "spaceId"));
  // Reading is for the whole team; changing settings is for the space's managers (moderators moderate only).
  const space = write ? await requireManager(app, user, found) : await requireTeam(app, user, found);
  return { user, space };
}
