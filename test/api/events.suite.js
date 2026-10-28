// Events (#178, server/content/): the Studio's events API with its checks (dates, times, IANA zones, ISO countries,
// https tickets, the store's tag rule), each event's page (Event JSON-LD, "Add to calendar": the .ics download and a
// Google Calendar link), a project's events list (its own site page "events" wins), the public calendar /events and
// /api/events (filters fail closed; following=1 is signed-in and private), and news addresses answering a 301 home.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, sql } from "../support/client.js";
import { newBuyer } from "../support/flows.js";

const slug = (tag) => `${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const ldOf = (html) => JSON.parse(String(html).match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])["@graph"];
const where = (r) => r.headers.get("location").replace(/^https?:\/\/[^/]+/, "");
const MONTH = "2099-05";

export default (ctx) => describe("events", () => {
  const base = () => ctx.mock.url;
  const db = (q) => sql(ctx.mock.stateDir, q);
  const anon = () => new Client(base());
  const page = (p, method = "GET") => anon().req(method, p);
  const api = (projectId) => `/api/studio/projects/${projectId}/events`;

  async function maker(tag) {
    const { c, user } = await newBuyer(base(), tag);
    const cr = await c.post("/api/studio/creators", { name: `Host ${tag}`, slug: slug(tag) });
    assert.equal(cr.status, 201, JSON.stringify(cr.data));
    const pr = await c.post(`/api/studio/creators/${cr.data.creator.id}/projects`, { name: "Nights", slug: "nights" });
    assert.equal(pr.status, 201, JSON.stringify(pr.data));
    db(`UPDATE projects SET published = 1 WHERE id = '${pr.data.project.id}'`);
    return { c, user, creator: cr.data.creator, project: pr.data.project, home: `/${cr.data.creator.slug}/nights` };
  }
  async function live(s, body) {
    const r = await s.c.post(api(s.project.id), body);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal((await s.c.req("PATCH", `/api/studio/events/${r.data.item.id}`, { body: { published: true } })).status, 200);
    return r.data.item;
  }
  const full = (o = {}) => ({ title: "Warehouse Night", date: `${MONTH}-14`, time: "21:30", timeZone: "Europe/Berlin", venue: "Halle 4", city: "Berlin",
    country: "DE", ticketUrl: "https://tickets.example.org/w", tags: ["techno", "live"], description: "All night long.", ...o });

  test("the Studio checks every field; the public shape carries them; a live address never changes", async () => {
    const s = await maker("ev-api");
    for (const [body, field] of [[{ ticketUrl: "http://tickets.example.org/" }, /ticketUrl/], [{ ticketUrl: "javascript:alert(1)" }, /ticketUrl/],
      [{ timeZone: "Mars/Olympus" }, /timeZone/], [{ timeZone: "../etc" }, /timeZone/], [{ endDate: `${MONTH}-13` }, /endDate/], [{ endDate: "2099-02-30" }, /endDate/],
      [{ time: "25:00" }, /time/], [{ time: "9pm" }, /time/], [{ country: "de" }, /country/], [{ country: "DEU" }, /country/],
      [{ tags: ["bitch-fest"] }, /tags/], [{ tags: ["a", "b", "c", "d", "e", "f", "g", "h", "i"] }, /tags/], [{ title: undefined }, /title/], [{ city: undefined }, /city/],
      [{ date: "soon" }, /date/], [{ published: true }, /published/]]) {
      const r = await s.c.post(api(s.project.id), full(body));
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.match(String(r.data.error.field || ""), field, JSON.stringify(body));
    }
    const ev = await live(s, full());
    assert.equal(ev.slug, "warehouse-night", "the slug comes from the title");
    const [pub] = (await anon().get(`/api/projects/${s.project.id}/content`)).data.events;
    assert.deepEqual({ ...pub, creator: undefined, creatorName: undefined, projectName: undefined }, { id: "warehouse-night", project: s.project.id, title: "Warehouse Night",
      date: `${MONTH}-14`, time: "21:30", endDate: "", timeZone: "Europe/Berlin", venue: "Halle 4", city: "Berlin", country: "DE",
      ticketUrl: "https://tickets.example.org/w", tags: ["techno", "live"], description: "All night long.", path: `${s.home}/events/warehouse-night`,
      creator: undefined, creatorName: undefined, projectName: undefined });
    assert.equal((await s.c.req("PATCH", `/api/studio/events/${ev.id}`, { body: { slug: "moved" } })).data.error.code, "slug_locked");
    assert.equal((await s.c.post(api(s.project.id), full())).status, 409, "one address per event");
    assert.equal((await s.c.req("PATCH", `/api/studio/events/${ev.id}`, { body: { date: `${MONTH}-20`, endDate: null } })).status, 200);
    const stored = db(`SELECT event_date, start_time, time_zone, tags FROM project_events WHERE id = '${ev.id}'`)[0];
    assert.deepEqual(stored, { event_date: `${MONTH}-20`, start_time: "21:30", time_zone: "Europe/Berlin", tags: '["techno","live"]' });
  });

  test("an event page: Event JSON-LD, Add to calendar (.ics download and Google link); drafts and unknowns are the 404", async () => {
    const s = await maker("ev-page");
    const ev = await live(s, full({ title: "Show; with, commas", slug: "commas" }));
    const p = `${s.home}/events/${ev.slug}`;
    const html = (await page(p)).data;
    assert.match(html, /<title>Show; with, commas · Nights · AutoStacc<\/title>/);
    assert.match(html, /<meta name="robots" content="noindex, follow">/, "an untrusted creator's page");
    const event = ldOf(html).find((x) => x["@type"] === "Event");
    assert.equal(event.startDate, `${MONTH}-14T21:30:00+02:00`, "local time with the zone's offset");
    assert.deepEqual(event.location.address, { "@type": "PostalAddress", addressLocality: "Berlin", addressCountry: "DE" });
    assert.equal(event.offers.url, "https://tickets.example.org/w");
    assert.match(html, new RegExp(`href="${p}\\.ics" download=`));
    assert.match(html, /href="https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&amp;text=Show%3B\+with%2C\+commas&amp;dates=20990514T213000%2F/);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);

    const ics = await page(`${p}.ics`);
    assert.equal(ics.status, 200);
    assert.match(ics.headers.get("content-type"), /^text\/calendar/);
    assert.match(ics.headers.get("content-disposition"), /^attachment; filename="commas\.ics"$/);
    assert.match(ics.data, /BEGIN:VEVENT\r\n/);
    assert.match(ics.data, /DTSTART:20990514T193000Z\r\n/, "21:30 in Berlin's summer is 19:30 UTC");
    assert.match(ics.data, /SUMMARY:Show\\; with\\, commas\r\n/, "text is escaped");
    assert.ok(ics.data.split("\r\n").every((l) => Buffer.byteLength(l) <= 75), "lines are folded");
    assert.equal((await page(`${p}.ics`, "HEAD")).data, "");
    assert.equal(where(await page(`${s.home}/Events/${ev.slug}.ICS`)), `${p}.ics`);

    const draft = (await s.c.post(api(s.project.id), full({ slug: "draft-night" }))).data.item;
    for (const missing of [`${s.home}/events/${draft.slug}`, `${s.home}/events/${draft.slug}.ics`, `${s.home}/events/no-such`, `${s.home}/music/${ev.slug}.ics`,
      `${s.home}/events/${ev.slug}/extra`, `/no-such-creator/nights/events/${ev.slug}`]) assert.equal((await page(missing)).status, 404, missing);
    db(`UPDATE creators SET trusted = 1 WHERE id = '${s.creator.id}'`);
    assert.match((await page(p)).data, new RegExp(`<link rel="canonical" href="${base()}${p}">`));
    assert.match((await page("/sitemap-content.xml")).data, new RegExp(`<loc>${base()}${p}</loc>`));
  });

  test("a project's events list, unless its own site page \"events\" answers; news addresses lead home and keep their rows", async () => {
    const s = await maker("ev-list");
    await live(s, full({ slug: "listed", title: "Listed night" }));
    const list = await page(`${s.home}/events`);
    assert.equal(list.status, 200);
    assert.match(list.data, /<title>Events · Nights · AutoStacc<\/title>/);
    assert.match(list.data, new RegExp(`href="${s.home}/events/listed"`));
    db(`INSERT INTO site_pages (project_id, slug, title, html, sort, published_at) VALUES ('${s.project.id}', 'events', 'Events', '<!doctype html><p>own events page</p>', 1, '2026-01-01T00:00:00.000Z')`);
    assert.match((await page(`${s.home}/events`)).data, /own events page/);

    db(`INSERT INTO project_news (id, project_id, slug, post_date, title, published, created_at, updated_at) VALUES ('nws_evtest${Date.now()}', '${s.project.id}', 'old-post', '2026-01-01', 'Old', 1, '2026-01-01', '2026-01-01')`);
    for (const p of [`${s.home}/news`, `${s.home}/news/old-post`, `${s.home}/news/never-was`]) {
      const r = await page(p);
      assert.equal(r.status, 301, p);
      assert.equal(where(r), s.home, p);
    }
    assert.deepEqual(db(`SELECT published, deleted_at FROM project_news WHERE project_id = '${s.project.id}'`), [{ published: 1, deleted_at: null }]);
  });

  test("the calendar /events: month and list views, filters by place, host and dates; bad filters fail closed", async () => {
    const a = await maker("ev-cal-a");
    const b = await maker("ev-cal-b");
    await live(a, full({ slug: "a-berlin", title: "A in Berlin" }));
    await live(b, full({ slug: "b-lyon", title: "B in Lyon", city: "Lyon", country: "FR", date: `${MONTH}-02`, time: null, timeZone: null }));
    const month = await page(`/events?month=${MONTH}`);
    assert.equal(month.status, 200);
    assert.match(month.data, /<table class="cal-month"/);
    assert.match(month.data, /A in Berlin/);
    assert.match(month.data, /B in Lyon/);
    assert.match(month.data, /<script src="\/js\/events-calendar\.js"><\/script>/);
    assert.match(month.data, /<meta name="robots" content="noindex, follow">/, "a filtered view isn't indexed");
    const plain = await page("/events");
    assert.match(plain.data, new RegExp(`<link rel="canonical" href="${base()}/events">`));
    assert.match(plain.data, /<title>Events calendar · AutoStacc<\/title>/);
    const byCity = (await page(`/events?view=list&from=${MONTH}-01&to=${MONTH}-28&city=lyon`)).data;
    assert.match(byCity, /B in Lyon/);
    assert.doesNotMatch(byCity, /A in Berlin/);
    assert.doesNotMatch((await page(`/events?month=${MONTH}&country=FR`)).data, /A in Berlin/);
    const byHost = (await page(`/events?month=${MONTH}&host=${a.creator.slug}`)).data;
    assert.match(byHost, /A in Berlin/);
    assert.doesNotMatch(byHost, /B in Lyon/);
    for (const bad of ["month=2099-13", "from=2099-02-30", "from=2099-01-01&to=2100-06-01", "country=FRA", "host=%3Cscript%3E", "view=grid", "from=2099-05-02&to=2099-05-01"]) {
      const r = await page(`/events?${bad}`);
      assert.equal(r.status, 302, bad);
      assert.equal(where(r), "/events", bad);
    }
    assert.equal(where(await page("/events/")), "/events");
  });

  test("/api/events: public and cached; following=1 is signed in, private and only followed projects'", async () => {
    const a = await maker("ev-fol-a");
    const b = await maker("ev-fol-b");
    await live(a, full({ slug: "followed", title: "Followed night" }));
    await live(b, full({ slug: "unfollowed", title: "Unfollowed night" }));
    const q = `from=${MONTH}-01&to=${MONTH}-31`;
    const pub = await anon().get(`/api/events?${q}`);
    assert.equal(pub.status, 200);
    assert.match(pub.headers.get("cache-control"), /^public/);
    assert.ok(["followed", "unfollowed"].every((id) => pub.data.events.some((e) => e.id === id)));
    for (const bad of ["following=yes", "from=nope", "from=2099-01-01&to=2101-01-01", "country=x"]) assert.equal((await anon().get(`/api/events?${bad}`)).status, 400, bad);
    assert.equal((await anon().get(`/api/events?${q}&following=1`)).status, 401);
    const fan = await newBuyer(base(), "ev-fan");
    assert.deepEqual((await fan.c.get(`/api/events?${q}&following=1`)).data.events, [], "follows nothing yet");
    assert.equal((await fan.c.req("PUT", `/api/follows/${a.project.id}`, { body: {} })).status, 200);
    const mine = await fan.c.get(`/api/events?${q}&following=1`);
    assert.equal(mine.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(mine.data.events.map((e) => e.id), ["followed"]);
  });

  test("the database: shows became events, nothing dropped; releases have tags", async () => {
    assert.deepEqual(db("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('project_shows', 'project_events', 'project_news') ORDER BY name").map((r) => r.name), ["project_events", "project_news"]);
    const cols = db("SELECT name FROM pragma_table_info('project_events')").map((r) => r.name);
    for (const c of ["event_date", "slug", "title", "start_time", "end_date", "time_zone", "country", "tags", "description"]) assert.ok(cols.includes(c), c);
    assert.ok(db("SELECT name FROM pragma_table_info('project_releases')").some((r) => r.name === "tags"));
  });
});
