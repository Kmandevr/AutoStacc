// An event's page (/<creator>/<project>/events/<slug>) and a project's events list (/<creator>/<project>/events), the
// same for every creator: title "<title> · <project> · AutoStacc", canonical for trusted creators (else noindex), Open
// Graph and JSON-LD (WebPage + BreadcrumbList, Event with its place and organizer), "Add to calendar" (the .ics file
// and a Google Calendar link, ics.js), and the event card the calendar (calendar.js) and js/events-calendar.js share.
import { esc } from "../sites/text.js";
import { SITE_NAME, SITE_IMAGE, abs, webPage, shell, hero, local, clip, fmtDate, crumbsFor, byline, artistRef, tagList } from "./page.js";
import { eventTimes, googleCalendarUrl, placeOf, countryName } from "./ics.js";

const when = (e) => `<time datetime="${esc(e.date)}">${fmtDate(e.date)}</time>${e.endDate ? ` – <time datetime="${esc(e.endDate)}">${fmtDate(e.endDate)}</time>` : ""}${e.time ? `, ${esc(e.time)}${e.timeZone ? ` <span class="tz">(${esc(e.timeZone.replace(/_/g, " "))})</span>` : ""}` : ""}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// One event as a card (e: content.js publicEvent). heading: its h level; host: also name who hosts it.
export function eventCard(e, { heading = 3, host = true } = {}) {
  const [, m, d] = String(e.date).split("-");
  const by = [e.projectName, e.creatorName && e.creatorName !== e.projectName ? e.creatorName : ""].filter(Boolean).join(" · ");
  return `<article class="ecard">
        <a class="ecard-date" href="${esc(e.path)}" tabindex="-1" aria-hidden="true"><span>${MONTHS[Number(m) - 1] || ""}</span><strong>${Number(d) || ""}</strong></a>
        <div class="ecard-body">
          <h${heading} class="ecard-name"><a href="${esc(e.path)}">${esc(e.title)}</a></h${heading}>
          <p class="ecard-when">${when(e)}</p>
          <p class="ecard-where">${esc(placeOf(e))}</p>
          ${host && by ? `<p class="ecard-by">by ${esc(by)}</p>` : ""}
          ${tagList(e.tags)}
          <div class="ecard-actions"><a class="btn small" href="${esc(e.path)}">Details<span class="sr-only"> of ${esc(e.title)}</span></a>${e.ticketUrl ? `<a class="btn ghost small" href="${esc(e.ticketUrl)}" target="_blank" rel="noopener">Tickets<span class="sr-only"> for ${esc(e.title)}</span></a>` : ""}</div>
        </div>
      </article>`;
}

export const eventCards = (events, opts) => `<ul class="ecards">${events.map((e) => `<li>${eventCard(e, opts)}</li>`).join("")}</ul>`;

const projectImage = (ctx) => (local(ctx.project.image) ? { src: local(ctx.project.image), alt: ctx.project.name } : SITE_IMAGE);

// e: the public event shape (content.js publicEvent).
export function renderEvent(siteUrl, ctx, e) {
  const path = `${ctx.home}/events/${e.id}`;
  const url = abs(siteUrl, path);
  const crumbs = crumbsFor(ctx, "events", [e.title, path]);
  const title = `${e.title} · ${ctx.project.name} · ${SITE_NAME}`;
  const place = placeOf(e);
  const description = clip(e.description || `${e.title}: ${ctx.project.name}${place ? ` at ${place}` : ""}, ${fmtDate(e.date)}.`);
  const t = eventTimes(e);
  const image = projectImage(ctx);
  const page = {
    path, title, description, index: ctx.index, ogType: "website", image,
    schema: [
      webPage(siteUrl, { path, title, description }, url + "#event", crumbs),
      {
        "@type": "Event",
        "@id": url + "#event",
        name: e.title,
        url,
        description,
        startDate: t.start,
        ...(e.endDate && { endDate: e.endDate }),
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: { "@type": "Place", name: e.venue || e.city,
          address: { "@type": "PostalAddress", addressLocality: e.city, ...(e.country && { addressCountry: e.country }) } },
        organizer: artistRef(siteUrl, ctx),
        performer: artistRef(siteUrl, ctx),
        image: abs(siteUrl, image.src),
        ...(e.tags.length && { keywords: e.tags.join(", ") }),
        ...(e.ticketUrl && { offers: { "@type": "Offer", url: e.ticketUrl } })
      }
    ]
  };
  const main = `${hero(crumbs, `Event · ${when(e)}`, e.title, byline(ctx))}

    <section>
      <div class="wrap event">
        ${e.description ? `<p class="lede">${esc(e.description)}</p>` : ""}
        <dl class="facts">
          <dt>When</dt><dd>${when(e)}</dd>
          ${e.venue ? `<dt>Venue</dt><dd>${esc(e.venue)}</dd>` : ""}
          <dt>Where</dt><dd>${esc([e.city, countryName(e.country)].filter(Boolean).join(", "))}</dd>
          <dt>Host</dt><dd><a href="${esc(ctx.home)}">${esc(ctx.project.name)}</a></dd>
        </dl>
        ${tagList(e.tags)}
        <div class="platforms event-actions">
          ${e.ticketUrl ? `<a class="btn" href="${esc(e.ticketUrl)}" target="_blank" rel="noopener">Tickets</a>` : ""}
          <a class="btn ghost" href="${esc(path)}.ics" download="${esc(e.id)}.ics">Add to calendar (.ics)</a>
          <a class="btn ghost" href="${esc(googleCalendarUrl(e, { url }))}" target="_blank" rel="noopener">Add to Google Calendar</a>
        </div>
      </div>
    </section>

    <section class="alt">
      <div class="wrap detail-more">
        ${ctx.lists.events ? `<a class="btn ghost" href="${esc(ctx.home)}/events">All events by ${esc(ctx.project.name)}</a>` : `<a class="btn ghost" href="${esc(ctx.home)}">${esc(ctx.project.name)}</a>`}
        <a class="btn ghost" href="/events">Events calendar</a>
      </div>
    </section>`;
  return shell(siteUrl, ctx, { page, section: "events", styles: ["detail", "events"], main });
}

// A project's events list: what is coming up, soonest first.
export function renderEventList(siteUrl, ctx, events) {
  const path = `${ctx.home}/events`;
  const crumbs = crumbsFor(ctx, "events", null);
  const title = `Events · ${ctx.project.name} · ${SITE_NAME}`;
  const description = clip(`Upcoming events by ${ctx.project.name}: dates, places and tickets, with an "Add to calendar" link for each.`);
  const page = { path, title, description, index: ctx.index, ogType: "website", image: projectImage(ctx),
    schema: [webPage(siteUrl, { path, title, description }, null, crumbs)] };
  const main = `${hero(crumbs, "Events", `${ctx.project.name} events`, "")}

    <section>
      <div class="wrap">
        ${events.length ? eventCards(events, { heading: 2, host: false }) : `<p class="empty">No events coming up yet.</p>`}
        <p class="detail-more"><a class="btn ghost" href="/events">Events calendar</a></p>
      </div>
    </section>`;
  return shell(siteUrl, ctx, { page, section: "events", styles: ["detail", "events"], main, bodyPage: "events-list" });
}
