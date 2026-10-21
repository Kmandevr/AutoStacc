// The budget guard (owner: stay inside the Workers Paid plan's included usage, no overage charges; docs/packs.md,
// "Staying inside the $5 Workers Paid plan"). Monthly meters in usage_meters (UTC months) for what processing costs:
// Container time and R2 Class A operations, plus R2 storage measured live (storage.js). At ALERT of any allowance the
// admins get one alert a month per meter and jobs skip the optional analysis; at PAUSE new processing waits for the
// next month unless the owner allowed spending this month (setting usage_override). Creators' uploads are refused past
// the storage cap: the owner's base (setting storage_cap_gb) plus the paid limits creators' active plans hold above
// their free storage (storage.js paidCapBytes; owner 2026-10-21, #142), so paying creators never meet the site-wide
// wall. A leaf module: the packs and studio code call it; it calls neither.
// Soft by nature: two requests at once can both see 94% and both go ahead.
import { all, stmt, now } from "../lib/db.js";
import { getSetting } from "../settings/settings.js";
import { alertAdmins } from "../email/alerts.js";
import { storedBytes, paidCapBytes } from "./storage.js";

// Included each month (Cloudflare's pricing, checked 2026-10-10). The basic Container (1 GiB) uses its 25 GiB-hours of
// memory before its 375 vCPU-minutes (¼ vCPU) or disk, so memory time is the Container's meter.
export const ALLOWANCE = { container_ms: 25 * 3600 * 1000, class_a: 1000000, r2_bytes: 10e9 };
export const ALERT = 0.8;
export const PAUSE = 0.95;
// What a job costs beyond the time the engine reports: its cold start and the Container staying up after it (sleepAfter),
// per attempt; and a job whose time wasn't recorded (it failed every retry) counts as a long one.
export const JOB_OVERHEAD_MS = 20000;
export const UNKNOWN_JOB_MS = 6 * 60 * 1000;

export const monthOf = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 7);

/** What a finished job used: { container_ms, class_a } (each stored file is a write and its record a second). */
export const jobCost = ({ wallMs, attempts = 1, files = 0 }) => ({
  container_ms: (Number(wallMs) > 0 ? Number(wallMs) : UNKNOWN_JOB_MS) + Math.max(1, attempts) * JOB_OVERHEAD_MS,
  class_a: 2 * files + 2
});

const add = `INSERT INTO usage_meters (month, meter, amount, updated_at) SELECT ?, ?, ?, ? WHERE %s
  ON CONFLICT(month, meter) DO UPDATE SET amount = amount + excluded.amount, updated_at = excluded.updated_at`;

/** Statements adding `cost` ({ meter: amount }) to this month, for the caller's own batch (so it counts once with it).
 * when: an SQL condition (with its params) under which to count, evaluated in that batch, e.g. a job still running. */
export function meterStmts(db, cost, { when = "1", params = [] } = {}) {
  const t = now(), month = monthOf();
  return Object.entries(cost).filter(([, n]) => n > 0)
    .map(([meter, n]) => stmt(db, add.replace("%s", when), month, meter, Math.round(n), t, ...params));
}

/** The cap's parts, in bytes: the owner's base (setting storage_cap_gb), what active paid plans add, and the sum. */
export async function capParts(db) {
  const [gb, paidBytes] = await Promise.all([getSetting(db, "storage_cap_gb"), paidCapBytes(db)]);
  const baseBytes = Number(gb) * 1e9;
  return { baseBytes, paidBytes, capBytes: baseBytes + paidBytes };
}

/** The storage creators' uploads may fill, in bytes: the effective cap (base + paid), which every upload guard uses. */
export const capBytes = async (db) => (await capParts(db)).capBytes;

/** The message for a creator's upload refused at the cap. */
export const STORAGE_FULL = "AutoStacc's file storage is full for now. Your upload can go ahead once more room is added; nothing you already have is affected.";

/** Where this month stands: each meter's use and share of its allowance, the level, and what the owner set. */
export async function budget(app) {
  const month = monthOf();
  const rows = await all(app.db, "SELECT meter, amount FROM usage_meters WHERE month = ?", month);
  const used = Object.fromEntries(rows.map((r) => [r.meter, r.amount]));
  used.r2_bytes = await storedBytes(app.db);
  // Storage the owner chose to pay for (a cap above the free 10 GB) is the storage allowance; creators' uploads stop at
  // the cap, so storage alone pauses processing only when AutoStacc's own files fill it.
  const { baseBytes, paidBytes, capBytes: cap } = await capParts(app.db);
  const allowances = { ...ALLOWANCE, r2_bytes: Math.max(ALLOWANCE.r2_bytes, cap) };
  const meters = Object.fromEntries(Object.entries(allowances).map(([m, allowance]) => [m, { used: used[m] || 0, allowance, share: (used[m] || 0) / allowance }]));
  const top = Math.max(...Object.values(meters).map((m) => m.share));
  const allowed = (await getSetting(app.db, "usage_override")) === month;
  return { month, meters, level: top >= PAUSE ? "pause" : top >= ALERT ? "alert" : "ok", allowed, capBytes: cap, baseCapBytes: baseBytes, paidCapBytes: paidBytes };
}

/** Whether new processing may start now, and whether it should skip analysis (from ALERT on). */
export async function processingAllowed(app) {
  const b = await budget(app);
  return { start: b.level !== "pause" || b.allowed, analyze: b.level === "ok", budget: b };
}

/** Alerts the admins about each meter past ALERT (once a month per meter and level: alertAdmins dedupes by key). */
export async function checkLevels(app) {
  const b = await budget(app);
  for (const [meter, m] of Object.entries(b.meters)) {
    const level = m.share >= PAUSE ? "pause" : m.share >= ALERT ? "alert" : null;
    if (!level) continue;
    await alertAdmins(app, { key: `usage:${b.month}:${meter}:${level}`, title: level === "pause" ? "processing is paused to stay inside the free allowance" : "usage passed 80% of the free allowance",
      lines: [`${LABEL[meter]}: ${Math.round(m.share * 100)}% of this month's allowance.`,
        level === "pause" ? "New pack processing waits for next month unless you allow spending this month (Control Center, Usage)." : "Pack processing now skips listening to audio; at 95% new processing waits for next month."] });
  }
  return b;
}

const LABEL = { container_ms: "Container time", class_a: "Storage writes (R2 Class A)", r2_bytes: "Storage (R2)" };
