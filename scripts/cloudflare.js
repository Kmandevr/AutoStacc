// Deploy-time Cloudflare setup, run by .github/workflows/deploy.yml (needs `npm ci` for Wrangler and the
// CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID environment).
//   node scripts/cloudflare.js store    create the production D1 database and R2 buckets if missing, point wrangler.toml
//                                       at the real database id (in the CI checkout only), apply migrations, sync the
//                                       catalog, copy store secrets from the environment into the Pages project, and
//                                       check them against the store's own production rules (server/lib/config.js).
//   node scripts/cloudflare.js static   set the store aside (functions/ and wrangler.toml) so the deploy is the plain
//                                       static site, exactly as before the store existed.
// Never deletes or rewrites data: migrations only add, the catalog sync only upserts and marks removed products.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const WRANGLER = path.join(ROOT, "node_modules", ".bin", "wrangler");
const PROJECT = "autostacc";
const TOML = path.join(ROOT, "wrangler.toml");
// Must match [env.production] in wrangler.toml.
const PROD = { db: "autostacc", placeholder: "00000000-0000-0000-0000-000000000002", buckets: ["autostacc-files", "autostacc-previews"] };
// The last four are optional: ADMIN_EMAILS can come from the user table, and the marketplace account (creators' sales and
// Connect payouts, docs/payouts-setup.md) is off until its key and webhook secret are both set.
const SECRETS = ["BETTER_AUTH_SECRET", "DOWNLOAD_SIGNING_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "BREVO_API_KEY", "ADMIN_EMAILS",
  "STRIPE_MARKETPLACE_KEY", "STRIPE_MARKETPLACE_WEBHOOK_SECRET", "PLATFORM_COUNTRY"];
const OPTIONAL = new Set(["ADMIN_EMAILS", "STRIPE_MARKETPLACE_KEY", "STRIPE_MARKETPLACE_WEBHOOK_SECRET", "PLATFORM_COUNTRY"]);

// quiet: capture and return the output; otherwise it goes straight to the deploy log (execFileSync then returns null,
// so this returns "").
const wrangler = (args, quiet = true) =>
  String(execFileSync(WRANGLER, args, { cwd: ROOT, stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit", env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" } }) ?? "");

// The store refuses to start ("offline") when its production settings break a rule in server/lib/config.js, and only
// Cloudflare's logs say which. Running the same check here puts the reason in the deploy log: names and rules only,
// never secret values.
async function checkSecrets(toml, secrets) {
  const section = toml.split(/^\[env\.production\.vars\]\s*$/m)[1]?.split(/^\[/m)[0] || "";
  const vars = Object.fromEntries([...section.matchAll(/^(\w+)\s*=\s*"(.*)"\s*$/gm)].map((m) => [m[1], m[2]]));
  const { loadConfig, ConfigError } = await import("../server/lib/config.js");
  try {
    loadConfig({ ...vars, ...secrets, DB: {}, FILES: {} });
    console.log("cloudflare: store settings pass the production check");
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    for (const p of e.problems) console.log(`::error::Store offline until fixed: ${p}`);
  }
}

async function store() {
  const toml = fs.readFileSync(TOML, "utf8");
  if (!toml.includes(`database_name = "${PROD.db}"`) || !toml.includes(PROD.placeholder)) throw new Error("wrangler.toml [env.production] doesn't match scripts/cloudflare.js");

  let db = JSON.parse(wrangler(["d1", "list", "--json"])).find((d) => d.name === PROD.db);
  if (!db) {
    console.log(`cloudflare: creating D1 database ${PROD.db}`);
    wrangler(["d1", "create", PROD.db]);
    db = JSON.parse(wrangler(["d1", "list", "--json"])).find((d) => d.name === PROD.db);
  }
  const buckets = wrangler(["r2", "bucket", "list"]);
  for (const b of PROD.buckets) {
    if (!new RegExp(`name:\\s+${b}\\s*$`, "m").test(buckets)) {
      console.log(`cloudflare: creating R2 bucket ${b}`);
      try {
        wrangler(["r2", "bucket", "create", b]);
      } catch (e) {
        if (!/already exists/i.test(String(e.stderr || e.message))) throw e;
      }
    }
  }
  fs.writeFileSync(TOML, toml.replace(PROD.placeholder, db.uuid));
  console.log(`cloudflare: D1 ${PROD.db} = ${db.uuid}; buckets ${PROD.buckets.join(", ")}`);

  wrangler(["d1", "migrations", "apply", "DB", "--remote", "--env", "production"], false);
  wrangler(["d1", "execute", "DB", "--remote", "--env", "production", "--file", "db/catalog.sql"], false);

  const present = Object.fromEntries(SECRETS.filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
  const missing = SECRETS.filter((k) => !present[k] && !OPTIONAL.has(k));
  if (Object.keys(present).length) {
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gs-")), "secrets.json");
    fs.writeFileSync(tmp, JSON.stringify(present), { mode: 0o600 });
    try {
      wrangler(["pages", "secret", "bulk", tmp, "--project-name", PROJECT]);
    } finally {
      fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
    }
    console.log(`cloudflare: secrets set: ${Object.keys(present).join(", ")}`);
  }
  if (missing.length) console.log(`::warning::Store secrets not in GitHub yet: ${missing.join(", ")}. Until they are set the store answers "offline"; the site itself is fine.`);
  await checkSecrets(toml, present);
  recentEmailFailures();
}

// Mail that the store couldn't send is recorded with the provider's reason. Show the latest in the deploy log
// (kind, time and reason only, never addresses), so a broken sender or key is visible without the database console.
function recentEmailFailures() {
  try {
    const out = wrangler(["d1", "execute", "DB", "--remote", "--env", "production", "--json", "--command",
      "SELECT kind, error, created_at FROM email_events WHERE status = 'failed' ORDER BY created_at DESC LIMIT 5"]);
    const rows = JSON.parse(out)[0]?.results || [];
    for (const r of rows) console.log(`::warning::Email not sent (${r.kind}, ${r.created_at}): ${r.error}`);
    if (!rows.length) console.log("cloudflare: no failed emails recorded");
  } catch (e) {
    console.log(`cloudflare: couldn't read email failures (${String(e.message || e).split("\n")[0]})`);
  }
}

function staticOnly() {
  for (const p of ["functions", "wrangler.toml"]) {
    if (fs.existsSync(path.join(ROOT, p))) fs.renameSync(path.join(ROOT, p), path.join(ROOT, p + ".store-off"));
  }
  console.log("cloudflare: store not enabled (repo variable STORE_ENABLED); deploying the static site only");
}

const mode = process.argv[2];
if (mode === "store") store().catch((e) => { console.error(e); process.exit(1); });
else if (mode === "static") staticOnly();
else { console.error("usage: node scripts/cloudflare.js store|static"); process.exit(2); }
