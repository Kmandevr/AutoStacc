// Publishing a project's site: the document is checked again, its images and products are limited to the creator's
// own, and every page is rendered once into site_pages, in one batch, so visitors never see half a publish.
// republishCreator renders a creator's published sites again from their published documents (after a rename or a
// change of trust), never from unpublished drafts.
import { first, all, stmt, now, parseJson } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { cleanDocument } from "./document.js";
import { renderPage } from "./render.js";
import { ownImages, imageSrc } from "./images.js";
import { listProjectProducts } from "../catalog/products.js";
import { productPath } from "../creators/products.js";
import { projectsOf, getCreator } from "../creators/creators.js";
import { setProjectPublished } from "../creators/projects.js";

// Images and products the document may show: the creator's own active images and published products of its projects.
async function contextFor(db, creator, refs) {
  const [images, projects] = await Promise.all([ownImages(db, creator.id, [...refs.assets]), projectsOf(db, creator.id)]);
  const products = refs.products.size ? await listProjectProducts(db, projects.map((p) => p.id)) : [];
  return {
    images: new Map(images.map((x) => [x.id, imageSrc(x.id)])),
    products: new Map(products.filter((p) => refs.products.has(p.id)).map((p) => [p.id, { title: p.title, path: productPath(p), artwork: p.artwork }]))
  };
}

const writes = async (app, creator, project, doc, refs) => {
  const ctx = await contextFor(app.db, creator, refs);
  const indexable = Boolean(creator.trusted);
  const t = now();
  return [
    stmt(app.db, "DELETE FROM site_pages WHERE project_id = ?", project.id),
    ...doc.pages.map((page, i) => stmt(app.db,
      "INSERT INTO site_pages (project_id, slug, title, html, sort, published_at) VALUES (?, ?, ?, ?, ?, ?)",
      project.id, page.slug, page.title, renderPage({ siteUrl: app.config.siteUrl, creator, project, doc, page, ctx, indexable }), i, t))
  ];
};

export async function publishProject(app, creator, project) {
  const site = await first(app.db, "SELECT draft FROM project_sites WHERE project_id = ?", project.id);
  const raw = parseJson(site && site.draft, null);
  if (!raw || !raw.pages) fail(409, "nothing_to_publish", "Save the site before publishing it.");
  const { doc, assets, products } = cleanDocument(raw);
  const t = now();
  await app.db.batch([
    ...(await writes(app, creator, project, doc, { assets, products })),
    stmt(app.db, "UPDATE project_sites SET published = ?, published_at = ?, version = version + 1 WHERE project_id = ?", JSON.stringify(doc), t, project.id),
    setProjectPublished(app.db, project.id, true)
  ]);
  return { publishedAt: t, pages: doc.pages.map((p) => p.slug) };
}

export const unpublishProject = (app, project) => app.db.batch([
  stmt(app.db, "DELETE FROM site_pages WHERE project_id = ?", project.id),
  setProjectPublished(app.db, project.id, false)
]);

export async function republishCreator(app, creatorId) {
  const creator = await getCreator(app.db, creatorId);
  if (!creator) return;
  const sites = await all(app.db, `SELECT s.project_id, s.published FROM project_sites s JOIN projects p ON p.id = s.project_id
    WHERE p.creator_id = ? AND p.published = 1 AND p.deleted_at IS NULL AND s.published IS NOT NULL`, creator.id);
  const projects = new Map((await projectsOf(app.db, creator.id)).map((p) => [p.id, p]));
  for (const s of sites) {
    const { doc, assets, products } = cleanDocument(parseJson(s.published, {}));
    await app.db.batch(await writes(app, creator, projects.get(s.project_id), doc, { assets, products }));
  }
}
