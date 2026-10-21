// Loads data/*.js the way a browser would (each file assigns window.NAME) and returns the content, for Node scripts.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "../..");

function loadData(root = ROOT) {
  const window = {};
  for (const f of ["site", "creators", "projects", "content-types", "product-types", "polls", "relationships", "licenses", "legal", "help", "guides"]) {
    const file = path.join(root, "data", f + ".js");
    if (fs.existsSync(file)) vm.runInNewContext(fs.readFileSync(file, "utf8"), { window }, { filename: file });
  }
  const SITE = window.SITE || {};
  return {
    SITE,
    // Kinds of product (labels, licences): products themselves are Studio content in the store database (#176).
    productTypes: window.PRODUCT_TYPES || {},
    // The platform layer (docs/architecture.md). Drafts are kept, so their links are still checked.
    creators: window.CREATORS || [],
    projects: window.PROJECTS || [],
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

// Where a project's pages live: in its creator's space, /<creator>/<id>, then /music/<release>, /events/<event>, ...
// The same rule as js/util.js. Releases and events are Studio content (store database), served by the content
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

// A project's address split into { project, kind, slug } when it is /<creator>/<published project in data/>/<kind>
// (slug "") or /<creator>/<project>/<kind>/<slug>, for one of the kinds given; else null.
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
function projectAddress(p, kinds) {
  const parts = String(p || "").split(/[?#]/)[0].split("/");
  if (parts[0] !== "" || !kinds.includes(parts[3]) || !(parts.length === 4 || (parts.length === 5 && SLUG.test(parts[4])))) return null;
  projectsCache = projectsCache || loadData().projects;
  const project = projectsCache.find((x) => !x.draft && projectPath(x.id) === `/${parts[1]}/${parts[2]}`);
  return project ? { project: project.id, kind: parts[3], slug: parts[4] || "" } : null;
}
// A release or event page (/<creator>/<project>/music/<slug>, /<creator>/<project>/events[/<slug>]): rendered from the
// store database by functions/[[path]].js (server/content/) and listed in /sitemap-content.xml, so static checks
// accept it without a file. (The release list, /music, is a static page.)
function contentAddress(p) {
  const found = projectAddress(p, ["music", "events"]);
  return found && (found.kind === "events" || found.slug) ? found : null;
}
// A retired news address (/<creator>/<project>/news[/<slug>]): news is offline until each creator's community opens
// (#174), so the content Function answers it with a 301 to the project's home. Returns that home, or null.
function retiredAddress(p) {
  const found = projectAddress(p, ["news"]);
  return found ? projectPath(found.project) : null;
}

// The site's address without a trailing slash, and absolute URLs built from it.
const origin = (SITE) => String(SITE.url || "").replace(/\/+$/, "");
const abs = (SITE, p) => (/^https?:\/\//.test(p) ? p : origin(SITE) + "/" + String(p).replace(/^\/+/, ""));

module.exports = { ROOT, loadData, origin, abs, projectPath, projectDir, contentAddress, retiredAddress };
