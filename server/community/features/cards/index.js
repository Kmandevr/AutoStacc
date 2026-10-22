// AutoStacc preview cards (owner, 2026-10-20; docs/community.md, "Links"): a link to an AutoStacc page (a take, a
// creator, a project, a product) gets a warm card beneath it. The post only carries the link: the page marks it, a
// small script (js/community-cards.js) asks GET /api/community/cards for what the store itself says about that
// address, and draws the card from that, so a card can never say anything the post wrote. Product cards follow the
// self-promotion rule with the team tools. Its own switch (community.cards): off, the links stay plain links.
import { json, fail } from "../../../lib/http.js";
import { limit } from "../../../lib/ratelimit.js";
import { esc } from "../../core/render-parts.js";
import { cardPath, resolveCard } from "./resolve.js";

const HOSTS = new Set(["autostacc.com", "www.autostacc.com"]);

// Marks the link; the plain link is still shown and works without the script.
function link(u, labelHtml) {
  if (!HOSTS.has(u.hostname) || u.search || u.hash) return null;
  const path = cardPath(u.pathname);
  if (!path || path === "/") return null;
  return `<a href="${esc(path)}" data-cm-card="${esc(path)}"><bdi>${labelHtml}</bdi></a>`;
}

async function card(app) {
  await limit(app, "community-cards", 300, 600);
  const path = cardPath(new URL(app.request.url).searchParams.get("path"));
  if (!path) fail(400, "invalid_field", "That isn't an address on AutoStacc.", { field: "path" });
  const c = await resolveCard(app.db, path);
  if (!c) fail(404, "not_found", "No card for that address.");
  return json({ card: c }, 200, { "Cache-Control": "public, max-age=60" });
}

export default { name: "cards", switch: "community.cards", format: { links: [link] }, routes: [["GET", "/api/community/cards", card]] };
