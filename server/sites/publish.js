// Publishing a site (a project's or a creator's profile: sites/targets.js). The document is checked again, what it
// shows is limited to the creator's own (sites/context.js), and every page is rendered once into the target's pages
// table in one batch, so visitors never see half a publish. Each publish is kept in site_versions (the last
// LIMITS.versionsPerSite). republishCreator renders a creator's published sites again from their published documents
// (after a rename or a change of trust), never from unpublished drafts.
import { first, all, stmt, now, parseJson } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { LIMITS } from "../creators/policy.js";
import { cleanDocument } from "./document.js";
import { renderPage } from "./render.js";
import { contextFor } from "./context.js";
import { projectSlugs } from "./addresses.js";
import { projectSite, profileSite } from "./targets.js";
import { releaseHidden } from "./images.js";
import { projectsOf, getCreator } from "../creators/creators.js";
import { setProjectPublished } from "../creators/projects.js";

// What the site may show, plus the project itself (it is about to be published, so its own follow button works).
export async function siteContext(db, target, refs) {
  const ctx = await contextFor(db, target.creator, refs);
  if (target.kind === "project" && !ctx.projects.has(target.id)) ctx.projects.set(target.id, { name: target.project.name, path: target.base });
  return ctx;
}

// A profile page may not take an address a project has (sites/addresses.js).
export async function checkAddresses(db, target, doc) {
  if (target.kind !== "profile") return;
  const taken = await projectSlugs(db, target.creator.id);
  const clash = doc.pages.find((p) => p.slug && taken.has(p.slug));
  if (clash) fail(409, "slug_taken", `A project already uses the address /${target.creator.slug}/${clash.slug}. Give the page "${clash.title}" another address.`, { where: "pages" });
}

const pageWrites = async (app, target, doc, refs) => {
  const ctx = await siteContext(app.db, target, refs);
  const indexable = Boolean(target.creator.trusted);
  const t = now();
  return [
    stmt(app.db, `DELETE FROM ${target.pages} WHERE ${target.key} = ?`, target.id),
    ...doc.pages.map((page, i) => stmt(app.db,
      `INSERT INTO ${target.pages} (${target.key}, slug, title, html, sort, published_at) VALUES (?, ?, ?, ?, ?, ?)`,
      target.id, page.slug, page.title, renderPage({ siteUrl: app.config.siteUrl, target, doc, page, ctx, indexable }), i, t))
  ];
};

const liveStmt = (db, target, live) => (target.kind === "project" ? setProjectPublished(db, target.id, live)
  : stmt(db, "UPDATE creator_sites SET live = ? WHERE creator_id = ?", live ? 1 : 0, target.id));

// Publishes the saved draft, or the given document (a scheduled one). user: who published (null for the schedule).
export async function publishSite(app, target, { doc: given = null, user = null } = {}) {
  const site = await first(app.db, `SELECT draft, version FROM ${target.table} WHERE ${target.key} = ?`, target.id);
  const raw = given || parseJson(site && site.draft, null);
  if (!site || !raw || !raw.pages) fail(409, "nothing_to_publish", "Save the site before publishing it.");
  const { doc, ...refs } = cleanDocument(raw);
  await checkAddresses(app.db, target, doc);
  const t = now();
  const version = site.version + 1;
  const json = JSON.stringify(doc);
  await app.db.batch([
    ...(await pageWrites(app, target, doc, refs)),
    stmt(app.db, `UPDATE ${target.table} SET published = ?, published_at = ?, version = ? WHERE ${target.key} = ?`, json, t, version, target.id),
    stmt(app.db, "INSERT OR REPLACE INTO site_versions (kind, site_id, version, doc, published_at, published_by) VALUES (?, ?, ?, ?, ?, ?)",
      target.kind, target.id, version, json, t, user ? user.id : null),
    stmt(app.db, "DELETE FROM site_versions WHERE kind = ? AND site_id = ? AND version <= ?", target.kind, target.id, version - LIMITS.versionsPerSite),
    liveStmt(app.db, target, true)
  ]);
  await releaseHidden(app, target.creator.id);
  return { publishedAt: t, version, pages: doc.pages.map((p) => p.slug) };
}

export const unpublishSite = (app, target) => app.db.batch([
  stmt(app.db, `DELETE FROM ${target.pages} WHERE ${target.key} = ?`, target.id),
  liveStmt(app.db, target, false)
]);

export async function republishCreator(app, creatorId) {
  const creator = await getCreator(app.db, creatorId);
  if (!creator) return;
  const projects = new Map((await projectsOf(app.db, creator.id)).map((p) => [p.id, p]));
  const sites = await all(app.db, `SELECT s.project_id, s.published FROM project_sites s JOIN projects p ON p.id = s.project_id
    WHERE p.creator_id = ? AND p.published = 1 AND p.deleted_at IS NULL AND s.published IS NOT NULL`, creator.id);
  for (const s of sites) {
    const { doc, ...refs } = cleanDocument(parseJson(s.published, {}));
    await app.db.batch(await pageWrites(app, projectSite(creator, projects.get(s.project_id)), doc, refs));
  }
  const profile = await first(app.db, "SELECT published FROM creator_sites WHERE creator_id = ? AND live = 1 AND published IS NOT NULL", creator.id);
  if (profile) {
    const { doc, ...refs } = cleanDocument(parseJson(profile.published, {}));
    await app.db.batch(await pageWrites(app, profileSite(creator), doc, refs));
  }
}
