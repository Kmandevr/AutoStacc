// Collects the public site into dist/ (what Cloudflare Pages serves): the pages, css/, js/, data/, img/, the
// generated shop/ pages, each creator's folder (data/creators.js: its projects' pages, hand-written and generated)
// and the root files below.
// Never docs/, scripts/, server/ or .claude/ (the store API in functions/ + server/ is bundled by Wrangler separately). Usage: node scripts/dist.js [outDir]
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] || "dist");
const ROOT_FILES = ["_redirects", "_headers", "robots.txt", "sitemap.xml", "llms.txt"];
const { loadData } = require("./lib/data");
const CREATORS = loadData().creators.map((c) => c.id);
const DIRS = ["css", "js", "data", "img", "shop", "guide", ...CREATORS];
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
// Fingerprint scripts, styles and data in every page (/js/layout.js -> /assets/3f9a1c2b0d/js/layout.js, a copy named
// by the file's content): a changed file gets a new address, so no browser can keep last deploy's copy beside this
// deploy's pages, and _headers lets browsers keep /assets/* for a year without re-checking. The plain /js, /css and
// /data addresses stay (no-cache) for what loads files by name: the Your Stacc worker, the impersonation bar, Studio
// creators' pages. Only the copies in dist/ change; the repository keeps plain links.
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
    const copy = path.join(OUT, "assets", v, rel);
    if (!fs.existsSync(copy)) { fs.mkdirSync(path.dirname(copy), { recursive: true }); fs.copyFileSync(path.join(OUT, rel), copy); count++; }
    stamped++;
    return `${attr}/assets/${v}/${rel}"`;
  });
  if (out !== html) fs.writeFileSync(file, out);
}
// _routes.json: which addresses run a Pages Function. The catch-all functions/[[path]].js serves Studio creators'
// pages, so everything static is excluded here (no Function call, no cost, and _redirects still apply): the asset
// folders, every static page, first-party creators' folders and the old addresses _redirects sends on. Pages with
// their own Function (account pages, admin, studio) and /api/* and /media/* keep running theirs.
const withFunction = new Set(fs.readdirSync(path.join(ROOT, "functions")).filter((f) => f.endsWith(".js") && !f.startsWith("[")).map((f) => f.replace(/\.js$/, "")));
const staticPages = fs.readdirSync(OUT).filter((f) => f.endsWith(".html")).map((f) => f.replace(/\.html$/, ""))
  .filter((n) => !withFunction.has(n) && !CREATORS.includes(n)).map((n) => (n === "index" ? "/" : "/" + n));
// Rewrites (200 rules) stay with their Function when they have one: /settings/* is the gated Settings page.
const redirected = fs.readFileSync(path.join(ROOT, "_redirects"), "utf8").split("\n").map((l) => l.trim().split(/\s+/))
  .filter(([from, , code]) => from && from.startsWith("/") && code !== "200").map(([from]) => from);
const exclude = [...new Set([...DIRS.filter((d) => d !== "shop").map((d) => `/${d}/*`), "/assets/*", "/shop", "/shop/*",
  ...CREATORS.map((c) => "/" + c), ...staticPages, ...redirected, ...ROOT_FILES.filter((f) => !f.startsWith("_")).map((f) => "/" + f)])];
if (exclude.length > 99) throw new Error(`_routes.json has ${exclude.length} exclude rules; Cloudflare allows 100 in total`);
fs.writeFileSync(path.join(OUT, "_routes.json"), JSON.stringify({ version: 1, include: ["/*"], exclude }, null, 2) + "\n");
count++;

console.log(`dist: ${count} files in ${path.relative(ROOT, OUT) || "."}, ${stamped} asset links fingerprinted`);
