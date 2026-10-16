// GET /api/site-status: what every page may show about the store's switches (server/admin/switches.js), for anyone:
// the site notice ("" for none) and whether buying and sign-ups are open. Nothing else, and nothing about anyone.
import { json } from "../lib/http.js";
import { getSetting } from "./settings.js";

async function status(app) {
  const [notice, sales, signups] = await Promise.all(["site_notice", "store_sales", "signups"].map((k) => getSetting(app.db, k)));
  return json({ notice, sales, signups }, 200, { "Cache-Control": "public, max-age=60" });
}

export const routes = [["GET", "/api/site-status", status]];
