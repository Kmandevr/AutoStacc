// Studio Events (GS.studioContent.kinds.events, for js/studio-content.js): an event's fields (title, date, optional
// start time and last day, time zone, venue, city, country, ticket link, tags, description, address) and reading the
// form under the API's field names (/api/studio/.../events; checked again by server/content/clean.js). Events show on
// the project's Events page and the public calendar (/events). Needs js/util.js and js/studio-content.js.
(function () {
  "use strict";

  const C = window.GS.studioContent;
  if (!C) return;
  const { escapeHTML: e } = window.GS;
  const { field, area, slug, tags, readTags, value } = C.form;
  const here = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } };
  const zones = () => { try { return Intl.supportedValuesOf("timeZone"); } catch { return []; } };
  const country = (code) => { try { return code ? new Intl.DisplayNames(undefined, { type: "region" }).of(code) : ""; } catch { return code; } };

  const fields = (x) => `${field("title", "Title", x.title, 'required maxlength="200"')}
    <div class="cx-pair">${field("date", "Date", x.date, 'type="date" required')}${field("time", "Start time (optional)", x.time, 'type="time"')}</div>
    <div class="cx-pair">${field("endDate", "Last day (optional)", x.endDate, 'type="date"', "For an event over several days.")}
      ${field("timeZone", "Time zone", x.timeZone, 'list="cx-zones" maxlength="64" autocapitalize="off" spellcheck="false"', "Where it happens, like Europe/Berlin.")}</div>
    <datalist id="cx-zones">${zones().map((z) => `<option value="${e(z)}">`).join("")}</datalist>
    ${slug(x, "events")}
    ${field("venue", "Venue (optional)", x.venue, 'maxlength="120"')}
    <div class="cx-pair">${field("city", "City", x.city, 'required maxlength="120"')}
      ${field("country", "Country code (optional)", x.country, 'maxlength="2" pattern="[A-Za-z]{2}" autocapitalize="characters" aria-describedby="cx-country-name"',
        `Two letters, like DE or US.<span id="cx-country-name" data-country> ${e(country(x.country))}</span>`)}</div>
    ${field("ticketUrl", "Ticket link (optional)", x.ticketUrl, 'type="url" maxlength="500"', "An https link.")}
    ${area("description", "Description (optional)", x.description, 'maxlength="2000"')}
    ${tags(x)}`;

  // The form's values under the API's field names (the address is added by js/studio-content.js).
  const collect = (f) => {
    const v = (k) => value(f, k);
    return { title: v("title"), date: v("date"), time: v("time") || null, endDate: v("endDate") || null, timeZone: v("timeZone") || null,
      venue: v("venue"), city: v("city"), country: v("country").toUpperCase(), ticketUrl: v("ticketUrl") || null,
      description: v("description"), tags: readTags(f) };
  };

  // The country's name as its code is typed, so a wrong code shows.
  const change = (t) => {
    if (t.name !== "country") return;
    const out = t.form.querySelector("[data-country]");
    if (out) out.textContent = ` ${country(t.value.trim().toUpperCase()) || ""}`;
  };

  const when = (x) => [x.date, x.time, x.endDate && x.endDate !== x.date ? `to ${x.endDate}` : ""].filter(Boolean).join(" ");
  C.kinds.events = {
    kind: "events", title: "Events", one: "event", fields, collect, change,
    fresh: () => ({ timeZone: here() }),
    name: (x) => x.title || [x.city, x.venue].filter(Boolean).join(" · "),
    meta: (x) => [when(x), [x.venue, x.city, x.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ")
  };
})();
