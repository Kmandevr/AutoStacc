// Tour dates, a drop-in for any [data-shows] element: a project's upcoming shows (data/shows.js, soonest first), plus
// event structured data for shows with tickets. data-project picks the project (default: the open project's). Outside
// the project's pages it wears the project's look. Needs data/site.js, data/projects.js, data/shows.js and js/util.js.
(function () {
  "use strict";

  const { escapeHTML, parseDate, fmtDate, isSet, jsonLd, moduleProject, wear } = window.GS;
  const boxes = [...document.querySelectorAll("[data-shows]")];
  if (!boxes.length) return;
  // Drafts are placeholders, never shown or announced.
  const SHOWS = (window.SHOWS || []).filter((s) => !s.draft);
  const PROJECTS = window.PROJECTS || [];
  const SITE = window.SITE || {};
  const announced = new Set(); // each project's events go into the page's structured data once

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  boxes.forEach((el) => {
    const id = moduleProject(el);
    const PROJECT = PROJECTS.find((p) => p.id === id) || {};
    const upcoming = SHOWS.filter((s) => s.project === id && parseDate(s.date) >= today).sort(
      (a, b) => parseDate(a.date) - parseDate(b.date)
    );
    wear(el, id);
    el.innerHTML = upcoming.length
      ? upcoming
          .map(
            (s) => `
      <div class="show">
        <time datetime="${escapeHTML(s.date)}">${fmtDate(s.date, { month: "short", day: "numeric" }).toUpperCase()}</time>
        <div class="where"><strong>${escapeHTML(s.city)}</strong><span>${escapeHTML(s.venue)}</span></div>
        ${
          s.ticketUrl
            ? `<a class="btn" href="${escapeHTML(s.ticketUrl)}" target="_blank" rel="noopener">Tickets</a>`
            : `<span class="btn" aria-disabled="true">Tickets soon</span>`
        }
      </div>`
          )
          .join("")
      : `<p class="empty shows-empty">No upcoming shows. Check back soon.</p>`;

    // Search engines can list shows under the artist. Only shows with a ticket link are announced,
    // so unconfirmed dates never reach Google.
    const ticketed = upcoming.filter((s) => isSet(s.ticketUrl));
    if (!ticketed.length || announced.has(id)) return;
    announced.add(id);
    jsonLd(
      ticketed.map((s) => ({
        "@context": "https://schema.org",
        "@type": "MusicEvent",
        name: `${PROJECT.name} live in ${s.city}`,
        startDate: s.date,
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: { "@type": "Place", name: s.venue, address: s.city },
        performer: { "@type": PROJECT.entity || "MusicGroup", name: PROJECT.name, url: SITE.url + window.GS.projectPath(PROJECT.id) },
        offers: { "@type": "Offer", url: s.ticketUrl }
      }))
    );
  });
})();
