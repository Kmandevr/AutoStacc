// Collects the public site into dist/ (what Cloudflare Pages serves): the pages, css/, js/, data/, img/, the
// generated music/, shop/, news/ pages and the root files below. Never docs/, scripts/, server/ or .claude/ (the store
// API in functions/ + server/ is bundled by Wrangler separately). Usage: node scripts/dist.js [outDir]
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] || "dist");
const ROOT_FILES = ["_redirects", "_headers", "robots.txt", "sitemap.xml"];
const DIRS = ["css", "js", "data", "img", "music", "shop", "news"];
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
console.log(`dist: ${count} files in ${path.relative(ROOT, OUT) || "."}`);
