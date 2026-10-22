// Link approval (owner, 2026-10-20; docs/community.md, "Links"). A post with a link to a site on AutoStacc's safe list,
// AutoStacc itself, or a site the space's team allowed passes at once; a site on the ban list is always refused (no
// space can allow it); any other site holds the post for the team (core/holds.js), and a team member's own posts pass.
// The team keeps its allowed list through three routes. Its own switch (community.linkRules): off, links aren't judged.
import { json, readJson, fail, str } from "../../../lib/http.js";
import { all, first, run, now } from "../../../lib/db.js";
import { teamSpace } from "../../core/team-space.js";
import { linkHosts } from "../../core/format.js";
import { SAFE, BANNED, siteIn } from "./lists.js";

const OWN = ["autostacc.com"];
const MAX_ALLOWED = 200;
const HOST = /^(?!-)[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+$/;

async function postCheck(app, { space, body, team }) {
  const hosts = linkHosts(body || "");
  if (!hosts.length) return null;
  const banned = hosts.find((h) => siteIn(h, BANNED));
  if (banned) fail(403, "link_banned", `Links to ${banned} aren't allowed on AutoStacc.`);
  if (team) return null;
  const rest = hosts.filter((h) => !siteIn(h, OWN) && !siteIn(h, SAFE));
  if (!rest.length) return null;
  const allowed = (await all(app.db, "SELECT host FROM community_allowed_links WHERE space_id = ?", space.id)).map((r) => r.host);
  const unknown = rest.find((h) => !siteIn(h, allowed));
  return unknown ? { hold: { rule: "links", reason: `The link to ${unknown} waits for the team to approve it.` } } : null;
}

const list = async (app, { spaceId }) => {
  const { space } = await teamSpace(app, spaceId);
  return json({ allowed: (await all(app.db, "SELECT host FROM community_allowed_links WHERE space_id = ? ORDER BY host", space.id)).map((r) => r.host), safe: SAFE }, 200, { "Cache-Control": "no-store" });
};

async function allow(app, { spaceId }) {
  const { user, space } = await teamSpace(app, spaceId, { write: true, name: "community-allowed-links" });
  const host = str((await readJson(app.request)).host, "host", { max: 100 }).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!HOST.test(host)) fail(400, "invalid_field", "Give a site's address, like example.com.", { field: "host" });
  if (siteIn(host, BANNED)) fail(400, "site_banned", "AutoStacc doesn't allow links to that site, in any space.", { field: "host" });
  const n = (await first(app.db, "SELECT COUNT(*) AS n FROM community_allowed_links WHERE space_id = ?", space.id)).n;
  if (n >= MAX_ALLOWED) fail(409, "too_many", `A space can allow up to ${MAX_ALLOWED} sites.`);
  await run(app.db, "INSERT INTO community_allowed_links (space_id, host, added_by, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING", space.id, host, user.id, now());
  return json({ ok: true, host });
}

async function disallow(app, { spaceId }) {
  const { space } = await teamSpace(app, spaceId, { write: true, name: "community-allowed-links" });
  const host = str((await readJson(app.request)).host, "host", { max: 100 }).trim().toLowerCase();
  const r = await run(app.db, "DELETE FROM community_allowed_links WHERE space_id = ? AND host = ?", space.id, host);
  if (!r.meta.changes) fail(404, "not_found", "That site isn't on the list.");
  return json({ ok: true });
}

export default {
  name: "linkrules",
  switch: "community.linkRules",
  checks: { post: postCheck },
  routes: [
    ["GET", "/api/community/spaces/:spaceId/allowed-links", list],
    ["PUT", "/api/community/spaces/:spaceId/allowed-links", allow],
    ["DELETE", "/api/community/spaces/:spaceId/allowed-links", disallow]
  ]
};
