// "Add to calendar" for an event page (#178): the event as an iCalendar file (RFC 5545, served at
// /<creator>/<project>/events/<slug>.ics as a download) and a Google Calendar link, plus the event's start and end in
// the ISO form its Event JSON-LD uses. Nothing is collected: the file is static for everyone and the link only opens
// Google with the event's public facts. A timed event with a time zone is written in UTC; one without a zone keeps
// its local ("floating") time; an event with no time, or over several days, is all-day.
const compact = (d) => d.replace(/-/g, "");
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// Minutes the zone is ahead of UTC at that local wall time (checked twice so a DST change is respected), or null.
export function offsetMinutes(timeZone, date, time) {
  let fmt;
  try { fmt = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return null; }
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  const at = (ms) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - ms) / 60000;
  };
  const first = at(wall);
  return at(wall - first * 60000);
}
const offsetText = (min) => `${min < 0 ? "-" : "+"}${String(Math.floor(Math.abs(min) / 60)).padStart(2, "0")}:${String(Math.abs(min) % 60).padStart(2, "0")}`;

// e: the public event shape (content.js publicEvent). -> { allDay, start, end } with start/end ISO 8601 ("" when none).
export function eventTimes(e) {
  if (!e.time || e.endDate) return { allDay: true, start: e.date, end: e.endDate || "" };
  const off = e.timeZone ? offsetMinutes(e.timeZone, e.date, e.time) : null;
  return { allDay: false, start: `${e.date}T${e.time}:00${off === null ? "" : offsetText(off)}`, end: "", offset: off };
}

const utcStamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const text = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// Lines of at most 75 octets, continued with a leading space (RFC 5545 3.1), never splitting a character.
function fold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = "", size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; size = 0; }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

// A country's English name from its ISO code ("DE" -> "Germany"), else the code.
export function countryName(code) {
  if (!code) return "";
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code; } catch { return code; }
}
export const placeOf = (e) => [e.venue, e.city, countryName(e.country)].filter(Boolean).join(", ");

// The .ics file. url: the event page's full address; host: the site's host (for a stable UID).
export function eventIcs(e, { url, host, organizer, now = Date.now() }) {
  const t = eventTimes(e);
  const when = t.allDay
    ? [`DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(addDays(e.endDate || e.date, 1))}`]
    : [t.offset === null || t.offset === undefined
      ? `DTSTART:${compact(e.date)}T${e.time.replace(":", "")}00`
      : `DTSTART:${utcStamp(Date.parse(`${e.date}T${e.time}:00Z`) - t.offset * 60000)}`];
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AutoStacc//Events//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${e.project}.${e.id}@${host}`, `DTSTAMP:${utcStamp(now)}`, ...when, `SUMMARY:${text(e.title)}`,
    ...(placeOf(e) ? [`LOCATION:${text(placeOf(e))}`] : []),
    `DESCRIPTION:${text([e.description, organizer && `Hosted by ${organizer}.`, e.ticketUrl && `Tickets: ${e.ticketUrl}`, url].filter(Boolean).join("\n\n"))}`,
    `URL:${url}`, "END:VEVENT", "END:VCALENDAR"];
  return lines.map(fold).join("\r\n") + "\r\n";
}

// A Google Calendar "add event" link with the event's public facts.
export function googleCalendarUrl(e, { url }) {
  const t = eventTimes(e);
  const dates = t.allDay
    ? `${compact(e.date)}/${compact(addDays(e.endDate || e.date, 1))}`
    : `${compact(e.date)}T${e.time.replace(":", "")}00/${compact(e.date)}T${e.time.replace(":", "")}00`;
  const q = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates, details: [e.description, url].filter(Boolean).join("\n\n"), location: placeOf(e) });
  if (!t.allDay && e.timeZone) q.set("ctz", e.timeZone);
  return `https://calendar.google.com/calendar/render?${q}`;
}
