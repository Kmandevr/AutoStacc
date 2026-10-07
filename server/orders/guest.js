// Guest access: a guest order gets random access keys (only their hashes are stored): one in an httpOnly cookie set at
// checkout, one in the confirmation email link. Either unlocks that one order's status and files for 30 days.
// Creating an account with the same email (and verifying it) is the permanent way in.
import { randomToken, now } from "../lib/db.js";
import { sha256 } from "../lib/crypto.js";
import { getOrder } from "./orders.js";

const COOKIE = "gs_guest";
const MAX_KEYS = 10;
const KEY_SHAPE = /^ord_[a-z2-7]{26}\.[a-z2-7]{52}$/;

export async function newGuestKey() {
  const secret = randomToken(32);
  return { secret, hash: await sha256(secret), join: (orderId) => `${orderId}.${secret}` };
}

function readCookie(request) {
  const raw = (request.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  if (!raw) return [];
  return decodeURIComponent(raw.slice(COOKIE.length + 1)).split("|").filter((k) => KEY_SHAPE.test(k)).slice(0, MAX_KEYS);
}

export function guestCookie(config, keys) {
  const value = encodeURIComponent(keys.slice(-MAX_KEYS).join("|"));
  return `${COOKIE}=${value}; Path=/api/; HttpOnly; SameSite=Lax; Max-Age=${config.guestAccessDays * 86400}${config.secure ? "; Secure" : ""}`;
}

// A key is valid if it matches its order's stored hash and the order is less than guestAccessDays old.
export async function checkGuestKey(app, key) {
  if (!KEY_SHAPE.test(key)) return null;
  const [orderId, secret] = key.split(".");
  const order = await getOrder(app.db, orderId);
  const hash = await sha256(secret);
  if (!order || !(hash === order.access_key_hash || hash === order.email_key_hash)) return null;
  const ageDays = (Date.parse(now()) - Date.parse(order.created_at)) / 86400000;
  return ageDays <= app.config.guestAccessDays ? order : null;
}

// Order ids the request's guest cookie proves access to.
export async function guestOrderIds(app) {
  if (app._guestOrderIds) return app._guestOrderIds;
  const ids = [];
  for (const key of readCookie(app.request)) {
    const order = await checkGuestKey(app, key);
    if (order) ids.push(order.id);
  }
  app._guestOrderIds = ids;
  return ids;
}

export const guestKeysFromRequest = (request) => readCookie(request);
