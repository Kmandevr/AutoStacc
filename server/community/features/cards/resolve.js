// What an AutoStacc address looks like as a card: the title, a line of detail and sometimes a picture, read from the
// store's own tables, never from the post that linked it (docs/community.md, "Links"). Only public things resolve: a
// visible take, an active creator, a published project or product. Anything else gives null, and the link stays a link.
import { first } from "../../../lib/db.js";
import { getThread } from "../../core/threads.js";
import { threadPath } from "../../core/render-parts.js";
import { getCreatorBySlug, getProjectBySlug } from "../../../creators/creators.js";
import { getProduct, isVisible } from "../../../catalog/products.js";

const PATH = /^\/[A-Za-z0-9/_.-]{1,200}$/;
export const cardPath = (raw) => (typeof raw === "string" && PATH.test(raw) && !raw.includes("..") && !raw.includes("//") ? raw.replace(/\/+$/, "") || "/" : null);

const money = (p) => (p.price_cents === 0 ? "Free" : `${(p.price_cents / 100).toFixed(2)} ${String(p.currency || "USD").toUpperCase()}`);
const image = (v) => (typeof v === "string" && /^\/[A-Za-z0-9/_.-]{1,200}$/.test(v) && !v.includes("..") ? v : null);

export async function resolveCard(db, path) {
  const p = cardPath(path);
  if (!p) return null;
  let m = p.match(/^\/community\/t\/([A-Za-z0-9_]{3,80})(?:-[a-z0-9-]*)?$/);
  if (m) {
    const t = await getThread(db, m[1]);
    if (!t || t.state !== "visible") return null;
    const space = await first(db, "SELECT name FROM community_spaces WHERE id = ?", t.spaceId);
    return { kind: "take", title: t.title, detail: `${t.replyCount} ${t.replyCount === 1 ? "reply" : "replies"}${space ? ` in ${space.name}` : ""}`, path: threadPath(t) };
  }
  m = p.match(/^\/shop\/([A-Za-z0-9_-]{2,80})$/);
  if (m) {
    const pr = await getProduct(db, m[1]);
    if (!isVisible(pr)) return null;
    // Only while its project and creator are live too, as the shop's own listing requires (security review).
    const live = await first(db, `SELECT 1 AS ok FROM projects j JOIN creators c ON c.id = j.creator_id WHERE j.id = ? AND j.published = 1
      AND j.deleted_at IS NULL AND c.status = 'active' AND c.deleted_at IS NULL`, pr.project_id);
    if (!live) return null;
    return { kind: "product", title: pr.title, detail: `${pr.type} · ${money(pr)}`, image: image(pr.artwork), path: `/shop/${pr.id}`, promotion: true };
  }
  m = p.match(/^\/([a-z0-9-]{2,40})$/);
  if (m) {
    const c = await getCreatorBySlug(db, m[1]);
    return c && c.status === "active" ? { kind: "creator", title: c.name, detail: "Creator on AutoStacc", path: `/${c.slug}` } : null;
  }
  m = p.match(/^\/([a-z0-9-]{2,40})\/([a-z0-9-]{2,60})$/);
  if (m) {
    const c = await getCreatorBySlug(db, m[1]);
    if (!c || c.status !== "active") return null;
    const pj = await getProjectBySlug(db, c.id, m[2]);
    return pj && pj.published ? { kind: "project", title: pj.name, detail: `Project by ${c.name}`, path: `/${c.slug}/${pj.slug}` } : null;
  }
  return null;
}
