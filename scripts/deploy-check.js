// After a deploy: checks the live site answers like it should. Pages and the sitemap must load; with the store
// enabled, the store API must be configured (not "offline") and the catalog must list. Usage:
//   node scripts/deploy-check.js https://autostacc.com [--store]
const base = (process.argv[2] || "https://autostacc.com").replace(/\/+$/, "");
const store = process.argv.includes("--store");
const fails = [];

async function check(path, test) {
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(base + path, { redirect: "manual", headers: { "User-Agent": "autostacc-deploy-check" } });
      const problem = await test(res);
      if (!problem) return console.log(`PASS ${path}`);
      if (i === 4) fails.push(`${path}: ${problem}`);
    } catch (e) {
      if (i === 4) fails.push(`${path}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

(async () => {
  for (const p of ["/", "/music", "/shop", "/news", "/press", "/sitemap.xml", "/cart", "/library"]) await check(p, (r) => (r.status === 200 ? null : `status ${r.status}`));
  if (store) {
    await check("/api/account", async (r) => (r.status === 200 ? null : `status ${r.status} ${(await r.text()).slice(0, 120)}`));
    await check("/api/products", async (r) => (r.status === 200 && Array.isArray((await r.json()).products) ? null : `status ${r.status}`));
    await check("/api/webhooks/stripe", async (r) => (r.status === 405 ? null : `expected 405 for GET, got ${r.status}`));
  }
  if (fails.length) {
    console.error(fails.map((f) => "FAIL " + f).join("\n"));
    process.exit(1);
  }
})();
