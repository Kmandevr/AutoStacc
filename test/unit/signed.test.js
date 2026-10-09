// Signed mail links (server/lib/signed.js): round trip, purpose separation, tampering and expiry.
import { test } from "node:test";
import assert from "node:assert/strict";
import { signToken, readToken } from "../../server/lib/signed.js";

const SECRET = "x".repeat(40);
const later = () => Math.floor(Date.now() / 1000) + 60;

test("a token reads back only for its own purpose and secret", async () => {
  const t = await signToken(SECRET, "ec1", { u: "a", x: later() });
  assert.equal((await readToken(SECRET, "ec1", t)).u, "a");
  assert.equal(await readToken(SECRET, "nl1", t), null, "another purpose");
  assert.equal(await readToken("y".repeat(40), "ec1", t), null, "another secret");
});

test("tampered, malformed and expired tokens", async () => {
  const t = await signToken(SECRET, "ec1", { u: "a", x: later() });
  const [body, sig] = t.split(".");
  const other = Buffer.from(JSON.stringify({ u: "b", x: later() })).toString("base64url");
  for (const bad of [`${other}.${sig}`, `${body}.${sig}A`, `${t}.extra`, "", null, "abc"]) assert.equal(await readToken(SECRET, "ec1", bad), null);
  const old = await signToken(SECRET, "ec1", { u: "a", x: 1 });
  assert.deepEqual(await readToken(SECRET, "ec1", old), { expired: true, payload: { u: "a", x: 1 } });
});
