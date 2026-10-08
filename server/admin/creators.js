// Admin, creators: every creator with its owner count, projects, storage used and settings, and the switches the
// owner needs to run free creator sites: trusted (its pages may be indexed by search engines), suspended (its pages
// and images go offline within a minute, the edge and browser cache time), and a per-creator platform fee or storage quota (empty = the platform default).
import { json, readJson, fail, id } from "../lib/http.js";
import { all, run, now } from "../lib/db.js";
import { requireAdmin } from "../auth/session.js";
import { audit } from "../audit/log.js";
import { getCreator } from "../creators/creators.js";
import { quotaOf, feeBpsOf } from "../creators/policy.js";
import { republishCreator } from "../sites/publish.js";

async function list(app) {
  await requireAdmin(app);
  const rows = await all(app.db, `SELECT c.*,
      (SELECT COUNT(*) FROM creator_members m WHERE m.creator_id = c.id) AS members,
      (SELECT COUNT(*) FROM projects p WHERE p.creator_id = c.id AND p.deleted_at IS NULL) AS projects,
      (SELECT COUNT(*) FROM projects p WHERE p.creator_id = c.id AND p.deleted_at IS NULL AND p.published = 1) AS published_projects,
      (SELECT COALESCE(SUM(size_bytes), 0) FROM site_assets a WHERE a.creator_id = c.id AND a.status = 'active') AS used_bytes
    FROM creators c WHERE c.deleted_at IS NULL ORDER BY c.created_at DESC LIMIT 500`);
  return json({ creators: rows.map((c) => ({ id: c.id, slug: c.slug, name: c.name, source: c.source, status: c.status, trusted: Boolean(c.trusted),
    members: c.members, projects: c.projects, publishedProjects: c.published_projects, usedBytes: c.used_bytes,
    quotaBytes: quotaOf(c), ownQuota: c.storage_quota_bytes != null, feeBps: feeBpsOf(c), ownFee: c.platform_fee_bps != null, createdAt: c.created_at })) });
}

const nullableInt = (v, field, max) => {
  if (v === null) return null;
  if (!Number.isInteger(v) || v < 0 || v > max) fail(400, "invalid_field", `${field} must be a whole number from 0 to ${max}, or null for the default.`, { field });
  return v;
};

async function update(app, { creatorId }) {
  await requireAdmin(app);
  const creator = await getCreator(app.db, id(creatorId, "creatorId"));
  if (!creator) fail(404, "not_found", "No creator with that id.");
  const body = await readJson(app.request);
  const set = {};
  if (body.trusted !== undefined) {
    if (typeof body.trusted !== "boolean") fail(400, "invalid_field", "trusted must be true or false.");
    set.trusted = body.trusted ? 1 : 0;
  }
  if (body.status !== undefined) {
    if (!["active", "suspended"].includes(body.status)) fail(400, "invalid_field", "status must be active or suspended.");
    set.status = body.status;
  }
  if (body.platformFeeBps !== undefined) set.platform_fee_bps = nullableInt(body.platformFeeBps, "platformFeeBps", 10000);
  if (body.storageQuotaBytes !== undefined) set.storage_quota_bytes = nullableInt(body.storageQuotaBytes, "storageQuotaBytes", 1024 ** 4);
  if (!Object.keys(set).length) fail(400, "nothing_to_change", "Send trusted, status, platformFeeBps or storageQuotaBytes.");
  await run(app.db, `UPDATE creators SET ${Object.keys(set).map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`, ...Object.values(set), now(), creator.id);
  await audit(app, "creator.updated", { targetType: "creator", targetId: creator.id, detail: set });
  // Whether search engines may index the pages is written into them, so a trust change renders them again.
  if (set.trusted !== undefined && set.trusted !== creator.trusted) await republishCreator(app, creator.id);
  return json({ ok: true });
}

export const routes = [
  ["GET", "/api/admin/creators", list],
  ["PATCH", "/api/admin/creators/:creatorId", update]
];
