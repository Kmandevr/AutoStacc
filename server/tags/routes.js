// Tags API (owner, 2026-10-27, #230; docs/discovery.md "Tags"). GET /api/tags/suggest?q= : tags for what someone is
// typing in any tag box or search, typos tolerated, most-used first (public, cached briefly). The Control Center's
// site-wide rules, admins only and audited: GET /api/admin/tags lists the rules and the most-used tags, PUT
// {tag, action: "hide" | "rename", renameTo} sets one, DELETE {tag} lifts it.
import { json, readJson, fail, str } from "../lib/http.js";
import { all, run, now } from "../lib/db.js";
import { requireAdmin } from "../auth/session.js";
import { audit } from "../audit/log.js";
import { limit } from "../lib/ratelimit.js";
import { foldTag, isTag } from "../lib/tags.js";
import { checkName } from "../lib/words.js";
import { counts, match } from "./tags.js";

async function suggest(app) {
  await limit(app, "tags-suggest", 600, 600);
  const q = str(new URL(app.request.url).searchParams.get("q") || "", "q", { max: 60 });
  const n = Math.min(Math.max(parseInt(new URL(app.request.url).searchParams.get("limit"), 10) || 8, 1), 20);
  return json({ tags: match(await counts(app.db), q, n) }, 200, { "Cache-Control": "public, max-age=120" });
}

const tagOf = (raw, field = "tag") => {
  const t = foldTag(str(raw, field, { max: 60 }));
  if (!isTag(t)) fail(400, "invalid_field", "A tag: letters, numbers and hyphens, up to 24.", { field });
  return t;
};

async function list(app) {
  await requireAdmin(app);
  const top = [...(await counts(app.db))].sort((a, b) => b[1] - a[1]).slice(0, 100).map(([tag, n]) => ({ tag, count: n }));
  return json({ rules: await all(app.db, "SELECT tag, action, rename_to AS renameTo, created_at AS createdAt FROM tag_rules ORDER BY tag"), top }, 200, { "Cache-Control": "no-store" });
}

async function setRule(app) {
  await requireAdmin(app);
  const body = await readJson(app.request, 2048);
  const tag = tagOf(body.tag);
  if (body.action !== "hide" && body.action !== "rename") fail(400, "invalid_field", "Hide it or rename it.", { field: "action" });
  const to = body.action === "rename" ? tagOf(body.renameTo, "renameTo") : null;
  if (to) checkName(to.replace(/-/g, " "), "renameTo", "Tags");
  if (to === tag) fail(400, "invalid_field", "Pick a different name.", { field: "renameTo" });
  await run(app.db, `INSERT INTO tag_rules (tag, action, rename_to, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(tag) DO UPDATE SET action = excluded.action, rename_to = excluded.rename_to`, tag, body.action, to, now());
  await audit(app, "tags.rule", { targetType: "tag", targetId: tag, detail: { action: body.action, renameTo: to } });
  return json({ ok: true });
}

async function liftRule(app) {
  await requireAdmin(app);
  const tag = tagOf((await readJson(app.request, 1024)).tag);
  const r = await run(app.db, "DELETE FROM tag_rules WHERE tag = ?", tag);
  if (!r.meta.changes) fail(404, "not_found", "No rule for that tag.");
  await audit(app, "tags.rule_lifted", { targetType: "tag", targetId: tag });
  return json({ ok: true });
}

export const routes = [
  ["GET", "/api/tags/suggest", suggest],
  ["GET", "/api/admin/tags", list],
  ["PUT", "/api/admin/tags", setRule],
  ["DELETE", "/api/admin/tags", liftRule]
];
