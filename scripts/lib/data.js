// Loads data/*.js the way a browser would (each file assigns window.NAME) and returns the content, for Node scripts.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "../..");

function loadData(root = ROOT) {
  const window = {};
  for (const f of ["site", "creators", "projects", "stacclets", "pacs", "content-types", "music", "product-types", "products", "news", "shows", "polls", "relationships", "licenses", "legal", "help", "guides"]) {
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
    shows: (window.SHOWS || []).filter((s) => !s.draft),
    // The platform layer (docs/architecture.md). Drafts are kept: products can be drafts that still need their links checked.
    creators: window.CREATORS || [],
    projects: window.PROJECTS || [],
    stacclets: window.STACCLETS || [],
    pacs: window.PACS || [],
    contentTypes: window.CONTENT_TYPES || {},
    polls: window.POLLS || [],
    relationships: window.RELATIONSHIPS || [],
    relationshipTypes: window.RELATIONSHIP_TYPES || {},
    // Trust pages: licences per kind of product, the legal documents and the help centre (scripts/lib/trust-pages.js).
    licenses: window.LICENSES || {},
    legal: window.LEGAL || [],
    help: window.HELP || [],
    guides: window.GUIDES || { sections: [], articles: [] },
    // Every release and news post, drafts included, for link checks.
    allReleases: MUSIC.releases || [],
    allNews: window.NEWS || []
  };
}

// Where a project's pages live: in its creator's space, /<creator>/<id>, then /music/<release>, /news/<post>, ...
// The same rule as js/util.js. Reads data/projects.js once (every script works on this repo's data).
let projectsCache;
const projectPath = (id, ...rest) => {
  projectsCache = projectsCache || loadData().projects;
  const p = projectsCache.find((x) => x.id === id) || {};
  const base = p.creator ? [p.creator, id] : ["projects", id];
  return "/" + [...base, ...rest].filter((x) => x !== "" && x !== undefined).join("/");
};
// The repo path of a project's pages: its address without the leading slash (autostacc/glitches-and-stitches).
const projectDir = (id) => projectPath(id).slice(1);

// The site's address without a trailing slash, and absolute URLs built from it.
const origin = (SITE) => String(SITE.url || "").replace(/\/+$/, "");
const abs = (SITE, p) => (/^https?:\/\//.test(p) ? p : origin(SITE) + "/" + String(p).replace(/^\/+/, ""));

module.exports = { ROOT, loadData, origin, abs, projectPath, projectDir };
