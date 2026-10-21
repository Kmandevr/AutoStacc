// The public events calendar at /events (#178): every visible project's published events, server-rendered as a month
// (a keyboard-reachable table; phones get the list instead, css/events.css) or a list of event cards, with filters for
// a date range, city, country and host (a plain GET form, events.js checks them). The same page for everyone, signed
// out included, so it is edge-cached; js/events-calendar.js adds the Following filter for signed-in visitors through
// /api/events?following=1. Indexable, with canonical, Open Graph and JSON-LD (WebPage + ItemList of the events).
import { esc } from "../sites/text.js";
import { SITE_NAME, abs, webPage, shell, crumbNav, clip } from "./page.js";
import { parseEventFilters, eventsBetween, eventChoices, addDays, monthEnd } from "./events.js";
import { eventCards } from "./render-event.js";
import { countryName } from "./ics.js";

const PATH = "/events";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const monthName = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const shiftMonth = (m, n) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
const weekday = (d) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;

// This page's address with these filters (empty ones left out).
function href(f, change) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ view: f.view, month: f.view === "month" ? f.month : "", from: f.view === "list" ? f.from : "", to: f.view === "list" ? f.to : "", city: f.city, country: f.country, host: f.host, ...change }))
    if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${PATH}?${s}` : PATH;
}

function monthTable(f, events, today) {
  const first = `${f.month}-01`, last = monthEnd(f.month);
  const cells = [];
  for (let i = 0; i < weekday(first); i++) cells.push(`<td class="cal-out" aria-hidden="true"></td>`);
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const on = events.filter((e) => e.date <= d && (e.endDate || e.date) >= d);
    cells.push(`<td class="${d === today ? "cal-today" : ""}${on.length ? " cal-has" : ""}" data-date="${d}"><span class="cal-day"><time datetime="${d}">${Number(d.slice(8))}</time>${on.length ? `<span class="sr-only">, ${on.length} event${on.length === 1 ? "" : "s"}</span>` : ""}</span>${on.length ? `<ul>${on.map((e) => `<li><a href="${esc(e.path)}">${esc(e.title)}</a></li>`).join("")}</ul>` : ""}</td>`);
  }
  while (cells.length % 7) cells.push(`<td class="cal-out" aria-hidden="true"></td>`);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>${cells.slice(i, i + 7).join("")}</tr>`);
  return `<div class="cal-nav"><a class="btn ghost small" href="${esc(href(f, { month: shiftMonth(f.month, -1) }))}" rel="prev">&larr; <span class="sr-only">Previous month, </span>${esc(monthName(shiftMonth(f.month, -1)))}</a>
          <h2 id="cal-title">${esc(monthName(f.month))}</h2>
          <a class="btn ghost small" href="${esc(href(f, { month: shiftMonth(f.month, 1) }))}" rel="next"><span class="sr-only">Next month, </span>${esc(monthName(shiftMonth(f.month, 1)))} &rarr;</a></div>
        <table class="cal-month" aria-labelledby="cal-title" data-events-grid>
          <thead><tr>${DAYS.map((d) => `<th scope="col"><abbr title="${d}">${d.slice(0, 3)}</abbr></th>`).join("")}</tr></thead>
          <tbody>${rows.join("")}</tbody>
        </table>`;
}

function select(name, label, choices, value) {
  const opts = choices.map((c) => (typeof c === "string" ? { value: c, label: c } : c));
  if (value && !opts.some((o) => o.value.toLowerCase() === value.toLowerCase())) opts.unshift({ value, label: value });
  return `<label>${label}<select name="${name}"><option value="">Any</option>${opts.map((o) => `<option value="${esc(o.value)}"${o.value.toLowerCase() === value.toLowerCase() ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label>`;
}

function filters(f, choices) {
  return `<form class="cal-filters" method="get" action="${PATH}" aria-label="Filter events">
          <input type="hidden" name="view" value="list">
          <label>From<input type="date" name="from" value="${esc(f.from)}"></label>
          <label>To<input type="date" name="to" value="${esc(f.to)}"></label>
          ${select("city", "City", choices.cities, f.city)}
          ${select("country", "Country", choices.countries.map((c) => ({ value: c, label: countryName(c) })), f.country)}
          ${select("host", "Host", choices.hosts, f.host)}
          <button class="btn small" type="submit">Show events</button>
          <div class="cal-following" data-events-following hidden></div>
        </form>`;
}

// Full HTML for /events with these query parameters (a bad filter is a 400 from events.js).
export async function renderCalendar(app, params, today) {
  const f = parseEventFilters(params, { now: today });
  const [events, choices] = await Promise.all([eventsBetween(app.db, f), eventChoices(app.db)]);
  const siteUrl = app.config.siteUrl;
  const filtered = Boolean(f.city || f.country || f.host || params.toString());
  const title = `Events calendar · ${SITE_NAME}`;
  const description = clip("What's happening where and when: concerts, shows and events by creators on AutoStacc, by date, city, country and host, each with an \"Add to calendar\" link.");
  const crumbs = [["Home", "/"], ["Explore", "/explore"], ["Events", PATH]];
  const page = { path: PATH, title, description, index: !filtered, ogType: "website",
    schema: [webPage(siteUrl, { path: PATH, title, description }, abs(siteUrl, PATH) + "#events", crumbs),
      { "@type": "ItemList", "@id": abs(siteUrl, PATH) + "#events", itemListElement: events.slice(0, 50).map((e, i) => ({ "@type": "ListItem", position: i + 1, url: abs(siteUrl, e.path), name: e.title })) }] };
  const list = events.length ? eventCards(events, { heading: 3 }) : `<p class="empty">No events ${f.city || f.country || f.host ? "match these filters" : "in these dates"} yet.</p>`;
  const main = `    <div class="page-hero">
      <div class="wrap">
        ${crumbNav(crumbs)}
        <h1>Events calendar</h1>
        <p>What's coming up, where and when, from the creators on AutoStacc.</p>
      </div>
    </div>
    <section>
      <div class="wrap events-calendar" data-events-calendar data-from="${esc(f.from)}" data-to="${esc(f.to)}">
        ${filters(f, choices)}
        <p class="cal-views"><a href="${esc(href(f, { view: "month", month: f.month, from: "", to: "" }))}"${f.view === "month" ? ' aria-current="page"' : ""}>Month</a> · <a href="${esc(href({ ...f, view: "list" }, {}))}"${f.view === "list" ? ' aria-current="page"' : ""}>List</a></p>
        ${f.view === "month" ? monthTable(f, events, today) : ""}
        <h2 class="cal-list-head">${f.view === "month" ? `All events in ${esc(monthName(f.month))}` : `Events from <time datetime="${esc(f.from)}">${esc(f.from)}</time> to <time datetime="${esc(f.to)}">${esc(f.to)}</time>`}</h2>
        <div data-events-list>${list}</div>
      </div>
    </section>`;
  return shell(siteUrl, {}, { page, section: "events", styles: ["events"], main, scripts: ["js/events-calendar.js"], bodyPage: "events" });
}
