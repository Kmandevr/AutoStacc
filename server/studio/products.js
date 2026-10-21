// Studio API, products: a creator lists, creates and changes the products of their own projects (title, description,
// kind, price, artwork, what's inside, draft or on sale, sales paused, removed). Owners and editors may; anyone else gets
// "nothing here". Paid files are server/studio/product-files.js, money is server/studio/earnings.js. Buyers still pay
// the price the store reads from the database (server/cart), so nothing here trusts a browser's idea of a price.
import { json, readJson, fail } from "../lib/http.js";
import { requireUser } from "../auth/session.js";
import { limit } from "../lib/ratelimit.js";
import { LIMITS, SELLING } from "../creators/policy.js";
import { requireProject } from "../creators/projects.js";
import { cleanProductInput, requireOwnProduct, createProduct, updateProduct, listProjectProductRows, productViews, countProducts } from "../creators/products.js";
import { listImages, imageSrc } from "../sites/images.js";
import { rolesFor } from "../creators/roles.js";
import { mayPublish } from "../copyright/standing.js";

// Owner, 2026-10-20: an account at two copyright strikes can't publish or price products, in any creator space.
async function publishGate(db, user, input) {
  if ((input.published || input.priceCents !== undefined || input.salesPaused === false) && !(await mayPublish(db, user.id))) {
    fail(403, "copyright_paused", "Your account has copyright strikes, so it can't publish or price products for now. See the copyright policy.");
  }
}

async function list(app, { projectId }) {
  const user = await requireUser(app);
  const { project, creator } = await requireProject(app.db, projectId, user, rolesFor("products"));
  const [rows, images, used] = await Promise.all([listProjectProductRows(app.db, project.id), listImages(app.db, creator.id), countProducts(app.db, creator.id)]);
  return json({
    products: await productViews(app.db, rows),
    images: images.map((i) => ({ id: i.id, src: imageSrc(i.id), filename: i.filename })),
    trusted: Boolean(creator.trusted),
    limits: { products: LIMITS.productsPerCreator, used, filesPerProduct: LIMITS.filesPerProduct, ...SELLING }
  });
}

async function create(app, { projectId }) {
  const user = await requireUser(app);
  await limit(app, "studio-product", 30, 3600);
  const { project, creator } = await requireProject(app.db, projectId, user, rolesFor("products"));
  const input = cleanProductInput(await readJson(app.request, 8 * 1024), { requireAll: true });
  if (input.published || input.deleted || input.salesPaused) fail(400, "invalid_field", "A new product starts as a draft.");
  await publishGate(app.db, user, input);
  const product = await createProduct(app.db, { creator, project, user, input });
  return json({ product: (await productViews(app.db, [product]))[0] }, 201);
}

async function change(app, { productId }) {
  const user = await requireUser(app);
  await limit(app, "studio-product-edit", 600, 3600);
  const { product, project, creator } = await requireOwnProduct(app.db, productId, user);
  const input = cleanProductInput(await readJson(app.request, 8 * 1024));
  await publishGate(app.db, user, input);
  const updated = await updateProduct(app.db, { product, project, creator, input, user });
  return json({ product: (await productViews(app.db, [updated]))[0] });
}

export const routes = [
  ["GET", "/api/studio/projects/:projectId/products", list],
  ["POST", "/api/studio/projects/:projectId/products", create],
  ["PATCH", "/api/studio/products/:productId", change]
];
