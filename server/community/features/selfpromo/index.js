// The self-promotion rule (owner, 2026-10-20; docs/community.md, "Features"): linking your own products, projects or
// creator page (an AutoStacc address on a creator space you're on the team of) is fine in ordinary takes and never in
// answers to questions or in a question take, where it would turn help into advertising. A space's team can also
// switch self-promotion off for one channel or the whole space: then those links can't be added there at all. Other
// people's products and every non-product AutoStacc link are unaffected. Its own switch (community.selfPromo).
import { json, readJson, fail, id } from "../../../lib/http.js";
import { first, all, run, now } from "../../../lib/db.js";
import { teamSpace } from "../../core/team-space.js";
import { linkUrls } from "../../core/format.js";
import { getCreatorBySlug, roleOf, sellersOfProducts } from "../../../creators/creators.js";

const HOSTS = new Set(["autostacc.com", "www.autostacc.com"]);
const onSite = (u) => HOSTS.has(u.hostname.replace(/\.+$/, ""));

// Whether this person is on the creator space behind an AutoStacc address: a product page (/shop/<id>, /product?p=<id>,
// with or without .html or capitals, as the shop itself answers them), or any page of a creator or one of its projects
// (/<creator>, /<creator>/<project>, and deeper). Anything else isn't a creator's.
async function isOwn(db, userId, url) {
  const parts = url.pathname.toLowerCase().replace(/\.html$/, "").split("/").filter(Boolean);
  let productId = null;
  if (parts[0] === "shop" && parts.length === 2) productId = parts[1];
  else if (parts[0] === "product" && parts.length === 1) productId = (url.searchParams.get("p") || "").toLowerCase();
  if (productId !== null) {
    const [seller] = productId ? await sellersOfProducts(db, [productId]) : [];
    return Boolean(seller && seller.creator_id && await roleOf(db, seller.creator_id, userId));
  }
  if (!parts.length || !/^[a-z0-9-]{2,40}$/.test(parts[0])) return false;
  const creator = await getCreatorBySlug(db, parts[0]);
  return Boolean(creator && await roleOf(db, creator.id, userId));
}

async function postCheck(app, { user, space, channel, thread, kind, type, body }) {
  const urls = linkUrls(body || "").filter(onSite);
  if (!urls.length) return null;
  let own = false;
  for (const u of urls) if (await isOwn(app.db, user.id, u)) { own = true; break; }
  if (!own) return null;
  const off = await first(app.db, "SELECT 1 AS n FROM community_selfpromo_off WHERE space_id = ? AND channel_id IN ('', ?)", space.id, (channel && channel.id) || "");
  if (off) fail(403, "self_promo_off", "This space doesn't allow linking your own products or projects here.");
  const t = type || (thread && (await first(app.db, "SELECT type FROM community_threads WHERE id = ?", thread.id) || {}).type);
  if (t === "question") fail(403, "self_promo_answer", "Links to your own products or projects don't belong in questions or their answers. Share them in an ordinary take instead.");
  return null;
}

const list = async (app, { spaceId }) => {
  const { space } = await teamSpace(app, spaceId);
  return json({ off: (await all(app.db, "SELECT channel_id AS channelId FROM community_selfpromo_off WHERE space_id = ?", space.id)).map((r) => r.channelId) }, 200, { "Cache-Control": "no-store" });
};

async function setOff(app, { spaceId }, off) {
  const { space } = await teamSpace(app, spaceId, { write: true, name: "community-selfpromo" });
  const b = await readJson(app.request);
  let channelId = "";
  if (b.channelId) {
    channelId = id(b.channelId, "channelId");
    if (!await first(app.db, "SELECT 1 AS n FROM community_channels WHERE id = ? AND space_id = ?", channelId, space.id)) fail(404, "not_found", "That channel isn't in this space.");
  }
  if (off) await run(app.db, "INSERT INTO community_selfpromo_off (space_id, channel_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", space.id, channelId, now());
  else await run(app.db, "DELETE FROM community_selfpromo_off WHERE space_id = ? AND channel_id = ?", space.id, channelId);
  return json({ ok: true });
}

export default {
  name: "selfpromo",
  switch: "community.selfPromo",
  checks: { post: postCheck },
  routes: [
    ["GET", "/api/community/spaces/:spaceId/self-promotion", list],
    ["PUT", "/api/community/spaces/:spaceId/self-promotion", (app, p) => setOff(app, p, true)],
    ["DELETE", "/api/community/spaces/:spaceId/self-promotion", (app, p) => setOff(app, p, false)]
  ]
};
