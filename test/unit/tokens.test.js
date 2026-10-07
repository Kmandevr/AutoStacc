// Download links: signed, expiring, and useless once edited.
import { test } from "node:test";
import assert from "node:assert/strict";
import { signDownload, readDownload } from "../../server/downloads/tokens.js";

const SECRET = "s".repeat(40);
const claim = { fileId: "pf_abc", entitlementId: "ent_abc", subject: "u:1", ttlSeconds: 300 };

test("a fresh link reads back", async () => {
  const { token } = await signDownload(SECRET, claim);
  const { payload, error } = await readDownload(SECRET, token);
  assert.equal(error, undefined);
  assert.equal(payload.f, "pf_abc");
  assert.equal(payload.s, "u:1");
});

test("edited, re-signed with another key, truncated or expired links fail", async () => {
  const { token } = await signDownload(SECRET, claim);
  const [body, sig] = token.split(".");
  const edited = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url")), f: "pf_other" })).toString("base64url");
  assert.equal((await readDownload(SECRET, `${edited}.${sig}`)).error, "bad_token");
  const other = await signDownload("o".repeat(40), claim);
  assert.equal((await readDownload(SECRET, other.token)).error, "bad_token");
  for (const t of ["", body, `${body}.`, `${body}.${sig}.x`, `${body}.${sig.slice(0, -2)}`, "!!.??"]) assert.equal((await readDownload(SECRET, t)).error, "bad_token", t);
  const old = await signDownload(SECRET, { ...claim, ttlSeconds: -1 });
  assert.equal((await readDownload(SECRET, old.token)).error, "expired");
});
