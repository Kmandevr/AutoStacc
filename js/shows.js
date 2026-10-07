// Renders upcoming tour dates on the home page, plus event structured data for shows with tickets. Needs data/site.js, data/shows.js and js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, parseDate, fmtDate, isSet, jsonLd } = window.GS;
  // Drafts are placeholders, never shown or announced.
  const SHOWS = (window.SHOWS || []).filter((s) => !s.draft);
  const SITE = window.SITE || {};

  const el = $("#show-list");
  if (!el) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = SHOWS.filter((s) => parseDate(s.date) >= today).sort(
    (a, b) => parseDate(a.date) - parseDate(b.date)
  );
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
  if (ticketed.length) {
    jsonLd(
      ticketed.map((s) => ({
        "@context": "https://schema.org",
        "@type": "MusicEvent",
        name: `${SITE.artist} live in ${s.city}`,
        startDate: s.date,
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: { "@type": "Place", name: s.venue, address: s.city },
        performer: { "@type": "MusicGroup", name: SITE.artist, url: SITE.url },
        offers: { "@type": "Offer", url: s.ticketUrl }
      }))
    );
  }
})();
