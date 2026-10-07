// Standard Web Crypto building blocks (HMAC-SHA-256, SHA-256, base64url). No custom cryptography:
// these only sign short-lived download links and hash random access keys. Passwords are Better Auth's job.

const enc = new TextEncoder();

export const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function fromB64url(s) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const keys = new Map();
async function hmacKey(secret) {
  if (!keys.has(secret)) {
    keys.set(secret, crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]));
  }
  return keys.get(secret);
}

export async function hmacSign(secret, message) {
  return b64url(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(message)));
}

// Constant-time comparison through the platform's verify.
export async function hmacVerify(secret, message, signature) {
  let sig;
  try {
    sig = fromB64url(signature);
  } catch {
    return false;
  }
  return crypto.subtle.verify("HMAC", await hmacKey(secret), sig, enc.encode(message));
}

export async function sha256(text) {
  return b64url(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}
