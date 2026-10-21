// Loads data/*.js the way a browser would (each file assigns window.NAME) and returns the content, for Node scripts.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "../..");

function loadData(root = ROOT) {
  const window = {};
  for (const f of ["site", "creators", "projects", "stacclets", "pacs", "content-types", "product-types", "products", "polls", "relationships", "licenses", "legal", "help", "guides"]) {
    const file = path.join(root, "data", f + ".js");
    if (fs.existsSync(file)) vm.runInNewContext(fs.readFileSync(file, "utf8"), { window }, { filename: file });
  }
  const SITE = window.SITE || {};
  return {
    SITE,
    productTypes: window.PRODUCT_TYPES || {},
    // Each product with its type's label (`category`) and the site currency filled in.
    products: (window.PRODUCTS || []).map((p) => ({ ...p, category: ((window.PRODUCT_TYPES || {})[p.type] || {}).label || p.type, currency: p.currency || SITE.currency || "USD" })),
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
    guides: window.GUIDES || { sections: [], articles: [] }
  };
}

// Where a project's pages live: in its creator's space, /<creator>/<id>, then /music/<release>, /news/<post>, ...
// The same rule as js/util.js. Releases and news posts are Studio content (store database), served by the content
// Function at those addresses; contentAddress below recognizes one. Reads data/projects.js once (every script works on this repo's data).
let projectsCache;
const projectPath = (id, ...rest) => {
  projectsCache = projectsCache || loadData().projects;
  const p = projectsCache.find((x) => x.id === id) || {};
  const base = p.creator ? [p.creator, id] : ["projects", id];
  return "/" + [...base, ...rest].filter((x) => x !== "" && x !== undefined).join("/");
};
// The repo path of a project's pages: its address without the leading slash (autostacc/glitches-and-stitches).
const projectDir = (id) => projectPath(id).slice(1);

// A release or news address of a project in data/projects.js (/<creator>/<project>/music|news/<slug>): such a page is
// rendered from the store database by functions/[[path]].js (server/content/public.js) and listed in
// /sitemap-content.xml, so static checks accept it without a file. Returns { project, kind, slug } or null.
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
function contentAddress(p) {
  const parts = String(p || "").split(/[?#]/)[0].split("/");
  if (parts.length !== 5 || parts[0] !== "" || !["music", "news"].includes(parts[3]) || !SLUG.test(parts[4])) return null;
  projectsCache = projectsCache || loadData().projects;
  const project = projectsCache.find((x) => !x.draft && projectPath(x.id) === `/${parts[1]}/${parts[2]}`);
  return project ? { project: project.id, kind: parts[3], slug: parts[4] } : null;
}

// The site's address without a trailing slash, and absolute URLs built from it.
const origin = (SITE) => String(SITE.url || "").replace(/\/+$/, "");
const abs = (SITE, p) => (/^https?:\/\//.test(p) ? p : origin(SITE) + "/" + String(p).replace(/^\/+/, ""));

module.exports = { ROOT, loadData, origin, abs, projectPath, projectDir, contentAddress };
