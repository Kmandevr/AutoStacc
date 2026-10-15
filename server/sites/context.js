// What a site may show, checked against the database: the creator's own active files (images and fonts, by id: a font named as an image just doesn't show), the
// published products of the creator's projects and the creator's published projects. A document may name anything,
// but only these reach the page (js/site-elements.js leaves the rest out), so nobody can show another creator's files
// or products by typing their ids.
import { listProjectProducts } from "../catalog/products.js";
import { productPath } from "../creators/products.js";
import { projectsOf } from "../creators/creators.js";
import { ownImages, imageSrc } from "./images.js";

export async function contextFor(db, creator, refs) {
  const files = [...new Set([...(refs.assets || []), ...(refs.fonts || [])])];
  const [images, projects] = await Promise.all([ownImages(db, creator.id, files), projectsOf(db, creator.id)]);
  const products = await listProjectProducts(db, projects.map((p) => p.id));
  return {
    images: new Map(images.map((x) => [x.id, imageSrc(x.id)])),
    products: new Map(products.map((p) => [p.id, { title: p.title, path: productPath(p), artwork: p.artwork, preview: p.preview || null }])),
    projects: new Map(projects.filter((p) => p.published).map((p) => [p.id, { name: p.name, path: `/${creator.slug}/${p.slug}` }]))
  };
}

