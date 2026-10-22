// A space's look (owner, 2026-10-20; docs/community.md, "Features"): an accent colour and a banner, each picked from
// AutoStacc's presets (never free colours or images, so every space stays readable and nothing hostile can be set).
// The page's script (js/community-look.js) reads GET /api/community/spaces/:id/look and applies it in the browser,
// since the pages are shared and cached. Its own switch (community.look): off, spaces look the same.
import { json, readJson, fail, id } from "../../../lib/http.js";
import { first, run, now } from "../../../lib/db.js";
import { teamSpace } from "../../core/team-space.js";
import { getSpace } from "../../core/posting.js";

export const ACCENTS = { blue: "#4f8cff", green: "#2fbf71", amber: "#f0a020", red: "#e5484d", violet: "#8e5cf0", pink: "#e255a1", teal: "#14b8a6", slate: "#7a869a" };
export const BANNERS = ["none", "waves", "grid", "dusk", "stack", "static"];

async function read(app, { spaceId }) {
  const space = await getSpace(app.db, id(spaceId, "spaceId"));
  if (!space) fail(404, "not_found", "Not found.");
  const l = await first(app.db, "SELECT accent, banner FROM community_space_look WHERE space_id = ?", space.id);
  return json({ accent: l ? l.accent : null, color: l && ACCENTS[l.accent] ? ACCENTS[l.accent] : null, banner: l ? l.banner : "none", accents: Object.keys(ACCENTS), banners: BANNERS }, 200, { "Cache-Control": "public, max-age=60" });
}

async function write(app, { spaceId }) {
  const { space } = await teamSpace(app, spaceId, { write: true, name: "community-look" });
  const b = await readJson(app.request);
  if (!Object.hasOwn(ACCENTS, b.accent)) fail(400, "invalid_field", "Pick one of the colours.", { field: "accent" });
  if (!BANNERS.includes(b.banner)) fail(400, "invalid_field", "Pick one of the banners.", { field: "banner" });
  await run(app.db, `INSERT INTO community_space_look (space_id, accent, banner, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(space_id) DO UPDATE SET accent = excluded.accent, banner = excluded.banner, updated_at = excluded.updated_at`, space.id, b.accent, b.banner, now());
  return json({ ok: true });
}

export default {
  name: "look",
  switch: "community.look",
  routes: [["GET", "/api/community/spaces/:spaceId/look", read], ["PUT", "/api/community/spaces/:spaceId/look", write]]
};
