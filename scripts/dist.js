// Collects the public site into dist/ (what Cloudflare Pages serves): the pages, css/, js/, data/, img/, the
// generated shop/ pages, projects/ (each project's pages, hand-written and generated) and the root files below.
// Never docs/, scripts/, server/ or .claude/ (the store API in functions/ + server/ is bundled by Wrangler separately). Usage: node scripts/dist.js [outDir]
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] || "dist");
const ROOT_FILES = ["_redirects", "_headers", "robots.txt", "sitemap.xml", "llms.txt"];
const DIRS = ["css", "js", "data", "img", "shop", "projects"];
// Editor-only files and folder notes stay out of the public site.
const SKIP = (name) => name === ".purpose" || name.endsWith(".d.ts") || name === "jsconfig.json" || name.startsWith(".");

function copyDir(from, to) {
  if (!fs.existsSync(from)) return 0;
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP(entry.name)) continue;
    const src = path.join(from, entry.name), dst = path.join(to, entry.name);
    if (entry.isDirectory()) n += copyDir(src, dst);
    else { fs.copyFileSync(src, dst); n++; }
  }
  return n;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let count = 0;
for (const f of fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"))) { fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f)); count++; }
for (const f of ROOT_FILES) { fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f)); count++; }
for (const d of DIRS) count += copyDir(path.join(ROOT, d), path.join(OUT, d));
// Fingerprint scripts, styles and data in every page (/js/layout.js -> /js/layout.js?v=3f9a1c2b, from the file's
// content): a changed file gets a new address, so no browser or cache can keep running last deploy's copy beside this
// deploy's pages (Cloudflare's browser-cache setting can override the no-cache in _headers). Unchanged files keep
// their address and stay cached. Only the copies in dist/ change; the repository keeps plain links.
const stamp = new Map();
const version = (rel) => {
  if (!stamp.has(rel)) {
    const file = path.join(OUT, rel);
    stamp.set(rel, fs.existsSync(file) ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 10) : "");
  }
  return stamp.get(rel);
};
const pages = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((d) => (d.isDirectory() ? pages(path.join(dir, d.name)) : d.name.endsWith(".html") ? [path.join(dir, d.name)] : []));
let stamped = 0;
for (const file of pages(OUT)) {
  const html = fs.readFileSync(file, "utf8");
  const out = html.replace(/(\s(?:src|href)=")\/((?:js|css|data)\/[^"?#]+\.(?:js|css))"/g, (m, attr, rel) => {
    const v = version(rel);
    if (!v) return m;
    stamped++;
    return `${attr}/${rel}?v=${v}"`;
  });
  if (out !== html) fs.writeFileSync(file, out);
}
console.log(`dist: ${count} files in ${path.relative(ROOT, OUT) || "."}, ${stamped} asset links fingerprinted`);
