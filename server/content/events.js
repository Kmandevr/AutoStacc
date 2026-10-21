// Events across every visible project, for the public events calendar (/events, calendar.js) and /api/events: the
// filters a query string may name (a date range or a month, city, country, host = a creator's slug), checked here so
// nothing a browser sends reaches SQL unbound, and the published events that match, soonest first. A project's own
// events, its list page and the single event page read content.js; this module only reads.
import { all } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { select, PUBLISHED, UPCOMING, publicEvent, today } from "./content.js";

export const MAX_DAYS = 366;
export const MAX_EVENTS = 500;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const bad = (field) => fail(400, "invalid_filter", `${field} is not valid.`, { field });

export const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const monthEnd = (month) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const real = (d) => DAY.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

// { view: "month" | "list", month, from, to, city, country, host }. A month (default: this one) shows that month; a
// from/to range (or view=list) shows a list, from today and 90 days on unless named.
export function parseEventFilters(params, { now = today() } = {}) {
  const get = (k) => String(params.get(k) || "").trim();
  const day = (k) => { const v = get(k); return !v ? "" : real(v) ? v : bad(k); };
  const month = get("month");
  if (month && !MONTH.test(month)) bad("month");
  const view = get("view") || (get("from") || get("to") ? "list" : "month");
  if (!["month", "list"].includes(view)) bad("view");
  let from = day("from"), to = day("to");
  const shown = month || (from || now).slice(0, 7);
  if (view === "month") [from, to] = [`${shown}-01`, monthEnd(shown)];
  from ||= now;
  to ||= addDays(from, 90);
  if (to < from || (Date.parse(to) - Date.parse(from)) / 86400000 > MAX_DAYS) bad("to");
  const city = get("city");
  if (city.length > 120) bad("city");
  const country = get("country").toUpperCase();
  if (country && !/^[A-Z]{2}$/.test(country)) bad("country");
  const host = get("host").toLowerCase();
  if (host && !/^[a-z0-9-]{1,60}$/.test(host)) bad("host");
  return { view, month: shown, from, to, city, country, host };
}

// Published events of visible projects that run on any day from..to, matching the filters. projectIds: only these
// projects (the Following filter), [] = none.
export async function eventsBetween(db, f, { projectIds = null, max = MAX_EVENTS } = {}) {
  if (projectIds && !projectIds.length) return [];
  const where = [PUBLISHED, "x.event_date <= ?", UPCOMING];
  const params = [f.to, f.from];
  if (f.city) where.push("lower(x.city) = lower(?)"), params.push(f.city);
  if (f.country) where.push("x.country = ?"), params.push(f.country);
  if (f.host) where.push("c.slug = ?"), params.push(f.host);
  if (projectIds) where.push("x.project_id IN (SELECT value FROM json_each(?))"), params.push(JSON.stringify(projectIds));
  const rows = await all(db, `${select("events")} WHERE ${where.join(" AND ")} ORDER BY x.event_date, x.start_time, x.title LIMIT ?`, ...params, max);
  return rows.map(publicEvent);
}

// What the filters can offer: the cities, countries and hosts of every published event still to come.
export async function eventChoices(db) {
  const rows = await all(db, `SELECT DISTINCT x.city, x.country, c.slug AS host, c.name AS host_name FROM project_events x
    JOIN projects p ON p.id = x.project_id LEFT JOIN creators c ON c.id = p.creator_id WHERE ${PUBLISHED} AND ${UPCOMING} LIMIT 2000`, today());
  const uniq = (list) => [...new Map(list.filter((x) => x[0]).map((x) => [x[0], x])).values()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  return {
    cities: uniq(rows.map((r) => [r.city, r.city])).map(([v]) => v),
    countries: uniq(rows.map((r) => [r.country, r.country])).map(([v]) => v),
    hosts: uniq(rows.map((r) => [r.host, r.host_name || r.host])).map(([value, label]) => ({ value, label }))
  };
}
