// Signed, expiring links for mail (newsletter sign-up, email change): a JSON payload, base64url, and an HMAC over a
// purpose prefix plus the payload, so a token made for one purpose never verifies for another. The payload is readable
// by whoever holds the link, so it holds only what that person already knows.
import { hmacSign, hmacVerify, b64url, fromB64url } from "./crypto.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

// payload must carry x: expiry in seconds since 1970.
export async function signToken(secret, purpose, payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmacSign(secret, `${purpose}.${body}`)}`;
}

// The payload, { expired: true, payload } when it is genuine but too old, or null when it is anything else.
export async function readToken(secret, purpose, token) {
  const [body, sig, extra] = String(token || "").split(".");
  if (!body || !sig || extra !== undefined || body.length > 800 || !(await hmacVerify(secret, `${purpose}.${body}`, sig))) return null;
  let payload;
  try {
    payload = JSON.parse(dec.decode(fromB64url(body)));
  } catch {
    return null;
  }
  if (!payload || typeof payload.x !== "number") return null;
  return payload.x < Math.floor(Date.now() / 1000) ? { expired: true, payload } : payload;
}
