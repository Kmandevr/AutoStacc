// The composer's Preview tab (owner, 2026-10-20): POST /api/community/preview formats a draft exactly as a post will
// look, with the same formatter and the same switched-on extensions, and stores nothing. Its own switch
// (community.preview): off, the composer shows only its Write tab.
import { json, readJson, str } from "../../../lib/http.js";
import { requireUser } from "../../../auth/session.js";
import { limit } from "../../../lib/ratelimit.js";
import { format, MAX_BODY } from "../../core/format.js";
import { formatExtensions } from "../../core/hooks.js";

async function preview(app) {
  await requireUser(app);
  await limit(app, "community-preview", 120, 600);
  const body = await readJson(app.request, 24 * 1024);
  return json({ html: format(str(body.body ?? "", "body", { min: 0, max: MAX_BODY * 2 }), formatExtensions(app)) }, 200, { "Cache-Control": "no-store" });
}

export default { name: "preview", switch: "community.preview", routes: [["POST", "/api/community/preview", preview]] };
