// Signed-in devices: an account's live Better Auth sessions as the Settings page shows them (device, rough place, when),
// never with their tokens. Revoking goes through Better Auth (server/account/routes.js); this file only reads.
import { all, first } from "../lib/db.js";

// Better Auth writes dates as ISO text or epoch numbers depending on the driver; answer ISO either way.
export const iso = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const BROWSERS = [[/Edg(e|A|iOS)?\//, "Edge"], [/OPR\/|Opera/, "Opera"], [/SamsungBrowser\//, "Samsung Internet"], [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"], [/Safari\//, "Safari"]];
const SYSTEMS = [[/iPhone|iPad|iPod/, "iOS"], [/Android/, "Android"], [/CrOS/, "ChromeOS"], [/Windows/, "Windows"], [/Mac OS X|Macintosh/, "macOS"], [/Linux/, "Linux"]];

// "Firefox on Windows", from the User-Agent header the browser sent when signing in. A guess, labelled as one.
export function deviceLabel(ua) {
  const s = String(ua || "");
  const pick = (list) => (list.find(([re]) => re.test(s)) || [])[1];
  const browser = pick(BROWSERS), system = pick(SYSTEMS);
  if (browser && system) return `${browser} on ${system}`;
  return browser || system || "Unknown device";
}

const LIVE = `"userId" = ? AND "expiresAt" > ?`;

export async function listDevices(db, userId) {
  const rows = await all(db,
    `SELECT "id", "createdAt", "updatedAt", "expiresAt", "ipAddress", "userAgent" FROM "session" WHERE ${LIVE} ORDER BY "updatedAt" DESC`,
    userId, new Date().toISOString());
  return rows.map((r) => ({
    id: r.id, device: deviceLabel(r.userAgent), userAgent: r.userAgent || "", ipAddress: r.ipAddress || "",
    signedInAt: iso(r.createdAt), lastActiveAt: iso(r.updatedAt), expiresAt: iso(r.expiresAt)
  }));
}

// The token of one of this account's sessions, for Better Auth's revokeSession; null when it isn't theirs.
export const tokenOf = async (db, userId, sessionId) =>
  ((await first(db, `SELECT "token" FROM "session" WHERE "id" = ? AND "userId" = ?`, sessionId, userId)) || {}).token || null;
