// A product's "What's inside" before anyone buys it (docs/packs.md, Phase 7): GET /api/products/:productId/contents.
// Published, visible products only (404 otherwise, like the product itself), and only files published from the Pack
// Builder: their folders and names, kinds, formats and sizes, the totals worked out from them (contents.js), and the
// Pacs' read me and preview clips (server/packs/previews.js), which are public anyway. Never
// a download link, a storage key or a hash. Public and cached for a minute, like the product. Switch product.contentsTree.
import { json, fail, id } from "../lib/http.js";
import { all, first, parseJson } from "../lib/db.js";
import { requireFeature } from "../lib/features.js";
import { getProduct, isVisible } from "../catalog/products.js";
import { FACETS, KINDS, FORMATS, label } from "./vocabulary.js";
import { previewsOf } from "../packs/previews.js";

const MAX_FILES = 2000;

async function contents(app, { productId }) {
  requireFeature(app, "product.contentsTree");
  const p = await getProduct(app.db, id(productId, "productId"));
  if (!isVisible(p)) fail(404, "not_found", "No product with that id.");
  const [row, files] = await Promise.all([
    first(app.db, "SELECT summary FROM product_contents WHERE product_id = ?", p.id),
    all(app.db, `SELECT filename, folder_path, size_bytes, kind, meta FROM product_files WHERE product_id = ? AND active = 1 AND status = 'published'
      AND retired_at IS NULL AND version_id IS NOT NULL ORDER BY folder_path, sort, filename LIMIT ?`, p.id, MAX_FILES + 1)
  ]);
  const summary = parseJson(row ? row.summary : "{}", {});
  const folders = [];
  for (const f of files.slice(0, MAX_FILES)) {
    const path = f.folder_path || "";
    if (!folders.length || folders[folders.length - 1].path !== path) folders.push({ path, files: [] });
    const meta = parseJson(f.meta, {});
    const kind = (meta.values && meta.values.kind && meta.values.kind.value) || f.kind || "";
    folders[folders.length - 1].files.push({ name: f.filename, sizeBytes: f.size_bytes,
      kind: KINDS[kind] ? KINDS[kind].label : "", format: FORMATS[meta.format] ? FORMATS[meta.format].label : "" });
  }
  // The Pacs' read me (its text, kept at publishing) and preview clips (server/packs/previews.js).
  const readmeRow = files.find((f) => !f.folder_path && parseJson(f.meta, {}).readme);
  const clips = await previewsOf(app.db, parseJson(p.pacs, []));
  return json({
    readme: readmeRow ? parseJson(readmeRow.meta, {}).readme : null,
    previews: Object.values(clips).flat().map(({ title, url }) => ({ title, url })),
    files: summary.files || 0, bytes: summary.bytes || 0, bpm: summary.bpm || null,
    kinds: Object.entries(summary.kinds || {}).map(([k, n]) => ({ value: k, label: KINDS[k] ? KINDS[k].label : k, count: n })),
    facets: Object.entries(summary.facets || {}).filter(([f]) => FACETS[f]).map(([f, values]) => ({ id: f, label: FACETS[f].label,
      values: Object.entries(values).map(([v, n]) => ({ value: v, label: label(f, v), count: n })) })),
    folders, truncated: files.length > MAX_FILES
  }, 200, { "Cache-Control": "public, max-age=60" });
}

export const routes = [["GET", "/api/products/:productId/contents", contents]];
