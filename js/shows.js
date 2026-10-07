// Renders upcoming tour dates on the home page. Needs data/shows.js and js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, parseDate, fmtDate } = window.GS;
  const SHOWS = window.SHOWS || [];

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
    : `<p class="empty" style="padding:18px 0">No upcoming shows. Check back soon.</p>`;
})();
