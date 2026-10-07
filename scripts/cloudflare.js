// Deploy-time Cloudflare setup, run by .github/workflows/deploy.yml (needs `npm ci` for Wrangler and the
// CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID environment).
//   node scripts/cloudflare.js store    create the production D1 database and R2 buckets if missing, point wrangler.toml
//                                       at the real database id (in the CI checkout only), apply migrations, sync the
//                                       catalog, and copy store secrets from the environment into the Pages project.
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
const SECRETS = ["BETTER_AUTH_SECRET", "DOWNLOAD_SIGNING_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "BREVO_API_KEY", "ADMIN_EMAILS"];

const wrangler = (args, quiet = true) =>
  execFileSync(WRANGLER, args, { cwd: ROOT, stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit", env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" } }).toString();

function store() {
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
  const missing = SECRETS.filter((k) => !present[k] && k !== "ADMIN_EMAILS");
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
}

function staticOnly() {
  for (const p of ["functions", "wrangler.toml"]) {
    if (fs.existsSync(path.join(ROOT, p))) fs.renameSync(path.join(ROOT, p), path.join(ROOT, p + ".store-off"));
  }
  console.log("cloudflare: store not enabled (repo variable STORE_ENABLED); deploying the static site only");
}

const mode = process.argv[2];
if (mode === "store") store();
else if (mode === "static") staticOnly();
else { console.error("usage: node scripts/cloudflare.js store|static"); process.exit(2); }
