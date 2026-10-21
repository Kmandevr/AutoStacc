// What a site may show, checked against the database: the creator's own active files and those of community library
// pieces they installed (server/library/pieces.js) (images and fonts, by id: a font named as an image just doesn't show), the
// published products of the creator's projects, the creator's published projects, and the published releases and
// upcoming events of the creator's own projects the document names (sites/content-refs.js). A document may name
// anything, but only these reach the page (js/site-elements.js leaves the rest out), so nobody can show another
// creator's files, products, releases or events by typing their ids.
import { listProjectProducts } from "../catalog/products.js";
import { productPath } from "../creators/products.js";
import { projectsOf } from "../creators/creators.js";
import { ownImages, imageSrc } from "./images.js";
import { installedFiles } from "../library/pieces.js";
import { contentCards } from "./content-refs.js";

export async function contextFor(db, creator, refs) {
  const files = [...new Set([...(refs.assets || []), ...(refs.fonts || [])])];
  const [own, installed, projects] = await Promise.all([ownImages(db, creator.id, files), installedFiles(db, creator.id, files), projectsOf(db, creator.id)]);
  const images = [...own, ...installed];
  const named = new Set(refs.projects || []);
  const [products, content] = await Promise.all([listProjectProducts(db, projects.map((p) => p.id)),
    contentCards(db, projects.filter((p) => named.has(p.id)).map((p) => p.id))]);
  return {
    images: new Map(images.map((x) => [x.id, imageSrc(x.id)])),
    products: new Map(products.map((p) => [p.id, { title: p.title, path: productPath(p), artwork: p.artwork, preview: p.preview || null }])),
    projects: new Map(projects.filter((p) => p.published).map((p) => [p.id, { name: p.name, path: `/${creator.slug}/${p.slug}` }])),
    releases: content.releases,
    events: content.events
  };
}
