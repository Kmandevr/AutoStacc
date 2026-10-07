// Loads data/*.js the way a browser would (each file assigns window.NAME) and returns the content, for Node scripts.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "../..");

function loadData(root = ROOT) {
  const window = {};
  for (const f of ["site", "music", "product-types", "products", "news", "shows"]) {
    const file = path.join(root, "data", f + ".js");
    if (fs.existsSync(file)) vm.runInNewContext(fs.readFileSync(file, "utf8"), { window }, { filename: file });
  }
  const SITE = window.SITE || {};
  const MUSIC = window.MUSIC || {};
  return {
    SITE,
    MUSIC,
    releases: (MUSIC.releases || []).filter((r) => !r.draft),
    productTypes: window.PRODUCT_TYPES || {},
    // Each product with its type's label (`category`) and the site currency filled in.
    products: (window.PRODUCTS || []).map((p) => ({ ...p, category: ((window.PRODUCT_TYPES || {})[p.type] || {}).label || p.type, currency: p.currency || SITE.currency || "USD" })),
    news: (window.NEWS || []).filter((n) => !n.draft),
    shows: (window.SHOWS || []).filter((s) => !s.draft)
  };
}

// The site's address without a trailing slash, and absolute URLs built from it.
const origin = (SITE) => String(SITE.url || "").replace(/\/+$/, "");
const abs = (SITE, p) => (/^https?:\/\//.test(p) ? p : origin(SITE) + "/" + String(p).replace(/^\/+/, ""));

module.exports = { ROOT, loadData, origin, abs };
