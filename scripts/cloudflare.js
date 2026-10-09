// Deploy-time Cloudflare setup, run by .github/workflows/deploy.yml (needs `npm ci` for Wrangler and the
// CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID environment).
//   node scripts/cloudflare.js store    create the production D1 database and R2 buckets if missing, point wrangler.toml
//                                       at the real database id (in the CI checkout only), apply migrations, sync the
//                                       catalog, copy store secrets from the environment into the Pages project, and
//                                       check them against the store's own production rules (server/lib/config.js).
//   node scripts/cloudflare.js static   set the store aside (functions/ and wrangler.toml) so the deploy is the plain
//                                       static site, exactly as before the store existed.
// Never deletes or rewrites data: migrations only add, the catalog sync only upserts and marks removed products.
// Wrangler calls are network round trips, so work that doesn't depend on other work runs at the same time: the D1
// database, the R2 buckets and the secrets are set up side by side; migrations, then the catalog, then the email log
// stay in order.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile, spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const WRANGLER = path.join(ROOT, "node_modules", ".bin", "wrangler");
const PROJECT = "autostacc";
const TOML = path.join(ROOT, "wrangler.toml");
// Must match [env.production] in wrangler.toml.
const PROD = { db: "autostacc", placeholder: "00000000-0000-0000-0000-000000000002", buckets: ["autostacc-files", "autostacc-previews"] };
// The last six are optional (BREVO_NEWS_LIST: see docs/store-setup.md): ADMIN_EMAILS can come from the user table, the marketplace account (creators' sales and
// Connect payouts, docs/payouts-setup.md) is off until its key and webhook secret are both set, and a project's newsletter
// sign-up says "coming soon" until BREVO_NEWSLETTER_LISTS names its Brevo list.
const SECRETS = ["BETTER_AUTH_SECRET", "DOWNLOAD_SIGNING_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "BREVO_API_KEY", "ADMIN_EMAILS",
  "STRIPE_MARKETPLACE_KEY", "STRIPE_MARKETPLACE_WEBHOOK_SECRET", "PLATFORM_COUNTRY", "BREVO_NEWSLETTER_LISTS", "BREVO_NEWS_LIST"];
const OPTIONAL = new Set(["ADMIN_EMAILS", "STRIPE_MARKETPLACE_KEY", "STRIPE_MARKETPLACE_WEBHOOK_SECRET", "PLATFORM_COUNTRY", "BREVO_NEWSLETTER_LISTS", "BREVO_NEWS_LIST"]);

// quiet: capture and resolve with the output; otherwise it goes straight to the deploy log and resolves with "".
// Rejects like execFileSync threw: the error carries stderr when quiet.
const ENV = { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" };
const wrangler = (args, quiet = true) => new Promise((resolve, reject) => {
  if (quiet) {
    execFile(WRANGLER, args, { cwd: ROOT, env: ENV, maxBuffer: 64 * 1024 * 1024 }, (e, stdout, stderr) =>
      e ? reject(Object.assign(e, { stderr })) : resolve(String(stdout)));
  } else {
    spawn(WRANGLER, args, { cwd: ROOT, env: ENV, stdio: ["ignore", "inherit", "inherit"] })
      .on("error", reject)
      .on("close", (code) => (code ? reject(new Error(`wrangler ${args.join(" ")} exited ${code}`)) : resolve("")));
  }
});

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
    // Not a reason to take the store offline, but a sign a key was forgotten: creator sales stay off without it.
    if (secrets.STRIPE_MARKETPLACE_WEBHOOK_SECRET && !secrets.STRIPE_MARKETPLACE_KEY)
      console.log("::warning::STRIPE_MARKETPLACE_WEBHOOK_SECRET is set without STRIPE_MARKETPLACE_KEY, so creator sales and payouts stay off");
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    for (const p of e.problems) console.log(`::error::Store offline until fixed: ${p}`);
  }
}

async function store() {
  const toml = fs.readFileSync(TOML, "utf8");
  if (!toml.includes(`database_name = "${PROD.db}"`) || !toml.includes(PROD.placeholder)) throw new Error("wrangler.toml [env.production] doesn't match scripts/cloudflare.js");
  // Secrets live on the Pages project, not in the database, so they don't wait for it. Both finish before a failure
  // in either stops the deploy, so neither is cut off halfway.
  const failed = (await Promise.allSettled([database(toml), secrets(toml)])).find((r) => r.status === "rejected");
  if (failed) throw failed.reason;
}

async function database(toml) {
  const [db] = await Promise.all([d1(), buckets()]);
  fs.writeFileSync(TOML, toml.replace(PROD.placeholder, db.uuid));
  console.log(`cloudflare: D1 ${PROD.db} = ${db.uuid}; buckets ${PROD.buckets.join(", ")}`);

  await wrangler(["d1", "migrations", "apply", "DB", "--remote", "--env", "production"], false);
  await wrangler(["d1", "execute", "DB", "--remote", "--env", "production", "--file", "db/catalog.sql"], false);
  await recentEmailFailures();
}

async function d1() {
  const find = async () => JSON.parse(await wrangler(["d1", "list", "--json"])).find((d) => d.name === PROD.db);
  let db = await find();
  if (!db) {
    console.log(`cloudflare: creating D1 database ${PROD.db}`);
    await wrangler(["d1", "create", PROD.db]);
    db = await find();
  }
  return db;
}

async function buckets() {
  const list = await wrangler(["r2", "bucket", "list"]);
  await Promise.all(PROD.buckets.filter((b) => !new RegExp(`name:\\s+${b}\\s*$`, "m").test(list)).map(async (b) => {
    console.log(`cloudflare: creating R2 bucket ${b}`);
    try {
      await wrangler(["r2", "bucket", "create", b]);
    } catch (e) {
      if (!/already exists/i.test(String(e.stderr || e.message))) throw e;
    }
  }));
}

async function secrets(toml) {
  const present = Object.fromEntries(SECRETS.filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
  const missing = SECRETS.filter((k) => !present[k] && !OPTIONAL.has(k));
  if (Object.keys(present).length) {
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gs-")), "secrets.json");
    fs.writeFileSync(tmp, JSON.stringify(present), { mode: 0o600 });
    try {
      await wrangler(["pages", "secret", "bulk", tmp, "--project-name", PROJECT]);
    } finally {
      fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
    }
    console.log(`cloudflare: secrets set: ${Object.keys(present).join(", ")}`);
  }
  if (missing.length) console.log(`::warning::Store secrets not in GitHub yet: ${missing.join(", ")}. Until they are set the store answers "offline"; the site itself is fine.`);
  await checkSecrets(toml, present);
}

// Mail that the store couldn't send is recorded with the provider's reason. Show the latest in the deploy log
// (kind, time and reason only, never addresses), so a broken sender or key is visible without the database console.
async function recentEmailFailures() {
  try {
    const out = await wrangler(["d1", "execute", "DB", "--remote", "--env", "production", "--json", "--command",
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
