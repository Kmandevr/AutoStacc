// Test helpers: an HTTP client with its own cookie jar and client IP (rate limits are per IP), account sign-up with
// email verification through the dev outbox, direct SQL against the local database, and signed Stripe webhooks.
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import Stripe from "stripe";

export const ROOT = path.resolve(import.meta.dirname, "../..");
let ipCounter = 1;

export class Client {
  constructor(base, { origin = base } = {}) {
    this.base = base;
    this.origin = origin;
    this.jar = new Map();
    const n = ipCounter++;
    this.ip = `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
  }
  cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  store(res) {
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i).trim(), value = pair.slice(i + 1).trim();
      if (!value || attrs.some((a) => /max-age=0\b/i.test(a.trim()))) this.jar.delete(name); else this.jar.set(name, value);
    }
  }
  async req(method, p, opts = {}) {
    try {
      return await this.send(method, p, opts);
    } catch (e) {
      // A pooled keep-alive connection the local server closed while idle (tests that run several slow
      // `wrangler d1 execute` calls in a row): the request never reached the server, so sending it again is safe.
      if (!(e.cause && e.cause.code === "UND_ERR_SOCKET" && /other side closed/.test(e.cause.message))) throw e;
      return this.send(method, p, opts);
    }
  }
  async send(method, p, { body, headers = {}, raw, redirect = "manual" } = {}) {
    const res = await fetch(this.base + p, {
      method, redirect,
      headers: {
        "cf-connecting-ip": this.ip,
        ...(this.origin && { Origin: this.origin }),
        ...(this.jar.size && { Cookie: this.cookieHeader() }),
        ...(body !== undefined && raw === undefined && { "Content-Type": "application/json" }),
        ...headers
      },
      body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined
    });
    this.store(res);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  }
  get(p, o) { return this.req("GET", p, o); }
  post(p, body, o = {}) { return this.req("POST", p, { ...o, body }); }
}

export async function outbox(base, to) {
  const res = await fetch(`${base}/api/dev/outbox?to=${encodeURIComponent(to)}`);
  return (await res.json()).mails;
}

export const linkIn = (mail) => (mail.body_text.match(/https?:\/\/\S+/) || [])[0];

// Creates an account and confirms its email; the client ends up signed in.
export async function verifiedUser(client, email, password = "correct-horse-battery") {
  const r = await client.post("/api/auth/sign-up/email", { email, password, name: email.split("@")[0], callbackURL: "/library" });
  if (r.status !== 200) throw new Error("sign-up failed " + JSON.stringify(r.data));
  const mail = (await outbox(client.base, email)).find((m) => m.kind === "verify-email");
  await client.get(new URL(linkIn(mail)).pathname + new URL(linkIn(mail)).search);
  const me = await client.get("/api/account");
  if (!me.data.user || !me.data.user.emailVerified) throw new Error("verification failed");
  return me.data.user;
}

// Reads and writes the local D1 database file the dev server keeps in `stateDir`, directly with Node's built-in SQLite
// (the same file `wrangler d1 execute --local` would open, without starting a wrangler process per query, which cost
// seconds each). The server keeps the file open in WAL mode, so a short busy wait covers a write colliding with its own.
function openDb(stateDir) {
  const dir = path.join(stateDir, "v3", "d1", "miniflare-D1DatabaseObject");
  const file = readdirSync(dir).find((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite");
  if (!file) throw new Error("no local D1 database in " + dir);
  const db = new DatabaseSync(path.join(dir, file));
  db.exec("PRAGMA busy_timeout = 10000");
  return db;
}

// Splits on semicolons that are outside quoted text, so a value containing ";" stays in one statement.
function statements(command) {
  const out = [];
  let cur = "", quote = "";
  for (const ch of command) {
    if (quote) { cur += ch; if (ch === quote) quote = ""; continue; }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === ";") { if (cur.trim()) out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function sql(stateDir, command) {
  return sqlAll(stateDir, command)[0];
}

// Several statements in one call: one result list per statement (rows as plain objects; writes give []).
export function sqlAll(stateDir, command) {
  const db = openDb(stateDir);
  try {
    return statements(command).map((q) => db.prepare(q).all().map((row) => ({ ...row })));
  } finally { db.close(); }
}

export function devVar(name) {
  const line = readFileSync(path.join(ROOT, ".dev.vars"), "utf8").split("\n").find((l) => l.startsWith(name + "="));
  return line ? line.slice(name.length + 1) : "";
}

const stripe = new Stripe("sk_test_unused");
export function signedEvent(event, secret, timestamp) {
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret, ...(timestamp && { timestamp }) });
  return { payload, header };
}

export async function sendWebhook(client, event, secret, timestamp, path = "/api/webhooks/stripe") {
  const { payload, header } = signedEvent(event, secret, timestamp);
  return client.req("POST", path, { raw: payload, headers: { "stripe-signature": header, "Content-Type": "application/json" } });
}

export const unique = (tag) => `${tag}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}@test.dev`;
