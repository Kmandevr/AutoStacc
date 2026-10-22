// After a deploy: checks the live site answers like it should. Pages and the sitemap must load, old addresses redirect;
// with the store enabled, the store API must be configured (not "offline") and the catalog must list. Usage:
//   node scripts/deploy-check.js https://autostacc.com [--store]
// Checks run a few at a time; the report lists them in the order below whatever order they finish in.
const base = (process.argv[2] || "https://autostacc.com").replace(/\/+$/, "");
const store = process.argv.includes("--store");
const TRIES = 5, WAIT_MS = 5000, CONCURRENCY = 8;

// One check: up to TRIES attempts WAIT_MS apart (a fresh deploy can take a moment to answer). Returns null or the problem.
async function check(path, test) {
  let problem;
  for (let i = 0; i < TRIES; i++) {
    if (i) await new Promise((r) => setTimeout(r, WAIT_MS));
    try {
      const res = await fetch(base + path, { redirect: "manual", headers: { "User-Agent": "autostacc-deploy-check" } });
      problem = await test(res);
      if (!problem) return null;
    } catch (e) {
      problem = e.message;
    }
  }
  return problem;
}

const ok200 = (r) => (r.status === 200 ? null : `status ${r.status}`);
const checks = ["/", "/shop", "/about", "/discover", "/autostacc/glitches-and-stitches", "/autostacc/glitches-and-stitches/music", "/sitemap.xml", "/cart", "/library"].map((p) => [p, ok200]);
// Old addresses (from before the project moved under /projects/, then into its creator's space) lead straight there.
for (const old of ["/music/hail", "/projects/glitches-and-stitches/music/hail"])
  checks.push([old, (r) => (r.status === 301 && /^(https:\/\/[^/]+)?\/autostacc\/glitches-and-stitches\/music\/hail$/.test(r.headers.get("location") || "") ? null : `expected a 301 to the project page, got ${r.status} ${r.headers.get("location")}`)]);
if (store) {
  checks.push(["/api/account", async (r) => (r.status === 200 ? null : `status ${r.status} ${(await r.text()).slice(0, 120)}`)]);
  checks.push(["/api/products", async (r) => (r.status === 200 && Array.isArray((await r.json()).products) ? null : `status ${r.status}`)]);
  checks.push(["/api/webhooks/stripe", async (r) => (r.status === 405 ? null : `expected 405 for GET, got ${r.status}`)]);
}

(async () => {
  const results = new Array(checks.length);
  let next = 0;
  const worker = async () => {
    while (next < checks.length) {
      const i = next++;
      results[i] = await check(...checks[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, checks.length) }, worker));
  const fails = [];
  checks.forEach(([path], i) => (results[i] ? fails.push(`${path}: ${results[i]}`) : console.log(`PASS ${path}`)));
  if (fails.length) {
    console.error(fails.map((f) => "FAIL " + f).join("\n"));
    process.exit(1);
  }
})();
