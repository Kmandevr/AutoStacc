// The acting team member for a space's settings routes (link lists, filters, rules): signed in, on the space's team
// (anyone else finds nothing), under a per-moderator limit when writing. Shared so no feature imports another.
import { id } from "../../lib/http.js";
import { requireUser } from "../../auth/session.js";
import { limit } from "../../lib/ratelimit.js";
import { requireTeam } from "./access.js";
import { getSpace } from "./posting.js";

export async function teamSpace(app, spaceId, { write = false, name = "community-settings" } = {}) {
  const user = await requireUser(app);
  if (write) await limit(app, name, 60, 600, { by: user.id });
  const space = await requireTeam(app, user, await getSpace(app.db, id(spaceId, "spaceId")));
  return { user, space };
}
