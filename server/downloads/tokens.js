// Short-lived download links: an HMAC-signed, expiring statement "this subject may fetch this file through this
// entitlement until time X". The link alone is not enough: redeeming re-checks the session and the entitlement.
import { hmacSign, hmacVerify, b64url, fromB64url } from "../lib/crypto.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function signDownload(secret, { fileId, entitlementId, subject, ttlSeconds }) {
  const payload = { f: fileId, e: entitlementId, s: subject, x: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return { token: `${body}.${await hmacSign(secret, "dl1." + body)}`, expiresAt: new Date(payload.x * 1000).toISOString() };
}

// Returns the payload, or { error } saying why not (bad / expired).
export async function readDownload(secret, token) {
  const [body, sig, extra] = String(token).split(".");
  if (!body || !sig || extra !== undefined || body.length > 600) return { error: "bad_token" };
  if (!(await hmacVerify(secret, "dl1." + body, sig))) return { error: "bad_token" };
  let payload;
  try {
    payload = JSON.parse(dec.decode(fromB64url(body)));
  } catch {
    return { error: "bad_token" };
  }
  if (typeof payload.x !== "number" || payload.x < Math.floor(Date.now() / 1000)) return { error: "expired", payload };
  return { payload };
}
