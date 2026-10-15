// Two-step sign-in for admins (feature switch auth.adminTwoFactor; server/auth/two-factor.js). The default export runs
// against a store with the switch on (test/api/two-factor.test.js): only admins can set it up, sign-in then needs a
// code, wrong codes are refused and limited, a backup code works once, turning it off needs the password and a code,
// and every change is audit-logged without secrets. `switchedOff` runs in the accounts group (switch off, the
// default): no routes, sign-in exactly as before.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Client, verifiedUser, sql, unique } from "../support/client.js";

const PASSWORD = "correct-horse-battery";

// RFC 6238 codes from an otpauth:// address's base32 secret, as an authenticator app makes them.
function totp(uri, offset = 0) {
  const secret = new URL(uri).searchParams.get("secret");
  let bits = "";
  for (const ch of secret.replace(/=+$/, "")) bits += "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const h = crypto.createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, "0");
}
// A six-digit code that is none of the codes the store accepts right now (it allows one step either side).
const wrongCode = (uri) => {
  const valid = new Set([-1, 0, 1].map((i) => totp(uri, i)));
  let n = 123456;
  while (valid.has(String(n))) n++;
  return String(n);
};

export default (ctx) => describe("two-step sign-in (switched on)", () => {
  const db = (q) => sql(ctx.mock.stateDir, q);
  const makeAdmin = async (tag) => {
    const c = new Client(ctx.mock.url);
    const email = unique(tag);
    const user = await verifiedUser(c, email, PASSWORD);
    db(`UPDATE "user" SET role = 'admin' WHERE id = '${user.id}'`);
    return { c, email, user };
  };
  // Sets it up and confirms it; returns the otpauth address and the backup codes.
  const enrol = async (c) => {
    const r = await c.post("/api/auth/two-factor/enable", { password: PASSWORD });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal((await c.post("/api/auth/two-factor/verify-totp", { code: totp(r.data.totpURI) })).status, 200);
    return { uri: r.data.totpURI, backupCodes: r.data.backupCodes };
  };
  const signIn = (email) => {
    const c = new Client(ctx.mock.url);
    return c.post("/api/auth/sign-in/email", { email, password: PASSWORD }).then((r) => ({ c, r }));
  };

  test("customers see nothing new and can't set it up", async () => {
    const c = new Client(ctx.mock.url);
    const email = unique("tf-customer");
    await verifiedUser(c, email, PASSWORD);
    assert.equal((await c.get("/api/account/two-factor")).status, 404);
    assert.equal((await c.post("/api/auth/two-factor/enable", { password: PASSWORD })).status, 404);
    const { r } = await signIn(email);
    assert.equal(r.status, 200);
    assert.ok(!r.data.twoFactorRedirect);
    assert.equal((await new Client(ctx.mock.url).get("/api/account/two-factor")).status, 401);
  });

  test("an admin sets it up: wrong password and wrong code refused, then on and audit-logged without secrets", async () => {
    const { c, user } = await makeAdmin("tf-enrol");
    assert.deepEqual((await c.get("/api/account/two-factor")).data, { enabled: false });
    assert.equal((await c.post("/api/auth/two-factor/enable", { password: "not-the-password" })).status, 400);
    const r = await c.post("/api/auth/two-factor/enable", { password: PASSWORD });
    assert.equal(r.status, 200);
    assert.match(r.data.totpURI, /^otpauth:\/\/totp\/AutoStacc:.+\?secret=[A-Z2-7]+&issuer=AutoStacc&digits=6&period=30$/);
    assert.equal(r.data.backupCodes.length, 10);
    // Not on until a code from the app confirms it.
    assert.equal(db(`SELECT "twoFactorEnabled" AS on_ FROM "user" WHERE id = '${user.id}'`)[0].on_, 0);
    assert.equal((await c.post("/api/auth/two-factor/verify-totp", { code: wrongCode(r.data.totpURI) })).status, 401);
    assert.deepEqual((await c.get("/api/account/two-factor")).data, { enabled: false });
    assert.equal((await c.post("/api/auth/two-factor/verify-totp", { code: totp(r.data.totpURI) })).status, 200);
    assert.deepEqual((await c.get("/api/account/two-factor")).data, { enabled: true });
    // Stored encrypted: neither the secret nor a backup code is in the database as text.
    const secret = new URL(r.data.totpURI).searchParams.get("secret");
    const row = db(`SELECT secret, "backupCodes" AS codes FROM "twoFactor" WHERE "userId" = '${user.id}'`)[0];
    assert.ok(!row.secret.includes(secret) && !row.codes.includes(r.data.backupCodes[0]));
    const log = db(`SELECT action, detail FROM admin_audit WHERE target_id = '${user.id}' AND action LIKE 'auth.two_factor%'`);
    assert.deepEqual(log.map((l) => l.action), ["auth.two_factor_enabled"]);
    assert.ok(!JSON.stringify(log).includes(secret));
    // Set up once: a second setup on top is refused.
    assert.equal((await c.post("/api/auth/two-factor/enable", { password: PASSWORD })).status, 400);
  });

  test("sign-in then needs the code: the password alone gives no session", async () => {
    const { c, email, user } = await makeAdmin("tf-signin");
    const { uri } = await enrol(c);
    const signIns = () => db(`SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'admin.signed_in' AND actor_user_id = '${user.id}'`)[0].n;
    const before = signIns();
    const { c: d, r } = await signIn(email);
    assert.equal(r.status, 200);
    assert.equal(r.data.twoFactorRedirect, true);
    assert.deepEqual(r.data.twoFactorMethods, ["totp"]);
    assert.equal((await d.get("/api/account")).data.user, null);
    assert.equal((await d.get("/api/library")).status, 401);
    // The code without the password step's cookie is no sign-in.
    assert.equal((await new Client(ctx.mock.url).post("/api/auth/two-factor/verify-totp", { code: totp(uri) })).status, 401);
    const ok = await d.post("/api/auth/two-factor/verify-totp", { code: totp(uri) });
    assert.equal(ok.status, 200);
    assert.equal((await d.get("/api/account")).data.user.id, user.id);
    // One sign-in in the audit log, not one for the password step as well.
    assert.equal(signIns(), before + 1);
  });

  test("wrong codes are refused, end the attempt after five, and are rate limited", async () => {
    const { c, email } = await makeAdmin("tf-wrong");
    const { uri } = await enrol(c);
    const { c: d, r } = await signIn(email);
    assert.equal(r.data.twoFactorRedirect, true);
    for (let i = 0; i < 5; i++) assert.equal((await d.post("/api/auth/two-factor/verify-totp", { code: wrongCode(uri) })).status, 401, `try ${i + 1}`);
    // Five wrong: this sign-in is over, even with the right code now.
    const sixth = await d.post("/api/auth/two-factor/verify-totp", { code: totp(uri) });
    assert.equal(sixth.status, 400);
    assert.equal(sixth.data.code, "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE");
    assert.equal((await d.get("/api/account")).data.user, null);
    // And the client is rate limited on the code step.
    assert.equal((await d.post("/api/auth/two-factor/verify-totp", { code: totp(uri) })).status, 429);
    // Starting again from another client works.
    const again = await signIn(email);
    assert.equal((await again.c.post("/api/auth/two-factor/verify-totp", { code: totp(uri) })).status, 200);
  });

  test("a backup code signs in once", async () => {
    const { c, email } = await makeAdmin("tf-backup");
    const { backupCodes } = await enrol(c);
    const first = await signIn(email);
    assert.equal((await first.c.post("/api/auth/two-factor/verify-backup-code", { code: backupCodes[0] })).status, 200);
    assert.ok((await first.c.get("/api/account")).data.user);
    const second = await signIn(email);
    assert.equal((await second.c.post("/api/auth/two-factor/verify-backup-code", { code: backupCodes[0] })).status, 401);
    assert.equal((await second.c.get("/api/account")).data.user, null);
    assert.equal((await second.c.post("/api/auth/two-factor/verify-backup-code", { code: backupCodes[1] })).status, 200);
  });

  test("turning it off needs the password and a code; then sign-in is password only again", async () => {
    const { c, email, user } = await makeAdmin("tf-off");
    const { uri, backupCodes } = await enrol(c);
    assert.equal((await c.post("/api/auth/two-factor/disable", { password: PASSWORD })).status, 400);
    assert.equal((await c.post("/api/auth/two-factor/disable", { password: PASSWORD, code: wrongCode(uri) })).status, 400);
    assert.equal((await c.post("/api/auth/two-factor/disable", { password: "not-the-password", code: totp(uri) })).status, 400);
    assert.deepEqual((await c.get("/api/account/two-factor")).data, { enabled: true });
    // Signed out by someone without the session: refused.
    assert.equal((await new Client(ctx.mock.url).post("/api/auth/two-factor/disable", { password: PASSWORD, code: totp(uri) })).status, 401);
    assert.equal((await c.post("/api/auth/two-factor/disable", { password: PASSWORD, code: backupCodes[0] })).status, 200);
    assert.deepEqual((await c.get("/api/account/two-factor")).data, { enabled: false });
    assert.equal(db(`SELECT COUNT(*) AS n FROM "twoFactor" WHERE "userId" = '${user.id}'`)[0].n, 0);
    const log = db(`SELECT action FROM admin_audit WHERE target_id = '${user.id}' AND action LIKE 'auth.two_factor%' ORDER BY at`);
    assert.deepEqual(log.map((l) => l.action), ["auth.two_factor_enabled", "auth.two_factor_disabled"]);
    const { r } = await signIn(email);
    assert.ok(r.data.token && !r.data.twoFactorRedirect);
  });

  test("the plugin's other ways in are not there", async () => {
    const { c } = await makeAdmin("tf-unused");
    for (const p of ["/api/auth/two-factor/send-otp", "/api/auth/two-factor/verify-otp", "/api/auth/two-factor/get-totp-uri", "/api/auth/two-factor/generate-backup-codes"]) {
      assert.equal((await c.post(p, { password: PASSWORD, code: "123456" })).status, 404, p);
    }
  });

  test("deleting an account removes its authenticator secret; the export says only whether it's on", async () => {
    const { c, email, user } = await makeAdmin("tf-delete");
    await enrol(c);
    const exported = await c.post("/api/account/export", {});
    assert.equal(exported.data.account.twoStepSignIn, true);
    assert.ok(!/secret|backupCodes/.test(JSON.stringify(exported.data)));
    // Admins can't delete themselves from Settings; a former admin can.
    db(`UPDATE "user" SET role = 'customer' WHERE id = '${user.id}'`);
    assert.equal((await c.post("/api/account/delete", { confirm: email, password: PASSWORD })).status, 200);
    assert.equal(db(`SELECT COUNT(*) AS n FROM "twoFactor" WHERE "userId" = '${user.id}'`)[0].n, 0);
  });
});

export const switchedOff = (ctx) => describe("two-step sign-in (switched off, the default)", () => {
  test("no routes, and sign-in is password only even for an account marked as having it", async () => {
    const c = new Client(ctx.mock.url);
    const email = unique("tf-offswitch");
    const user = await verifiedUser(c, email, PASSWORD);
    sql(ctx.mock.stateDir, `UPDATE "user" SET role = 'admin', "twoFactorEnabled" = 1 WHERE id = '${user.id}'`);
    assert.equal((await c.get("/api/account/two-factor")).status, 404);
    for (const p of ["enable", "disable", "verify-totp", "verify-backup-code", "get-totp-uri", "generate-backup-codes"]) {
      assert.equal((await c.post(`/api/auth/two-factor/${p}`, { password: PASSWORD, code: "123456" })).status, 404, p);
    }
    const r = await new Client(ctx.mock.url).post("/api/auth/sign-in/email", { email, password: PASSWORD });
    assert.equal(r.status, 200);
    assert.ok(r.data.token && !r.data.twoFactorRedirect);
    // What the store holds is still exported: the account is marked as having it on.
    assert.equal((await c.post("/api/account/export", {})).data.account.twoStepSignIn, true);
  });
});
