// Serves the site locally the way Cloudflare Pages does: /shop serves shop.html, / serves index.html, /shop.html and
// /shop/ redirect to /shop, _redirects rules apply, unknown addresses get 404.html with a 404 status.
// Usage: node scripts/serve.js [port]   (default 8000). Also used by the verify-site browser checks.
const fs = require("fs");
const path = require("path");
const http = require("http");

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png",
  ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".xml": "application/xml", ".txt": "text/plain", ".json": "application/json" };
// Only what the deploy publishes (.github/workflows/deploy.yml) is served.
const PRIVATE = /(^|\/)\.|^\/(docs|scripts|node_modules)\/|\.d\.ts$|jsconfig\.json$|\.md$/;

function createServer(root = path.resolve(__dirname, "..")) {
  const rules = fs.existsSync(path.join(root, "_redirects"))
    ? fs.readFileSync(path.join(root, "_redirects"), "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => l.trim().split(/\s+/))
    : [];
  const file = (p) => { const f = path.join(root, p); return f.startsWith(root + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile() ? f : null; };
  const send = (res, status, f, headers = {}) => {
    res.writeHead(status, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream", ...headers });
    res.end(fs.readFileSync(f));
  };
  const redirect = (res, status, to) => { res.writeHead(status, { Location: to }); res.end(); };

  return http.createServer((req, res) => {
    const [rawPath, query] = req.url.split("?");
    let p;
    try { p = decodeURIComponent(rawPath); } catch { return send(res, 404, path.join(root, "404.html")); }
    const qs = query ? "?" + query : "";
    const rule = rules.find(([from]) => from === p);
    if (rule) return redirect(res, Number(rule[2] || 302), rule[1] + qs);
    if (PRIVATE.test(p)) return send(res, 404, path.join(root, "404.html"));
    if (p === "/") return send(res, 200, path.join(root, "index.html"));
    if (p.endsWith("/")) return redirect(res, 308, p.replace(/\/+$/, "") + qs);
    if (p.endsWith(".html") && file(p)) return redirect(res, 308, (p === "/index.html" ? "/" : p.slice(0, -5)) + qs);
    if (p === "/index") return redirect(res, 308, "/" + qs);
    const f = file(p) || file(p + ".html");
    if (f) return send(res, 200, f);
    return send(res, 404, path.join(root, "404.html"));
  });
}

if (require.main === module) {
  const port = Number(process.argv[2]) || 8000;
  createServer().listen(port, () => console.log(`Serving on http://localhost:${port}/ (Ctrl+C to stop)`));
}

module.exports = { createServer };
