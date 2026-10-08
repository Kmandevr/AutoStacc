// The shape every statistic is returned in, so the admin page draws any of them without knowing which it is.
// source says how far to trust it:
//   payment  - orders confirmed by the payment provider (authoritative for money)
//   record   - the store's own records (accounts, entitlements, downloads): exact
//   activity - counted by visitors' browsers: approximate (ad blockers, bots, repeat views)
//   derived  - calculated from the others: an estimate, never a measurement
// format: count | money (cents, per currency) | percent. A metric is one of: value, values (per currency), series
// (per day) or rows (a small table). note explains anything a reader could misread.

const SOURCES = new Set(["payment", "record", "activity", "derived"]);

export function metric(id, label, source, body) {
  if (!SOURCES.has(source)) throw new Error(`unknown metric source ${source}`);
  return { id, label, source, format: "count", ...body };
}

export const count = (id, label, source, value, note) => metric(id, label, source, { value: Number(value) || 0, note });
export const money = (id, label, source, values, note) =>
  metric(id, label, source, { format: "money", values: values.map((v) => ({ currency: v.currency, cents: Number(v.cents) || 0 })), note });
export const percent = (id, label, source, value, note) => metric(id, label, source, { format: "percent", value, note });
export const series = (id, label, source, points, opts = {}) => metric(id, label, source, { series: points, ...opts });
export const rows = (id, label, source, columns, data, note) => metric(id, label, source, { columns, rows: data, note });

// Fills the days a series has no data for, so charts show quiet days as zero instead of skipping them.
export function daily(sinceDay, untilDay, points, key = "value") {
  const byDay = new Map(points.map((p) => [p.day, p]));
  const out = [];
  for (let d = new Date(sinceDay + "T00:00:00Z"); d.toISOString().slice(0, 10) <= untilDay; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    out.push({ day, ...(byDay.get(day) || { [key]: 0 }) });
  }
  return out;
}
